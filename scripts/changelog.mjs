// 从 git 历史生成 CHANGELOG.md。
//
// 提交信息一直在用 feat:/fix:/docs: 前缀，这里直接拿来分组，不额外引工具。
// 生成的文件是给人看的：只留标题行，正文里那些「为什么这么改」的长篇说明留在 git 里，
// 想看细节 git show 就是了 —— CHANGELOG 塞满长段落反而没人读。
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'CHANGELOG.md');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();

// 分组顺序就是展示顺序：先说新东西，再说修了什么，杂项垫底
const GROUPS = [
  { key: 'feat', label: '新增' },
  { key: 'fix', label: '修复' },
  { key: 'refactor', label: '重构' },
  { key: 'perf', label: '优化' },
  { key: 'content', label: '内容' },
  { key: 'docs', label: '文档' },
  { key: 'chore', label: '杂项' },
  { key: 'test', label: '测试' },
];
const LABEL = Object.fromEntries(GROUPS.map((g) => [g.key, g.label]));

const SEP = '\x1e';
const raw = git('log', `--pretty=format:%H${SEP}%ad${SEP}%s`, '--date=short');
if (!raw) { console.log('[changelog] 没有提交记录'); process.exit(0); }

const commits = raw.split('\n').map((line) => {
  const [hash, date, subject] = line.split(SEP);
  const m = subject.match(/^(\w+)(?:\([^)]*\))?:\s*(.+)$/);
  const type = m && LABEL[m[1]] ? m[1] : 'chore';
  return { hash, short: hash.slice(0, 7), date, type, text: m ? m[2] : subject };
});

// 按日期分节。个人站没有版本号，日期就是最自然的分界。
const byDate = new Map();
for (const c of commits) {
  if (!byDate.has(c.date)) byDate.set(c.date, []);
  byDate.get(c.date).push(c);
}

const repo = (() => {
  try {
    const url = git('remote', 'get-url', 'origin');
    const m = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
    return m ? `https://github.com/${m[1]}` : null;
  } catch { return null; }
})();
const link = (c) => (repo ? `([\`${c.short}\`](${repo}/commit/${c.hash}))` : `(\`${c.short}\`)`);

let md = `# 变更记录

由 \`npm run changelog\` 从 git 历史生成，**不要手动编辑**。
提交信息用 \`feat:\` / \`fix:\` 这类前缀分组；想看某条改动的来龙去脉，点进对应的 commit。

`;

for (const [date, list] of byDate) {
  md += `## ${date}\n\n`;
  for (const g of GROUPS) {
    const items = list.filter((c) => c.type === g.key);
    if (!items.length) continue;
    md += `### ${g.label}\n\n`;
    for (const c of items) md += `- ${c.text} ${link(c)}\n`;
    md += '\n';
  }
}

const prev = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
if (prev === md) { console.log('[changelog] 无变化'); process.exit(0); }
writeFileSync(OUT, md, 'utf8');
console.log(`[changelog] 已生成 ${commits.length} 条提交，跨 ${byDate.size} 天 → CHANGELOG.md`);
