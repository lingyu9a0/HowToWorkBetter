import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const REPO = 'https://github.com/lingyu9a0/HowToWorkBetter';
export const SITE = 'https://lingyu9a0.github.io/HowToWorkBetter/';
export const TITLE = '21 世纪打工宝典';
export const RELEASE = `${REPO}/releases/download/book-latest`;
export const read = p => readFileSync(resolve(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
export const gitCommit = () => process.env.GITHUB_SHA ?? '';
export const buildStamp = () => new Intl.DateTimeFormat('sv-SE', { timeZone:'Asia/Shanghai', dateStyle:'short', timeStyle:'short' }).format(new Date());
export const stripBackLink = md => md.replace(/^\[← 回总目录\]\([^)]*\)\s*\n/, '');
export function entryField(markdown, name, id) {
  const lines = markdown.split('\n').filter(line => new RegExp(`^-\\s*(?:\\*\\*)?${name}\\s*[：:]`).test(line));
  if (lines.length !== 1) throw new Error(`${id}：${name}必须填写一次，实际 ${lines.length} 次`);
  const value = lines[0].replace(new RegExp(`^-\\s*(?:\\*\\*)?${name}\\s*[：:]\\s*(?:\\*\\*)?\\s*`), '').trim();
  if (!value) throw new Error(`${id}：${name}不能为空`);
  return value;
}
export function parseChapter(source, chapter) {
  const parts = source.split(/(?=^###\s+\d+-\d+[．.、\s])/m);
  const introduction = parts.shift();
  const seen = new Set();
  const entries = parts.map(markdown => {
    const title = markdown.split('\n')[0].replace(/^###\s+/, '');
    const id = title.match(/^\d+-\d+/)?.[0];
    if (!id || Number(id.split('-')[0]) !== chapter.number) throw new Error(`${chapter.path}：条目编号与章节不对应`);
    if (seen.has(id)) throw new Error(`${chapter.path}：重复条目 ${id}`);
    seen.add(id);
    const grade = entryField(markdown, '等级', id).replace(/^\*\*([ABC/])\*\*$/, '$1');
    if (!['A','B','C','/'].includes(grade)) throw new Error(`${id}：非法等级“${grade}”，只允许 A、B、C 或 /`);
    const scope = entryField(markdown, '评级对象', id);
    const reason = entryField(markdown, '定级理由', id);
    const route = entryField(markdown, '论证方式', id);
    const audit = entryField(markdown, '原文核对', id);
    return { id, title, grade, scope, reason, route, audit, markdown };
  });
  if (entries.length !== chapter.entries) throw new Error(`${chapter.path}：预期 ${chapter.entries} 条，实际 ${entries.length} 条`);
  return { ...chapter, introduction, entries };
}
export function readValidatedChapters() {
  const config = JSON.parse(read('book.json'));
  return config.chapters.map(ch => parseChapter(read(ch.path), ch));
}
export function readBook() {
  const chapters = readValidatedChapters();
  const config = JSON.parse(read('book.json'));
  const readme = read('README.md');
  const directory = readme.indexOf('## 这本书想回答的问题');
  const afterDirectory = readme.indexOf('## 怎么读', directory);
  const contentsMd = readme.slice(directory, afterDirectory);
  const frontMd = readme.slice(afterDirectory).replace(/## 阅读与下载[\s\S]*?(?=\n## |$)/, '');
  return { readme, description:config.promise, frontMd, contentsMd, bookFiles:chapters.map(c=>c.path), docFiles:[] };
}
