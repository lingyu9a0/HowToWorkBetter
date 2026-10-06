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
export function readBook() {
  const config = JSON.parse(read('book.json'));
  const readme = read('README.md');
  const directory = readme.indexOf('## 这本书想回答的问题');
  const afterDirectory = readme.indexOf('## 怎么读', directory);
  const contentsMd = readme.slice(directory, afterDirectory);
  const frontMd = readme.slice(afterDirectory).replace(/## 阅读与下载[\s\S]*?(?=\n## |$)/, '');
  return { readme, description:config.promise, frontMd, contentsMd, bookFiles:config.chapters.map(c=>c.path), docFiles:[] };
}
