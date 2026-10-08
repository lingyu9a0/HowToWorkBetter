import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChapter, readValidatedChapters, readBook } from './book.mjs';

const chapter = { path:'test.md', number:0, entries:1 };
const entry = grade => `# 测试

### 0-01．保存消息

- 评级对象：保存后有记录可查。
- 论证方式：逻辑推理
- 等级：${grade}
- 定级理由：保存文本直接留下内容，不评争议是否减少。
- 原文核对：没有引用外部研究。
`;

test('仅明确的 / 对应不评级，A/B/C 按完整值识别', () => {
  for (const grade of ['A','B','C','/']) assert.equal(parseChapter(entry(grade),chapter).entries[0].grade,grade);
  assert.equal(parseChapter(entry('**A**').replace('- 等级：','- **等级：** '),chapter).entries[0].grade,'A');
});

test('缺失、空值、非法值和前缀相似值都报错', () => {
  assert.throws(()=>parseChapter(entry('A').replace('- 等级：A\n',''),chapter),/等级必须填写一次/);
  for (const grade of ['', 'AA', 'A 优先采用', 'D', '不评级', '／', '**AA**']) {
    assert.throws(()=>parseChapter(entry(grade),chapter),/等级不能为空|非法等级/);
  }
});

test('重复等级、重复编号和编号不对应都会报错', () => {
  assert.throws(()=>parseChapter(entry('A').replace('- 等级：A','- 等级：A\n- 等级：/'),chapter),/等级必须填写一次/);
  assert.throws(()=>parseChapter(entry('A')+'\n'+entry('B'),{...chapter,entries:2}),/重复条目/);
  assert.throws(()=>parseChapter(entry('A').replace('0-01','1-01'),chapter),/编号与章节不对应/);
});

test('没有写评级对象、理由或核对状态不能生成', () => {
  for (const field of ['评级对象','定级理由','原文核对','论证方式']) {
    assert.throws(()=>parseChapter(entry('A').replace(new RegExp(`^- ${field}：.*\\n`,'m'),''),chapter),new RegExp(field));
  }
});

test('九章和所有下载入口共用校验，实际正文有 398 个独立条目', () => {
  const chapters=readValidatedChapters(), entries=chapters.flatMap(c=>c.entries);
  assert.equal(chapters.length,9);
  assert.equal(entries.length,398);
  assert.equal(new Set(entries.map(e=>e.id)).size,398);
  assert.equal(readBook().bookFiles.length,9);
});
