// 衬线字体子集自托管：扫 src/ 全文用到的字符，从 Noto Serif CJK SC 里子集出 woff2。
// 基础字体缓存到 ~/.cache/blog-demo-fonts（只下一次）；产物写进 src/fonts/ 交给 Vite 打包。
// 失败不阻断构建：仓库里提交着上一版字体，最坏情况回退系统衬线。
// CI 每次构建前自动跑（prebuild），新内容出现新字时线上字体跟着更新。
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(os.homedir(), '.cache', 'blog-demo-fonts');
const BASE = 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Serif/OTF/SimplifiedChinese/NotoSerifCJKsc-';
const WEIGHTS = [
  { file: 'Regular', out: 'paper-serif-regular.woff2' },
  { file: 'Bold', out: 'paper-serif-bold.woff2' },
];

// 字符集 = ASCII + 中文标点 + src/ 全文出现过的字
async function collectText() {
  const chars = new Set();
  const add = (s) => { for (const ch of s) chars.add(ch); };
  add('!"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~ ');
  add('，。、；：？！…—·《》〈〉「」『』【】（）＊＃＆％＋－／＝～￥');
  const walk = async (dir) => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (/\.(md|astro|ts|js)$/.test(e.name)) add(await fs.readFile(p, 'utf8'));
    }
  };
  await walk(path.join(ROOT, 'src'));
  return [...chars].join('');
}

const text = await collectText();
await fs.mkdir(CACHE, { recursive: true });
await fs.mkdir(path.join(ROOT, 'src/fonts'), { recursive: true });
for (const w of WEIGHTS) {
  try {
    const base = path.join(CACHE, `${w.file}.otf`);
    if (!await fs.stat(base).catch(() => null)) {
      process.stdout.write(`[fonts] 下载 ${w.file}…`);
      const res = await fetch(BASE + w.file + '.otf');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await fs.writeFile(base, Buffer.from(await res.arrayBuffer()));
      console.log(' 完成');
    }
    const buf = await subsetFont(await fs.readFile(base), text, { targetFormat: 'woff2' });
    await fs.writeFile(path.join(ROOT, 'src/fonts', w.out), buf);
    console.log(`[fonts] ${w.out} ${(buf.length / 1024).toFixed(0)}KB（${text.length} 字）`);
  } catch (e) {
    console.warn(`[fonts] 跳过 ${w.out}：${String(e).slice(0, 120)}`);
  }
}
