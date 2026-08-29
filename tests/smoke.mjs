import { chromium } from 'playwright-core';

const BASE = process.env.SMOKE_BASE || process.env.BASE_URL || 'http://localhost:4321';
// 页面里的站内链接是带 base 的绝对路径（项目页 base=/blog-demo/）。
// 选择器和断言都得跟着 base 走，否则本地（base=/）全绿、CI（base=/blog-demo/）
// 一个选择器都匹配不到。
const PREFIX = new URL(BASE).pathname.replace(/\/+$/, '');
const at = (p) => PREFIX + p;

// 转场动画期间浏览器用快照层盖住页面，点击落不到真实元素上（约 250ms）。
// 真实用户在这之后才可能点到，所以测试也等它结束。
async function waitInteractive(page, selector) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el;
  }, selector, { timeout: 3000 });
}
const results = [];
const ok = (name, pass, extra = '') =>
  results.push(`${pass ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// 跑到一半抛异常时（选择器超时之类）要把已有结果打出来、把浏览器关掉，
// 否则既看不到进度，chromium 还会留在后台。
let crashed = null;
try {
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(BASE + '/', { waitUntil: 'networkidle' });
ok('首页加载', await page.title() === '迩迩的小站', await page.title());

// 1. 首页兴趣卡片是深链，不是列表页
const cards = await page.$$eval('.int-row a.int-cell', (els) => els.map((e) => e.getAttribute('href')));
ok('首页兴趣全展示（无「查看全部」）', cards.length === 6, cards.length + ' 个');
ok('首页兴趣卡片深链', cards.every((h) => /\/interests\/\w+\/$/.test(h ?? '')), cards[0] ?? '');
const sideBoxes = await page.$$eval('.side-box h2', (els) => els.map((e) => e.textContent?.trim()));
ok('首页侧栏「此刻」+ 行情', sideBoxes.length === 2, sideBoxes.join(' / '));

// 2. 客户端导航（ClientRouter 生效 = 不发生整页刷新）
await page.evaluate(() => { window.__stillHere = true; });
await page.click(`.nav-links a[href="${at('/interests/')}"]`);
await page.waitForSelector('h1:has-text("兴趣分享")');
const noReload = await page.evaluate(() => window.__stillHere === true);
ok('跨页转场走客户端导航（无整页刷新）', noReload);

// 3. 客户端导航进 demo 页后，脚本仍然初始化（astro:page-load）
await page.click(`a[href="${at('/interests/music/')}"]`);
// 换页后脚本要重新加载执行，这里断言它在 100ms 内就绪（实测约 30ms，人眼无感）。
// 钢琴现在收在折叠彩蛋里，但 data-ready 不该依赖折叠状态 —— 脚本进页面就跑，
// 不等 details 打开。所以用 attached 而不是默认的 visible，否则测的是「我点得多快」。
let readyMs = -1;
try {
  const t0 = Date.now();
  await page.waitForSelector('.mini-piano[data-ready="1"]', { timeout: 100, state: 'attached' });
  readyMs = Date.now() - t0;
} catch { /* 超时则保持 -1 */ }
ok('换页后 demo 在 100ms 内完成初始化（不依赖彩蛋是否展开）', readyMs >= 0, readyMs >= 0 ? readyMs + 'ms' : '超过 100ms');
// 交互测试要真能点到，这时才展开
await page.click('details.lab summary');
await waitInteractive(page, '.piano-keys .key.white');
// 只按下不松开：松开会正常清掉 .active，那样测不出绑定有没有生效
const key = page.locator('.piano-keys .key.white').first();
const box = await key.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
const pianoBound = await page.evaluate(() =>
  document.querySelector('.piano-keys .key.white')?.classList.contains('active') ?? false);
// 按住时不能冒出纵向滚动条：.piano 只写 overflow-x 时 overflow-y 会被算成 auto，
// 按键的 translateY(2px) 就会撑出 2px，右侧闪出一条滚动条，整块跟着抖
const pianoNoScroll = await page.evaluate(() => {
  const el = document.querySelector('.piano');
  return el.scrollHeight <= el.clientHeight;
});
await page.mouse.up();
const released = await page.evaluate(() =>
  !(document.querySelector('.piano-keys .key.white')?.classList.contains('active') ?? true));
ok('初始化完成后按琴键有反应', pianoBound);
ok('松开后高亮正常消失', released);
ok('按住琴键不冒出纵向滚动条', pianoNoScroll);

// 4. 键盘可用性：Tab 聚焦 + 空格发声
await page.focus('.piano-keys .key.white');
await page.keyboard.down(' ');
const kbd = await page.evaluate(() =>
  document.querySelector('.piano-keys .key.white')?.classList.contains('active') ?? false);
await page.keyboard.up(' ');
ok('钢琴键盘可操作（空格）', kbd);

// 5. 代码 demo：Worker 沙箱正常输出（含异步）
await page.click(`a[href="${at('/interests/')}"]`);
await page.waitForSelector(`a[href="${at('/interests/coding/')}"]`);
await page.click(`a[href="${at('/interests/coding/')}"]`);
await page.waitForSelector('#run');
await page.click('#run');
await page.waitForFunction(() => (document.getElementById('output')?.textContent ?? '').includes('1 + 2 = 3'), null, { timeout: 5000 });
ok('代码 demo 同步输出', true);
await page.waitForFunction(() => (document.getElementById('output')?.textContent ?? '').includes('一秒后我也来了'), null, { timeout: 5000 });
ok('代码 demo 异步输出不再丢失', true);

// 6. 死循环被超时掐掉，页面没被卡死
await page.fill('#code', 'while (true) {}');
await page.click('#run');
await page.waitForFunction(() => (document.getElementById('output')?.textContent ?? '').includes('执行超时'), null, { timeout: 8000 });
const aliveAfterLoop = await page.evaluate(() => 1 + 1 === 2);
ok('死循环被超时中止且页面存活', aliveAfterLoop);

// 7. 主题切换 + 跨页保持
await page.click('#theme-toggle');
const themeAfterToggle = await page.getAttribute('html', 'data-theme');
await page.click(`.nav-links a[href="${at('/blog/')}"]`);
await page.waitForSelector('h1:has-text("博客")');
const themeAfterNav = await page.getAttribute('html', 'data-theme');
ok('主题切换生效', themeAfterToggle === 'dark' || themeAfterToggle === 'light', String(themeAfterToggle));
ok('主题跨页保持', themeAfterNav === themeAfterToggle, `${themeAfterToggle} -> ${themeAfterNav}`);

// 8. 截图：亮色 / 暗色 / 窄屏
await page.evaluate(() => { localStorage.setItem('theme', 'light'); document.documentElement.dataset.theme = 'light'; });
// ——— 内容型页面（阶段一新增）———
await page.goto(BASE + '/moments/', { waitUntil: 'networkidle' });
ok('时间线页可访问', (await page.title()).includes('此间'), await page.title());
ok('主导航有此间入口', await page.locator(`.nav-links a[href="${at('/moments/')}"]`).count() === 1);
// 示例内容是 draft，线上应为空状态而不是报错
const momentsOk = await page.evaluate(() =>
  !!document.querySelector('.page-head h1') && !document.body.textContent.includes('undefined'));
ok('时间线空状态正常渲染', momentsOk);

await page.goto(BASE + '/interests/music/', { waitUntil: 'networkidle' });
ok('音乐页是歌单而不是钢琴', await page.locator('.split-main .sec-hd h2').first().textContent() === '歌单');
ok('钢琴降为折叠彩蛋', await page.locator('details.lab summary').count() === 1);
const pianoHidden = await page.evaluate(() => {
  const d = document.querySelector('details.lab');
  return d && !d.open;
});
ok('彩蛋默认收起', pianoHidden);

await page.goto(BASE + '/interests/reading/', { waitUntil: 'networkidle' });
ok('读书页彩蛋收在折叠里', await page.locator('details.lab').count() === 1);

// ——— 影视页 ———
await page.goto(BASE + '/interests/watching/', { waitUntil: 'networkidle' });
ok('影视页可访问', (await page.title()).includes('影视'), await page.title());
ok('影视页彩蛋收在折叠里', await page.locator('details.lab').count() === 1);
// 示例内容是 draft，线上片单为空，该出空状态而不是报错或空白
const watchingOk = await page.evaluate(() => {
  // InterestLayout 没有 .page-head（那是 moments 页的布局），直接取 h1
  const h1 = document.querySelector('h1')?.textContent ?? '';
  return h1.includes('影视') && !document.body.textContent.includes('undefined');
});
ok('影视页正常渲染', watchingOk);
// 彩蛋从「想看」里挑片。想看为空时该给提示，不该给一个点了没反应的按钮；
// 非空时该给按钮且点了有结果。断言写成「两者必居其一」而不是写死某一种 ——
// 否则往想看里加一部片子，这条就会莫名其妙变红。
await page.click('details.lab summary');
const pickerState = await page.evaluate(() => {
  const card = document.querySelector('.movie-picker');
  if (!card) return 'no-card';
  return document.getElementById('pick-movie') ? 'has-button' : 'empty-hint';
});
ok('彩蛋状态和片单对得上', pickerState === 'empty-hint' || pickerState === 'has-button', pickerState);
if (pickerState === 'has-button') {
  await page.click('#pick-movie');
  await page.waitForTimeout(200);
  const picked = await page.evaluate(() =>
    !!document.querySelector('#movie .movie-title')?.textContent?.trim());
  ok('点了真能挑出一部', picked);
}

// 合并掉的两个页面不该再构建出来。
// 用独立 page 去撞 404 —— 主 page 上挂着「运行期间无 JS 报错」的 console 收集器，
// 在它身上故意触发 404 会把预期内的错误算成失败。
{
  const probe = await browser.newPage();
  for (const gone of ['/interests/photography/', '/interests/travel/']) {
    const r = await probe.goto(BASE + gone, { waitUntil: 'domcontentloaded' });
    ok(`${gone} 已移除`, r.status() === 404, String(r.status()));
  }
  await probe.close();
}

await page.goto(BASE + '/interests/stocks/', { waitUntil: 'networkidle' });
await page.screenshot({ path: '/tmp/shot-light.png', fullPage: true });
await page.evaluate(() => { localStorage.setItem('theme', 'dark'); document.documentElement.dataset.theme = 'dark'; });
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.screenshot({ path: '/tmp/shot-dark.png', fullPage: true });
const mobile = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
await mobile.goto(BASE + '/interests/', { waitUntil: 'networkidle' });
await mobile.screenshot({ path: '/tmp/shot-mobile.png', fullPage: true });
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
ok('375px 窄屏无横向溢出', !overflow);

// 二次进入同一 demo（模块已执行过）仍要立刻可用
await page.goto(BASE + '/interests/', { waitUntil: 'networkidle' });
await page.click(`a[href="${at('/interests/music/')}"]`);
await page.waitForSelector('.mini-piano[data-ready="1"]', { timeout: 200, state: 'attached' });
await page.click('details.lab summary');
await waitInteractive(page, '.piano-keys .key.white');
const b2 = await page.locator('.piano-keys .key.white').first().boundingBox();
await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
await page.mouse.down();
const again = await page.evaluate(() =>
  document.querySelector('.piano-keys .key.white')?.classList.contains('active') ?? false);
await page.mouse.up();
ok('二次进入 demo 同样可用', again);

// 反复进出不会重复绑定（一次按下只应播一个音）
const bindCount = await page.evaluate(() => {
  let n = 0;
  const k = document.querySelector('.piano-keys .key.white');
  const orig = k.classList.add.bind(k.classList);
  k.classList.add = (...a) => { if (a[0] === 'active') n++; return orig(...a); };
  k.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  return n;
});
ok('没有重复绑定事件', bindCount === 1, `pointerdown 触发 ${bindCount} 次`);

// 长短评要折叠起来，并且换行得保留 —— 光有 pre-wrap 而不折叠的话，
// 一条几百字的影评会把整个片单撑成一条长溜。
// 注意要先回到片单页：上面几步把 page 留在了音乐页，
// 在那儿查 .blurb-fold 永远是 0，整块会被静默跳过（等于白写）。
await page.goto(BASE + '/interests/watching/', { waitUntil: 'networkidle' });
{
  const folds = await page.locator('.blurb-fold').count();
  if (folds > 0) {
    const before = await page.locator('article.item').first().boundingBox();
    await page.locator('.blurb-fold summary').first().click();
    await page.waitForTimeout(200);
    const after = await page.locator('article.item').first().boundingBox();
    ok('长短评默认收起、点开能展开', after.height > before.height,
      `${Math.round(before.height)} → ${Math.round(after.height)}px`);
    const ws = await page.locator('.blurb-fold p.blurb').first()
      .evaluate((el) => getComputedStyle(el).whiteSpace);
    ok('短评里的换行会保留', ws === 'pre-wrap', ws);
  }
}

// ——— 站内搜索 ———
await page.goto(BASE + '/search/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !document.getElementById('q')?.disabled, null, { timeout: 8000 });
ok('搜索索引加载成功', true);

const doSearch = async (q) => {
  await page.fill('#q', '');
  await page.fill('#q', q);
  await page.waitForTimeout(500);
  return page.evaluate(() => [...document.querySelectorAll('.hit')].map((a) => a.getAttribute('href')));
};

const rAstro = await doSearch('Astro');
ok('搜得到文章', rAstro.length > 0, rAstro.length + ' 条');
// 索引页（标签、列表、首页）不该进索引 —— 它们的内容是详情页的重复，
// 会稀释结果还抢排名。以前搜 Astro 第一条弹的是标签页。
const indexPage = new RegExp(`/tags/|${PREFIX}/blog/$|${PREFIX}/interests/$|^${PREFIX}/$`);
ok('结果里没有标签页/列表页', !rAstro.some((u) => indexPage.test(u)), rAstro[0] ?? '');
ok('第一条是详情页', /\/blog\/[^/]+\/$/.test(rAstro[0] ?? ''), rAstro[0] ?? '');

const rZh = await doSearch('周末');
ok('中文能搜到', rZh.some((u) => u.includes('/blog/weekend/')), rZh[0] ?? '');

// 注意：中文是按词切分的，搜一个长句会匹配到包含其中多数词的页面，那是预期行为。
// 要测「无结果」分支得用真正不存在的字串。
const rNone = await doSearch('zzzzqqqq');
ok('无结果时给提示', rNone.length === 0 && (await page.locator('#state').textContent()).includes('没有'));

ok('运行期间无 JS 报错', errors.length === 0, errors.slice(0, 3).join(' | '));

} catch (e) {
  crashed = e;
} finally {
  await browser.close().catch(() => {});
}

console.log('\n' + results.join('\n'));
const failed = results.filter((r) => r.startsWith('❌')).length;
console.log('\n失败项：' + failed);

if (crashed) {
  console.error('\n测试中断：' + (crashed.stack ?? crashed.message));
}

// **退出码必须反映结果。** 原来只打印不退出，永远返回 0 ——
// 挂到 CI 上会永远是绿的，等于没测。
if (failed > 0 || crashed) process.exit(1);
