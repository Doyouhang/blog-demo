// 构建时抓取大盘复盘数据（东方财富免费接口），写入 src/data/market.json
//
// 和 fetch-stocks.mjs 同一套约定：**这个脚本不会让构建失败**，抓不到就沿用上一份。
//
// 关于「市场宽度」的口径，踩过的坑记在这里：
// 东财 clist 接口的 pz 有硬上限 100，想按个股统计全市场涨跌家数就得翻 54 页，
// 请求太密必被限流。行业板块自带 f104/f105（板块内涨跌家数），但 496 个板块里
// 一级和细分并存，同一只股票被重复归类 —— 加总出来 16878 只，是实际的三倍多，不能用。
// 所以这里用**板块级宽度**：496 个细分行业里有多少个收红，口径自洽，
// 也比个股家数更能看出「热点是普涨还是只集中在几个方向」。
//
// 板块行情**不走 clist**。clist 翻五页的请求密度会稳定触发限流（实测触发后
// 连打三分钟都不恢复，脚本内重试跨不过这个窗口），线上因此长期抓不到板块。
// 改成：板块清单固化在 src/data/sectors.list.json（半年也未必变一次，
// 用 npm run refresh:sectors 手动刷），构建期用 ulist.np 按清单一次批量取 ——
// 496 个 secid 一条 URL 拿全，走的是自选股和指数一直在用、没出过问题的那个接口。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { toArray, rowsToSectors, moodOf, summarize, reason } from './market-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(here, '../src/data/market.json');
const listPath = path.join(here, '../src/data/sectors.list.json');

const TIMEOUT_MS = 20000;
const ATTEMPTS = 3;
const PAGE_GAP_MS = 1500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 关注的指数。北证50 放最后，它经常和主板背离，单独看有意思
const INDICES = [
  { secid: '1.000001', name: '上证指数' },
  { secid: '0.399001', name: '深证成指' },
  { secid: '0.399006', name: '创业板指' },
  { secid: '1.000688', name: '科创50' },
  { secid: '0.899050', name: '北证50' },
  { secid: '100.HSI', name: '恒生指数' },
];

async function getJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchIndices() {
  const secids = INDICES.map((i) => i.secid).join(',');
  const body = await getJson(
    'https://push2.eastmoney.com/api/qt/ulist.np/get' +
      `?secids=${encodeURIComponent(secids)}&fields=f2,f3,f4,f6,f12,f13,f14&fltt=2`
  );
  const bySecid = new Map(toArray(body).map((d) => [`${d.f13}.${d.f12}`, d]));
  const rows = INDICES.map((i) => {
    const d = bySecid.get(i.secid);
    if (!d || !Number.isFinite(Number(d.f2))) return null;
    return {
      name: i.name,
      price: Number(d.f2),
      change: Number(d.f4),
      percent: Number(d.f3),
      // 沪深指数的成交额就是各自市场的成交额；恒生的口径不同，不参与两市合计
      amount: Number(d.f6) || 0,
      market: i.secid.startsWith('100.') ? 'HK' : 'CN',
    };
  }).filter(Boolean);
  if (rows.length === 0) throw new Error('指数全部没拿到');
  return rows;
}

// 清单读不出来是配置问题，不是网络抖动 —— 重试三次只会把同一条错刷三遍、白等六秒。
// 所以在进重试之前先读，读不到就直接把板块这一半标记为不可用。
function readSectorList() {
  try {
    const list = JSON.parse(readFileSync(listPath, 'utf8'));
    if (!Array.isArray(list) || list.length === 0) throw new Error('清单是空的');
    return list;
  } catch (e) {
    console.warn(`[market] 板块清单不可用：${e.message}`);
    console.warn('[market] 跑 npm run refresh:sectors 生成它。这次先只出指数。');
    return null;
  }
}

async function fetchSectors(list) {
  const body = await getJson(
    'https://push2.eastmoney.com/api/qt/ulist.np/get' +
      `?secids=${list.map((s) => s.secid).join(',')}&fields=f3,f12,f13,f14&fltt=2`
  );
  const sectors = rowsToSectors(toArray(body), list);
  // 清单里的板块几乎不会停牌，缺一大截就不是「个别没数据」，
  // 而是接口没给全或清单过期了 —— 那种情况下算出来的宽度会凭空少掉一块，
  // 页面上却看不出任何异常，所以宁可当失败处理，沿用旧数据。
  if (sectors.length < list.length * 0.8) {
    throw new Error(`板块只拿到 ${sectors.length}/${list.length} 个，数据不完整`);
  }
  return sectors;
}

