// 内容库的静态检查。这里查的都是「Markdown 悄悄改写了你的排版」那一类 ——
// 构建不报错、页面照样 200，只是显示出来的东西跟你写的不是一回事。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'src', 'content');

function mdFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...mdFiles(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

// frontmatter 之后的正文，且剔掉围栏代码块（里面本来就该有缩进）
function bodyLines(file) {
  const raw = fs.readFileSync(file, 'utf8').split('\n');
  let i = 0;
  if (raw[0]?.trim() === '---') {
    i = 1;
    while (i < raw.length && raw[i].trim() !== '---') i++;
    i++;
  }
  const out = [];
  let fence = false;
  for (; i < raw.length; i++) {
    if (raw[i].trimStart().startsWith('```')) { fence = !fence; continue; }
    if (!fence) out.push([i + 1, raw[i]]);
  }
  return out;
}

test('正文里不能有 4 空格缩进的行', () => {
  // Markdown 把 4 个以上空格的缩进当成「缩进代码块」，于是一段中文点评会被
  // 渲染成深色等宽的代码块，还带横向滚动条 —— 长句直接被切掉看不见。
  // 1984 那篇就踩过：微信读书导出自带 8 个空格的缩进，没人发现，因为构建是绿的。
  const bad = [];
  for (const f of mdFiles(CONTENT)) {
    const lines = bodyLines(f);
    for (let k = 0; k < lines.length; k++) {
      const [no, ln] = lines[k];
      if (!/^ {4,}\S/.test(ln)) continue;
      // 列表项的续行本来就要缩进，放过
      const prev = lines.slice(0, k).reverse().find(([, l]) => l.trim() !== '');
      if (prev && /^\s*([-*+]|\d+[.)])\s/.test(prev[1])) continue;
      bad.push(`${path.relative(ROOT, f)}:${no}`);
    }
  }
  assert.deepEqual(bad, [], '这些行会被当成代码块：\n  ' + bad.join('\n  '));
});
