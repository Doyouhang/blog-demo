// 生成品牌资产：public/og.png（分享预览图）+ public/favicon.ico（旧浏览器兜底）。
// 用本站视觉语言（纸底 / 衬线 / 朱红印章）排一屏截图 —— 比 AI 画图可控，跟主题永远一致。
// 运行：node scripts/gen-assets.mjs
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';

const ogHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; box-sizing:border-box; }
  html,body { width:1200px; height:630px; }
  body {
    background:#f5f3ee; color:#23262b; position:relative; overflow:hidden;
    font-family:"Noto Serif SC","Source Han Serif SC","Noto Serif CJK SC","Songti SC",serif;
  }
  .frame { position:absolute; inset:28px; border:1px solid #ddd7c8; }
  .seal {
    position:absolute; right:76px; top:76px; width:96px; height:96px; border-radius:14px;
    background:#bf3b2b; color:#f7f4ec; transform:rotate(-3deg);
    display:flex; align-items:center; justify-content:center; font-size:54px; font-weight:700;
    box-shadow:inset 0 0 0 3px rgba(247,244,236,.28);
  }
  .wrap { position:absolute; left:96px; top:168px; }
  h1 { font-size:88px; letter-spacing:.02em; font-weight:700; }
  p { margin-top:26px; font-size:30px; color:#6f6b60; letter-spacing:.08em; }
  .url {
    position:absolute; left:96px; bottom:64px;
    font-family:ui-monospace,Menlo,Consolas,monospace; font-size:22px; color:#6f6b60;
  }
  .url b { color:#2f4d7e; font-weight:600; }
</style></head><body>
  <div class="frame"></div>
  <div class="seal">迩</div>
  <div class="wrap"><h1>迩迩的小站</h1><p>读过的书 · 看过的片 · 走过的路</p></div>
  <div class="url">doyouhang.github.io<b>/blog-demo</b></div>
</body></html>`;

// 64×64 印章，截图后包进 ICO 容器
const icoHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; } html,body { width:64px; height:64px; }
  body {
    background:#bf3b2b; display:flex; align-items:center; justify-content:center;
    font-family:"Noto Serif SC","Source Han Serif SC","Noto Serif CJK SC","Songti SC",serif;
    color:#f7f4ec; font-size:36px; font-weight:700;
  }
</style></head><body>迩</body></html>`;

// ICO 容器里直接嵌 PNG（Vista 起合法），免去位图转换
function pngToIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(64, 0); entry.writeUInt8(64, 1); // 宽高（64 直接写实际值）
  entry.writeUInt16LE(1, 4);  // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12); // offset = 6 + 16
  return Buffer.concat([header, entry, png]);
}

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(ogHtml, { waitUntil: 'load' });
await page.screenshot({ path: path.join(ROOT, 'public/og.png') });
console.log('og.png 已生成');

await page.setViewportSize({ width: 64, height: 64 });
await page.setContent(icoHtml, { waitUntil: 'load' });
const png = await page.screenshot({ omitBackground: false });
fs.writeFileSync(path.join(ROOT, 'public/favicon.ico'), pngToIco(png));
console.log('favicon.ico 已生成');
await browser.close();