function readPrevious() {
  if (!existsSync(outPath)) return null;
  try {
    const prev = JSON.parse(readFileSync(outPath, 'utf8'));
    if (!prev?.breadth || !Array.isArray(prev?.indices)) return null;
    // 占位数据不是「上一次抓到的数据」。CI 每次都是全新 checkout，
    // 仓库里躺着的永远是这份 sample —— 把它当历史沿用，页面就会拿着
    // 0 个板块和 1970 年的时间戳装作有数据，而且永远不会自愈。
    if (prev.source === 'sample') return null;
    return prev;
  } catch {
    return null;
  }
}

const write = (data) => writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n', 'utf8');

// 指数和板块现在都走 ulist.np，但仍然分开重试、分开降级 ——
// 一半抓不到不该把另一半能拿到的也一起退回旧数据。
async function withRetry(label, fn) {
  let lastError = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      console.warn(`[market] ${label} 第 ${attempt}/${ATTEMPTS} 次失败：${reason(e)}`);
      if (attempt < ATTEMPTS) await sleep(2000 * attempt);
    }
  }
  console.warn(`[market] ${label} 放弃：${lastError ? reason(lastError) : '未知原因'}`);
  return null;
}

const previous = readPrevious();

const sectorList = readSectorList();
const indices = await withRetry('指数', fetchIndices);
if (indices && sectorList) await sleep(PAGE_GAP_MS);
const sectors = sectorList ? await withRetry('板块', () => fetchSectors(sectorList)) : null;

// 两边都没拿到、也没有历史数据 → 占位数据，保证页面能构建
if (!indices && !sectors && !previous) {
  write({
    source: 'sample',
    generatedAt: new Date().toISOString(),
    indicesAt: null,
    breadthAt: null,
    stale: true,
    parts: { indices: false, sectors: false },
    temperature: 50,
    mood: moodOf(50),
    breadth: { up: 0, down: 0, flat: 0, total: 0 },
    turnover: 0,
    indices: [],
    leaders: [],
    laggards: [],
  });
  console.warn('[market] 大盘数据全部抓取失败，本地也没有历史数据，先用占位数据构建。');
  process.exit(0);
}

const idxPart = indices ?? previous?.indices ?? [];
const sectorPart = sectors
  ? summarize(sectors)
  : {
      temperature: previous?.temperature ?? 50,
      mood: previous?.mood ?? moodOf(50),
      breadth: previous?.breadth ?? { up: 0, down: 0, flat: 0, total: 0 },
      leaders: previous?.leaders ?? [],
      laggards: previous?.laggards ?? [],
    };

// 两市成交额跟着指数走；恒生口径不同，不计入
const turnover = idxPart
  .filter((i) => i.name === '上证指数' || i.name === '深证成指')
  .reduce((sum, i) => sum + (i.amount || 0), 0);

// 只要有一半用了旧数据就算 stale，页面会挂提示 —— 宁可多提示，不能让人以为是今天的
const stale = !indices || !sectors;
// 哪半边是这次真抓到的。页面据此分区展示：板块没抓到不该把指数一起藏了。
const parts = { indices: !!indices, sectors: !!sectors };

// 两半各记各的时间。共用一个 generatedAt 是不够的：
// 指数新、板块旧的时候，那一个时间戳无论取哪边都会让页面说错话 ——
// 线上就出现过「板块沿用上一次的（时间）」而那个时间正是本次构建的时间。
const nowIso = new Date().toISOString();
const prevAt = (key) => previous?.[key] ?? previous?.generatedAt ?? null;
const indicesAt = indices ? nowIso : prevAt('indicesAt');
const breadthAt = sectors ? nowIso : prevAt('breadthAt');

write({
  source: 'eastmoney',
  // 整卡的时间取两边较新的那个；具体哪半边是什么时候的，看 indicesAt / breadthAt
  generatedAt: [indicesAt, breadthAt].filter(Boolean).sort().pop() ?? nowIso,
  indicesAt,
  breadthAt,
  stale,
  parts,
  ...sectorPart,
  turnover,
  indices: idxPart,
});

const { up, down, flat, total } = sectorPart.breadth;
const breadthText = total > 0
  ? `水温 ${sectorPart.temperature}（${sectorPart.mood.label}） · 板块 ${up}涨/${down}跌/${flat}平`
  : '板块无数据（本次没抓到，也没有可沿用的历史）';
console.log(
  `[market] ${breadthText} · 指数 ${idxPart.length} 个` +
    ` · 两市成交 ${(turnover / 1e12).toFixed(2)} 万亿` +
    (stale ? `  ← 本次抓取：指数${parts.indices ? '成功' : '失败'}/板块${parts.sectors ? '成功' : '失败'}` : '')
);
process.exit(0);
