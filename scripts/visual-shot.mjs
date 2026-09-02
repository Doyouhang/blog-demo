// 视觉回归快照。三种模式：
//   --update        把当前渲染写为基线（tests/visual/baseline/）
//   --check（默认） 与基线逐像素比对，差异 >1% 判失败（本地回归用）
//   --capture-only  只截图到 tests/visual/actual/（CI 上传 artifact 人工对比；
//                   CI 与本地渲染环境字体/抗锯齿不同，不在 CI 做像素比对）
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { at } from './site-base.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.VISUAL_PORT ?? 4355);
// base 只有 scripts/site-base.mjs 一处说了算，那里写着这个坑的来龙去脉
const BASE = at(`http://127.0.0.1:${PORT}`);
const DIR = path.join(ROOT, 'tests', 'visual');
const mode = process.argv[2] ?? '--check';
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';

// 只截首屏（不 fullPage）：基线更稳定，也覆盖最重要的视觉面
const PAGES = [
  ['home', '/'],
  ['blog', '/blog/'],
  ['article', '/blog/astro-github-pages/'],
  ['interests', '/interests/'],
];

const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], {
  cwd: ROOT, stdio: 'ignore', detached: true,
});
const stop = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { /* 已退 */ } };
process.on('exit', stop);
const ready = async () => { try { return (await fetch(BASE + '/')).ok; } catch { return false; } };
for (let i = 0; i < 60 && !(await ready()); i++) await new Promise((r) => setTimeout(r, 300));
if (!(await ready())) { console.error('[visual] preview 没起来'); stop(); process.exit(1); }

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const shots = [];
for (const [name, p] of PAGES) {
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(BASE + p, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    const sub = mode === '--update' ? 'baseline' : 'actual';
    const file = path.join(DIR, sub, `${name}-${scheme}.png`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file });
    shots.push(file);
  }
}
await browser.close();

if (mode !== '--check') {
  console.log(`[visual] ${mode === '--update' ? '基线已更新' : '截图完成'}（${shots.length} 张）`);
  stop();
  process.exit(0);
}

let failed = 0;
for (const file of shots) {
  const baseFile = file.replace(`${path.sep}actual${path.sep}`, `${path.sep}baseline${path.sep}`);
  if (!fs.existsSync(baseFile)) {
    console.error(`[visual] ❌ 缺基线 ${path.basename(baseFile)}（先跑 npm run test:visual:update）`);
    failed++;
    continue;
  }
  const a = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(baseFile).raw().toBuffer({ resolveWithObject: true });
  if (a.data.length !== b.data.length) {
    console.error(`[visual] ❌ ${path.basename(file)} 尺寸不一致`);
    failed++;
    continue;
  }
  let diff = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      Math.abs(a.data[i] - b.data[i]) > 24 ||
      Math.abs(a.data[i + 1] - b.data[i + 1]) > 24 ||
      Math.abs(a.data[i + 2] - b.data[i + 2]) > 24
    ) diff++;
  }
  const ratio = diff / (a.data.length / 4);
  const ok = ratio < 0.01;
  if (!ok) failed++;
  console.log(`[visual] ${ok ? '✅' : '❌'} ${path.basename(file)} 差异 ${(ratio * 100).toFixed(2)}%`);
}
stop();
process.exit(failed ? 1 : 0);
