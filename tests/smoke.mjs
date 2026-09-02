import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

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
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()} @${m.location()?.url ?? '?'}`); });

await page.goto(BASE + '/', { waitUntil: 'networkidle' });
ok('首页加载', await page.title() === '迩迩的小站', await page.title());

// 1. 首页兴趣卡片是深链，不是列表页
const cards = await page.$$eval('.int-row a.int-cell', (els) => els.map((e) => e.getAttribute('href')));
ok('首页兴趣全展示（无「查看全部」）', cards.length === 6, cards.length + ' 个');
ok('首页兴趣卡片深链', cards.every((h) => /\/interests\/\w+\/$/.test(h ?? '')), cards[0] ?? '');
const sideBoxes = await page.$$eval('.side-box h2', (els) => els.map((e) => e.textContent?.trim()));
ok('首页侧栏「此刻」+ 行情', sideBoxes.length === 2, sideBoxes.join(' / '));

// 「最近更新」是四种内容合的流。只放长文的话，首页只有在写长文的时候才会动，
// 而长文恰恰是最不常写的 —— 所以这里要的是「类型不止一种」，不是「有内容」。
const updKinds = await page.evaluate(() =>
  [...new Set([...document.querySelectorAll('.upd-tag')].map((e) => e.textContent.trim()))]);
ok('首页最近更新是混流', updKinds.length >= 3, updKinds.join('/'));
// 改版前首页一张图都没有 —— 封面和照片全在别的页面上
const homeImgs = await page.evaluate(() =>
  [...document.querySelectorAll('img')].filter((i) => i.naturalWidth > 0).length);
ok('首页有真图（封面 / 照片）', homeImgs >= 3, homeImgs + ' 张');
// 收藏条目关联的长文不该再单独占一行 —— 《奥德赛》和它的观后感是同一件事，
// 并排出现时连摘要都一模一样。这里用「摘要不重复」当代理，因为页面上看不到关联关系。
const updNotes = await page.evaluate(() =>
  [...document.querySelectorAll('.upd-note')].map((e) => e.textContent.trim()).filter(Boolean));
ok('最近更新里没有同一条内容出现两次', new Set(updNotes).size === updNotes.length,
  updNotes.length + ' 条摘要');
// 没有封面的那一格是纯纹理。它旁边的标签已经写明了类型，所以这里
// 不该再有任何文字 —— 上一版在里面放汉字，和标签重复，看着也乱
const marks = await page.evaluate(() => {
  const els = [...document.querySelectorAll('.upd-mark')];
  return {
    n: els.length,
    hidden: els.every((e) => e.getAttribute('aria-hidden') === 'true'),
    drawn: els.every((e) => {
      const svg = e.querySelector('svg');
      // set:html 拼错、或者 SVG 被当成文本转义掉，元素照样在，只是空的 ——
      // 所以要量到「里面真有画的东西」这一层
      return !!svg && svg.querySelectorAll('path, rect, circle').length >= 2
        && svg.getBoundingClientRect().width > 10;
    }),
    // 长文和闪念各一枚，画法不同。都退化成同一枚就说明取错了
    kinds: new Set(els.map((e) => e.innerHTML.replace(/\s+/g, ''))).size,
  };
});
ok('无封面的条目显示对应的标记',
  marks.n > 0 && marks.hidden && marks.drawn && marks.kinds === 2,
  `${marks.n} 枚，aria-hidden ${marks.hidden}，画出来 ${marks.drawn}，样式数 ${marks.kinds}`);
// 闪念正文换行之后的部分要出得来：标题是 nowrap 单行，整段塞进去会被省略号吃掉
const sparkRow = await page.evaluate(() => {
  const row = [...document.querySelectorAll('.upd')].find(
    (r) => r.querySelector('.upd-tag')?.textContent.trim() === '闪念' && r.querySelector('.upd-note'));
  return row ? row.querySelector('.upd-note').textContent.trim() : null;
});
ok('多行闪念的第二行会显示在摘要位', sparkRow !== null, sparkRow ?? '（没有多行闪念，跳过判定）');
// 「此刻」不再手写：在读的书由 status=doing 算出来，不会停在某个日期上
const nowText = await page.evaluate(() => document.querySelector('.side-box')?.textContent ?? '');
ok('「此刻」从收藏里算出来', /在读|在看|最近在听|最近拍于/.test(nowText), nowText.slice(0, 40));

// 2. 客户端导航（ClientRouter 生效 = 不发生整页刷新）
await page.evaluate(() => { window.__stillHere = true; });
await page.click(`.nav-links a[href="${at('/interests/')}"]`);
await page.waitForSelector('h1:has-text("兴趣分享")');
const noReload = await page.evaluate(() => window.__stillHere === true);
ok('跨页转场走客户端导航（无整页刷新）', noReload);

// 3. 客户端导航进 demo 页后，脚本仍然初始化（astro:page-load）
await page.click(`a[href="${at('/interests/music/')}"]`);
// 换页后脚本要重新加载执行。钢琴收在折叠彩蛋里，但 data-ready 不该依赖折叠状态 ——
// 脚本进页面就跑，不等 details 打开。所以用 attached 而不是默认的 visible，
// 否则测的是「我点得多快」。
//
// 这里原来用一个 100ms 的墙钟预算来代言那件事（当时实测约 30ms，余量很足）。
// 换主题多了几套字体之后余量没了，它开始在 98~110ms 之间反复横跳 ——
// 那时候它测的已经是机器负载，不是那个不变量了。所以把两件事拆开：
// 超时放宽到能抓住「astro:page-load 根本没触发」，不变量单独断言。
let readyMs = -1;
try {
  const t0 = Date.now();
  await page.waitForSelector('.mini-piano[data-ready="1"]', { timeout: 5000, state: 'attached' });
  readyMs = Date.now() - t0;
} catch { /* 超时则保持 -1 */ }
ok('换页后 demo 会重新初始化', readyMs >= 0, readyMs >= 0 ? readyMs + 'ms' : '5 秒内都没就绪');
const foldStillClosed = await page.evaluate(() =>
  ![...document.querySelectorAll('details')].some((d) => d.open));
ok('demo 初始化不等彩蛋展开', foldStillClosed);
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

// ——— 闪念 ———
await page.goto(BASE + '/sparks/', { waitUntil: 'networkidle' });
ok('闪念页可访问', (await page.title()).includes('闪念'), await page.title());
const jots = await page.locator('.jot').count();
ok('闪念有内容', jots > 20, `${jots} 条`);
// global.css 里有一个同名的 .spark（首页股票迷你柱：flex + 固定 44px 高）。
// 撞上之后每条被压成 44px，多行的直接叠在一起 —— 页面还是 200，肉眼才看得出来。
// 所以这里量的是真实高度，不是"元素在不在"。
const jotGrows = await page.evaluate(() => {
  const hs = [...document.querySelectorAll('.jot')].map((e) => e.getBoundingClientRect().height);
  return new Set(hs.map(Math.round)).size > 1 && Math.max(...hs) > 60;
});
ok('多行的条目撑得开（没被全局 .spark 压扁）', jotGrows);
// 单个换行在 Markdown 里会被并成空格，但这些断行是作者的语气（诗、清单、引文）
const jotWrap = await page.evaluate(() =>
  [...document.querySelectorAll('.jot .body p')].some(
    (p) => getComputedStyle(p).whiteSpace === 'pre-wrap' && p.textContent.includes('\n')
  )
);
ok('闪念的换行会保留 — pre-wrap', jotWrap);
// 只写了日期的存 T00:00:00+08:00，页面靠这个哨兵只显示日期
const times = await page.locator('.jot .when .t').count();
ok('写了时刻的显示时刻，没写的不显示', times > 0 && times < jots, `${times}/${jots}`);
const foldBefore = await page.locator('details.fold').first().evaluate((e) => e.open);
await page.click('details.fold summary');
const foldAfter = await page.locator('details.fold').first().evaluate((e) => e.open);
ok('超长的那条默认折起、点开能展开', foldBefore === false && foldAfter === true);

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
// 站上还有长文的时候才检查排序。脚手架自带的示例文章是要被删掉的，
// 断言不该因为「他把示例删了」而变红
const post = /\/blog\/[^/]+\/$/;
if (rAstro.some((u) => post.test(u))) {
  ok('第一条是详情页', post.test(rAstro[0] ?? ''), rAstro[0] ?? '');
} else {
  console.log('· 跳过「第一条是详情页」：搜 Astro 没有长文命中，站上大概没有相关长文了');
}

// 中文分词是 Pagefind 的真实风险点（默认按空格切词，中文没有空格）。
// 但查询词要从站上**现有**内容里取 —— 原来这条钉死在示例文章 weekend.md 上，
// 他一删，这条就莫名其妙红了，而搜索本身好好的。
await page.goto(BASE + '/sparks/', { waitUntil: 'networkidle' });
const zhWord = await page.evaluate(() => {
  for (const el of document.querySelectorAll('.jot .body')) {
    const m = (el.textContent ?? '').match(/[\u4e00-\u9fa5]{4,}/);
    if (m) return m[0].slice(0, 4);
  }
  return null;
});
await page.goto(BASE + '/search/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !document.getElementById('q')?.disabled, null, { timeout: 8000 });
if (zhWord) {
  const rZh = await doSearch(zhWord);
  ok('中文能搜到', rZh.some((u) => u.includes('/sparks/')), `${zhWord} → ${rZh[0] ?? '无'}`);
} else {
  console.log('· 跳过「中文能搜到」：闪念页上没取到中文词');
}

// 注意：中文是按词切分的，搜一个长句会匹配到包含其中多数词的页面，那是预期行为。
// 要测「无结果」分支得用真正不存在的字串。
const rNone = await doSearch('zzzzqqqq');
ok('无结果时给提示', rNone.length === 0 && (await page.locator('#state').textContent()).includes('没有'));

// 段落里的硬换行要留住。笔记类文章靠换行断句，Markdown 默认把段落内的单个换行
// 折成空格 —— 奥德赛那 26 行引文会塌成一整段，而构建、控制台、状态码全是正常的。
// 不查 white-space 这个属性值（改成别的写法照样能对），直接量渲染出来有几行。
{
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE + '/blog/', { waitUntil: 'networkidle' });
  const links = await page.evaluate(() =>
    [...new Set([...document.querySelectorAll('a[href]')]
      .map((a) => new URL(a.getAttribute('href'), location.href).pathname)
      .filter((h) => /\/blog\/[^/]+\/$/.test(h) && !h.includes('/blog/tags/')))]);
  let checked = 0;
  const flat = [];
  for (const href of links) {
    await page.goto(new URL(href, BASE).href, { waitUntil: 'networkidle' });
    const r = await page.evaluate(() => {
      const out = [];
      for (const p of document.querySelectorAll('.prose p')) {
        const n = (p.textContent.match(/\n/g) ?? []).length;
        if (!n) continue;
        // 一行有多高，拿同一个段落的行高算，别写死数字
        const lh = parseFloat(getComputedStyle(p).lineHeight);
        // 换行没生效的话，n 个换行会被折成空格，高度就只有折行后的自然行数
        out.push({ breaks: n, rows: Math.round(p.getBoundingClientRect().height / lh) });
      }
      return out;
    });
    checked += r.length;
    // 段落里有 n 个换行，渲染出来至少要有 n+1 行
    if (r.some((x) => x.rows < x.breaks + 1)) flat.push(href);
  }
  ok('正文里的硬换行没被吃掉', checked > 0 && flat.length === 0,
    `带换行的段落 ${checked} 个，塌掉的 ${flat.length}${flat.length ? '：' + flat.join(' ') : ''}`);
}

// 文章左侧的刻度目录：跟随高亮是滚动时算的，断了不会报错，页面照样 200。
{
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + '/blog/astro-github-pages/', { waitUntil: 'networkidle' });
  const n = await page.locator('.toc-rail a').count();
  const heads = await page.locator('.prose h2').count();
  ok('目录刻度和小节一一对应', n > 0 && n === heads, `${n} 条 / ${heads} 个小节`);
  // 每一项都要能跳到真实存在的锚点
  const dead = await page.evaluate(() =>
    [...document.querySelectorAll('.toc-rail a')].filter((a) => !document.getElementById(a.dataset.toc)).length);
  ok('刻度的锚点都能落地', dead === 0, `断的 ${dead}`);
  // 站上开了 scroll-behavior: smooth，必须瞬时滚动再量，否则会量在动画中间
  const hit = await page.evaluate(() => {
    const hs = [...document.querySelectorAll('.prose h2')];
    const want = hs[Math.min(5, hs.length - 1)];
    window.scrollTo({ top: want.getBoundingClientRect().top + scrollY - 40, behavior: 'instant' });
    return want.textContent.trim();
  });
  await page.waitForTimeout(300);
  const cur = await page.evaluate(() =>
    document.querySelector('.toc-rail a[aria-current="true"]')?.textContent.trim() ?? '');
  ok('跟随高亮跟得上', cur === hit, `滚到「${hit}」高亮「${cur}」`);
  // 窄屏没有横向余量，应退回折叠块
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.waitForTimeout(200);
  const railOn = await page.locator('.toc-rail').isVisible();
  const foldOn = await page.locator('.toc-fold').isVisible();
  ok('窄屏退回折叠目录', !railOn && foldOn, `刻度 ${railOn} / 折叠 ${foldOn}`);

  // 章节多的文章（《人类简史》18 章）比矮窗口还高。刻度栏是垂直居中的固定定位，
  // 没有高度上限的话上半截会被顶出屏幕、或者钻进吸顶页眉底下 ——
  // 不是「看不全」，是点不到，而且页面照样 200、控制台一声不吭。
  // 不挑某一篇，所有文章都过一遍：以后加长文不用记得回来改这里。
  await page.setViewportSize({ width: 1280, height: 460 });
  await page.goto(BASE + '/blog/', { waitUntil: 'networkidle' });
  const posts = await page.evaluate(() =>
    [...new Set([...document.querySelectorAll('a[href]')]
      .map((a) => new URL(a.getAttribute('href'), location.href).pathname)
      .filter((h) => /\/blog\/[^/]+\/$/.test(h) && !h.includes('/blog/tags/')))]);
  const unreachable = [];
  for (const href of posts) {
    await page.goto(new URL(href, BASE).href, { waitUntil: 'networkidle' });
    const r = await page.evaluate(() => {
      const rail = document.querySelector('.toc-rail');
      const a = rail?.querySelector('a');
      if (!a) return null;   // 这篇没目录，不适用
      const b = a.getBoundingClientRect();
      // 量「点得到」而不是「在不在 DOM 里」：被页眉盖住时两者结论相反
      return rail.contains(document.elementFromPoint(b.left + 4, b.top + b.height / 2));
    });
    if (r === false) unreachable.push(href);
  }
  ok('矮窗口下每篇文章的目录第一条都点得到',
    posts.length > 0 && unreachable.length === 0,
    `${posts.length} 篇，点不到的 ${unreachable.length}${unreachable.length ? '：' + unreachable.join(' ') : ''}`);

  await page.setViewportSize({ width: 1280, height: 900 });
}

// 代码块里每一种 token 颜色都要够读。github-dark 自带的注释色在 #24292e 上
// 只有 3.05，构建期换成了 #8B949E —— 这里不写死颜色，直接量每种颜色的对比度，
// 换主题、加语言、Shiki 升级都拦得住。
{
  await page.goto(BASE + '/blog/astro-github-pages/', { waitUntil: 'networkidle' });
  const bad = await page.evaluate(() => {
    const lum = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const P = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const bgOf = (x) => { let n = x; while (n) { const c = getComputedStyle(n).backgroundColor;
      if (c && !/rgba\(0, 0, 0, 0\)/.test(c)) return c; n = n.parentElement; } return 'rgb(255,255,255)'; };
    const seen = new Map();
    for (const el of document.querySelectorAll('pre *')) {
      if (el.children.length || !el.textContent.trim()) continue;
      const cs = getComputedStyle(el);
      if (seen.has(cs.color)) continue;
      const a = lum(P(cs.color)), b = lum(P(bgOf(el)));
      const r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      seen.set(cs.color, { r: +r.toFixed(2), sample: el.textContent.trim().slice(0, 14) });
    }
    return [...seen.values()].filter((x) => x.r < 4.5);
  });
  ok('代码块每种颜色都够读（≥4.5）', bad.length === 0,
    bad.length ? bad.map((b) => `${b.r} 「${b.sample}」`).join(' | ') : '全部达标');
}

// 衬线字体是子集自托管的，只收了标题 / 引用块这些真正走衬线的字。
// 将来谁把 var(--font-display) 用到别处，那些字不在子集里就会逐字掉回宋体 ——
// 同一行两种字体，页面照样 200，控制台一声不吭。所以拿真实渲染结果去比对字表。
{
  const subset = new Set(readFileSync(new URL('../src/fonts/subset.txt', import.meta.url), 'utf8'));
  const missing = new Map();
  for (const p of ['/', '/blog/astro-github-pages/', '/about/', '/sparks/']) {
    await page.goto(BASE + p, { waitUntil: 'networkidle' });
    const chars = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('*')) {
        if (el.children.length || !el.textContent.trim()) continue;
        if (!getComputedStyle(el).fontFamily.startsWith('PaperSerif')) continue;
        out.push(el.textContent);
      }
      return out.join('');
    });
    for (const ch of chars) if (!/\s/.test(ch) && !subset.has(ch)) missing.set(ch, p);
  }
  ok('衬线子集没漏字', missing.size === 0,
    missing.size ? [...missing].slice(0, 8).map(([c, p]) => `${c}(${p})`).join(' ') : `字表 ${subset.size} 字`);
}

// RSS：长文 + 闪念合流，阅读器定时来取。
// 用 request 取而不是 page.goto —— 导航到 XML 文档时页面没有 <link rel=icon>，
// 浏览器会去探源站根的 /favicon.ico，而站挂在 /blog-demo/ 下那里是 404，
// 最后那条「无 JS 报错」就被这个 404 带红了。本地 base=/ 时命中 200，测不出来。
const feedRes = await page.request.get(BASE + '/rss.xml');
const feedTxt = feedRes.ok() ? await feedRes.text() : '';
ok('RSS feed 可访问且格式正确', feedRes.ok() && feedTxt.includes('<rss') && feedTxt.includes('<item>'), `status ${feedRes.status()}`);
// 频道 link 少了子路径的话，阅读器里点「访问网站」会跳到用户页根目录。
// 比的是「以 base 结尾」而不是写死域名：feed 里是线上地址，测试跑在本地。
const chanLink = (feedTxt.match(/<channel>[\s\S]*?<link>([^<]+)<\/link>/) ?? [])[1] ?? '';
ok('RSS 频道链接带上了子路径', chanLink.endsWith(PREFIX + '/'), chanLink);
// 闪念在 feed 里是深链到某一条（#日期），锚点断了订阅点进来只会落到页顶
const anchors = [...feedTxt.matchAll(/<link>[^<]*\/sparks\/#([\d-]+)<\/link>/g)].map((m) => m[1]);
await page.goto(BASE + '/sparks/');
const missing = await page.evaluate((ids) => ids.filter((id) => !document.getElementById(id)), anchors);
ok('feed 里闪念的锚点都能落地', anchors.length > 0 && missing.length === 0,
  `${anchors.length} 条，断的 ${missing.length}`);

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
