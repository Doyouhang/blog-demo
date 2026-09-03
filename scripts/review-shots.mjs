// 设计评审截图脚本：9 个页面 × 亮/暗 × 桌面/移动
// 用法：node scripts/../review-shots.mjs（在 blog-demo 目录下）
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://localhost:4399';
const OUT = '/tmp/review-shots';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'blog', path: '/blog/' },
  { name: 'article', path: '/blog/奥德赛-note/' },
  { name: 'interests', path: '/interests/' },
  { name: 'reading', path: '/interests/reading/' },
  { name: 'moments', path: '/moments/' },
  { name: 'sparks', path: '/sparks/' },
  { name: 'about', path: '/about/' },
  { name: 'search', path: '/search/' },
];

const MODES = [
  { theme: 'light', themeVal: 'light' },
  { theme: 'dark', themeVal: 'dark' },
];
const VIEWPORTS = [
  { vp: 'desk', width: 1440, height: 900, mobile: false },
  { vp: 'mob', width: 390, height: 844, mobile: true },
];

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});

let count = 0;
for (const p of PAGES) {
  for (const m of MODES) {
    for (const v of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: v.width, height: v.height },
        // 强制主题，避免跟随系统
        colorScheme: m.theme,
        deviceScaleFactor: 1,
      });
      const page = await ctx.newPage();
      try {
        await page.goto(BASE + p.path, { waitUntil: 'networkidle', timeout: 45000 });
      } catch {
        await page.goto(BASE + p.path, { waitUntil: 'load', timeout: 45000 }).catch(() => {});
      }
      // 手动钉住主题（localStorage），覆盖系统偏好
      await page.evaluate((tv) => {
        try { localStorage.setItem('theme', tv); } catch {}
        document.documentElement.dataset.theme = tv;
      }, m.themeVal);
      await page.reload({ waitUntil: 'networkidle', timeout: 45000 }).catch(async () => {
        await page.reload({ waitUntil: 'load', timeout: 45000 }).catch(() => {});
      });
      // 等字体栅格化稳定（上轮教训：不等 fonts.ready 字形抖动）
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      await page.waitForTimeout(400);
      // 整页截图（长图）
      const file = `${OUT}/${p.name}-${v.vp}-${m.theme}.png`;
      await page.screenshot({ path: file, fullPage: true }).catch(() => {
        return page.screenshot({ path: file });
      });
      count++;
      console.log('OK', file);
      await ctx.close();
    }
  }
}
await browser.close();
console.log('DONE', count, 'screenshots');
