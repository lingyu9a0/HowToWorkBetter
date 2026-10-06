// 把 README + book/*.md + docs/*.md 打成一本 EPUB 3。
// 用法：node tools/epub/build.mjs [输出路径]   默认输出 dist/HowToWorkBetter.epub
// 只依赖 marked；zip 自己写（EPUB 要求 mimetype 第一个且不压缩，通用 zip 库不一定保证）。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, posix } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { Marked, Tokenizer } from 'marked';
import { ROOT, REPO, SITE, TITLE, read, readBook, gitCommit, buildStamp, stripBackLink } from '../lib/book.mjs';

const OUT = resolve(ROOT, process.argv[2] ?? 'dist/HowToWorkBetter.epub');
const RELEASE = `${REPO}/releases/download/book-latest/HowToWorkBetter.epub`;
const BOOK_ID = 'urn:uuid:7c0d1ecf-3b94-4a79-93ca-57a7d3accc9d';
const NOW = new Date();
const COMMIT = gitCommit();

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = html => html.replace(/<[^>]+>/g, '');

// ---------- 从 README 取内容与文件清单 ----------
const book = readBook();
const { description, frontMd, bookFiles, docFiles } = book;
const contentsMd = book.contentsMd.replace(/^## (目录|这本书想回答的问题)/, '# 各节简介');

// ---------- 页面清单 ----------
// 每页：xhtml 文件名、来源 md 的仓库路径（用来解析相对链接）、md 正文
const pages = [
  { file: 'front.xhtml', src: 'README.md', title: '前言', md: `# ${TITLE}\n\n${description}\n\n${frontMd}` },
  { file: 'contents.xhtml', src: 'README.md', title: '各节简介', md: contentsMd },
  ...bookFiles.map((src, i) => ({ file: `ch${String(i + 1).padStart(2, '0')}.xhtml`, src, md: stripBackLink(read(src)) })),
  ...docFiles.map((src, i) => ({ file: `doc${i + 1}.xhtml`, src, md: stripBackLink(read(src)) })),
  { file: 'about.xhtml', src: 'README.md', title: '版本说明', md: aboutMd() },
];
const pageByPath = new Map(pages.map(p => [p.src, p.file]));
pageByPath.set('README.md', 'front.xhtml');

function aboutMd() {
  return `# 版本说明\n\nV1.0。生成于 ${buildStamp()}（北京时间）。\n\n项目仓库：${REPO}\n\n本地资料的链接已在发布副本中改为文字说明。原始导出稿保留。\n\n本书正文采用 [署名—非商业性使用 4.0 国际许可协议（CC BY-NC 4.0）](https://creativecommons.org/licenses/by-nc/4.0/)。Copyright (c) 2026 零玉。`;
}

// ---------- Markdown → XHTML ----------
let current = null; // 正在转换的页
let headingSeq = 0;
const marked = new Marked({ gfm: true });
marked.use({
  // GFM 的裸网址自动链接只在空白处断开，「www.12333.gov.cn网页、手机12333客户端」这种
  // 中文紧贴网址的写法会把后面整串中文都吞进链接，epubcheck 判为非法 URL（RSC-020）。
  // 裸网址里本来就不该有非 ASCII 字符，遇到就截在那里，截下的前半段照常按默认规则建链接。
  tokenizer: {
    url(src) {
      const tok = Tokenizer.prototype.url.call(this, src);
      if (!tok || /^[\x21-\x7e]*$/.test(tok.raw)) return tok;
      return Tokenizer.prototype.url.call(this, tok.raw.match(/^[\x21-\x7e]*/)[0]);
    },
  },
  renderer: {
    heading({ tokens, depth }) {
      const html = this.parser.parseInline(tokens);
      const id = `h${++headingSeq}`;
      current.headings.push({ id, depth, text: plain(html) });
      return `<h${depth} id="${id}">${html}</h${depth}>\n`;
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const t = title ? ` title="${esc(title)}"` : '';
      return `<a href="${esc(rewriteHref(href))}"${t}>${text}</a>`;
    },
    image: () => '',
    html: () => '',
  },
});

function rewriteHref(href) {
  if (/^(https?:|mailto:|#)/.test(href)) return href;
  const [pathPart, hash] = href.split('#');
  const target = posix.normalize(posix.join(posix.dirname(current.src), pathPart));
  const page = pageByPath.get(target);
  if (page) return hash ? `${page}#${hash}` : page;
  const kind = target.endsWith('/') ? 'tree' : 'blob';
  return `${REPO}/${kind}/main/${target}`;
}

function toXhtml(body) {
  return body
    .replace(/<(br|hr)>/g, '<$1/>')
    .replace(/<(img|input)\b([^>]*?)\s*\/?>/g, '<$1$2/>')
    .replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
}

function wrap(title, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN" lang="zh-CN">
<head>
<meta charset="utf-8"/>
<title>${esc(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${body}</body>
</html>
`;
}

for (const p of pages) {
  current = p;
  p.headings = [];
  const body = toXhtml(marked.parse(p.md));
  p.title ??= p.headings[0]?.text ?? p.file;
  p.xhtml = wrap(p.title, `<section epub:type="chapter">\n${body}</section>\n`);
}

// ---------- 导航 ----------
const navItems = pages.map(p => {
  const [first, ...rest] = p.headings;
  const top = first?.depth === 1 ? { href: `${p.file}#${first.id}`, text: p.title } : { href: p.file, text: p.title };
  const subs = (first?.depth === 1 ? rest : p.headings).filter(h => h.depth <= 3).map(h => ({ href: `${p.file}#${h.id}`, text: h.text }));
  return { ...top, subs };
});

const navXhtml = wrap('目录', `<nav epub:type="toc" id="toc">
<h1>目录</h1>
<ol>
${navItems.map(n => `<li><a href="${n.href}">${n.text}</a>${n.subs.length ? `\n<ol>\n${n.subs.map(s => `<li><a href="${s.href}">${s.text}</a></li>`).join('\n')}\n</ol>\n` : ''}</li>`).join('\n')}
</ol>
</nav>
<nav epub:type="landmarks" hidden="hidden">
<ol>
<li><a epub:type="cover" href="cover.xhtml">封面</a></li>
<li><a epub:type="bodymatter" href="${pages[2].file}">正文</a></li>
</ol>
</nav>
`);

let play = 0;
const navPoint = n => `<navPoint id="np${++play}" playOrder="${play}"><navLabel><text>${n.text}</text></navLabel><content src="${n.href}"/>${n.subs?.map(navPoint).join('') ?? ''}</navPoint>`;
const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="zh-CN">
<head>
<meta name="dtb:uid" content="${BOOK_ID}"/>
<meta name="dtb:depth" content="2"/>
<meta name="dtb:totalPageCount" content="0"/>
<meta name="dtb:maxPageNumber" content="0"/>
</head>
<docTitle><text>${TITLE}</text></docTitle>
<navMap>
${navItems.map(navPoint).join('\n')}
</navMap>
</ncx>
`;

// ---------- 封面、OPF、容器 ----------
const coverXhtml = wrap(TITLE, `<div class="cover"><img src="cover.png" alt="${esc(TITLE)}"/></div>\n`);
const modified = NOW.toISOString().replace(/\.\d{3}Z$/, 'Z');
const manifestPages = pages.map(p => `<item id="${p.file.replace('.xhtml', '')}" href="${p.file}" media-type="application/xhtml+xml"/>`);
const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="zh-CN">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="pub-id">${BOOK_ID}</dc:identifier>
<dc:title>${TITLE}</dc:title>
<dc:language>zh-CN</dc:language>
<dc:creator>零玉</dc:creator>
<dc:description>${esc(description)}</dc:description>
<dc:source>${REPO}</dc:source>
<dc:rights>CC BY-NC 4.0 — Copyright (c) 2026 零玉 — https://creativecommons.org/licenses/by-nc/4.0/</dc:rights>
<dc:date>${NOW.toISOString().slice(0, 10)}</dc:date>
<meta property="dcterms:modified">${modified}</meta>
<meta name="cover" content="cover-img"/>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
<item id="cover-img" href="cover.png" media-type="image/png" properties="cover-image"/>
<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
${manifestPages.join('\n')}
</manifest>
<spine toc="ncx">
<itemref idref="cover"/>
${pages.map(p => `<itemref idref="${p.file.replace('.xhtml', '')}"/>`).join('\n')}
</spine>
</package>
`;
const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`;

// ---------- 打 zip ----------
const entries = [
  { name: 'mimetype', data: Buffer.from('application/epub+zip'), store: true },
  { name: 'META-INF/container.xml', data: Buffer.from(container) },
  { name: 'OEBPS/content.opf', data: Buffer.from(opf) },
  { name: 'OEBPS/nav.xhtml', data: Buffer.from(navXhtml) },
  { name: 'OEBPS/toc.ncx', data: Buffer.from(ncx) },
  { name: 'OEBPS/style.css', data: Buffer.from('/*\n' + read('LICENSE-CODE') + '\n*/\n' + read('tools/epub/style.css')) },
  { name: 'OEBPS/cover.png', data: readFileSync(resolve(ROOT, 'og.png')) },
  { name: 'OEBPS/cover.xhtml', data: Buffer.from(coverXhtml) },
  ...pages.map(p => ({ name: `OEBPS/${p.file}`, data: Buffer.from(p.xhtml) })),
];
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, zip(entries));
const entryCount = pages.filter(p => p.file.startsWith('ch')).reduce((n, p) => n + p.headings.filter(h => h.depth === 3 && /^\d+-\d+[．.、\s]/.test(h.text)).length, 0);
console.log(`已生成 ${OUT}：${bookFiles.length} 节 ${entryCount} 条，附录 ${docFiles.length} 篇，${(entries.reduce((n, e) => n + e.data.length, 0) / 1024 | 0)} KB 未压缩`);

function zip(files) {
  const crcTable = new Int32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  const crc32 = buf => {
    let c = -1;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const dosTime = (NOW.getHours() << 11) | (NOW.getMinutes() << 5) | (NOW.getSeconds() >> 1);
  const dosDate = ((NOW.getFullYear() - 1980) << 9) | ((NOW.getMonth() + 1) << 5) | NOW.getDate();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name);
    const data = f.store ? f.data : deflateRawSync(f.data, { level: 9 });
    const method = f.store ? 0 : 8;
    const crc = crc32(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(f.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
