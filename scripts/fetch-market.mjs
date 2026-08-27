// 构建时抓取大盘复盘数据（东方财富免费接口），写入 src/data/market.json
//
// 和 fetch-stocks.mjs 同一套约定：**这个脚本不会让构建失败**，抓不到就沿用上一份。
//
// 关于「市场宽度」的口径，踩过坑记在这里：
// 东财 clist 接口的 pz 有硬上限 100，想按个股统计全市场涨跌家数就得翻 54 页，
// 请求太密必被限流。行业板块自带 f104/f105（板块内涨跌家数），但 496 个板块里
// 一级和细分并存，同一只股票被重复归类 —— 加总出来 16878 只，是实际的三倍多，不能用。
// 所以这里用**板块级宽度**：496 个细分行业里有多少个收红。它口径自洽、一次分页拿全，
// 且比个股家数更能反映「热点是普涨还是只集中在几个方向」。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(here, '../src/data/market.json');

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

// clist 的 diff 有时是数组、有时是以下标为键的对象，统一成数组
const toArray = (body) => {
  const d = body?.data?.diff;
  return Array.isArray(d) ? d : Object.values(d ?? {});
};

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

async function fetchSectors() {
  const all = [];
  // 按涨跌幅降序，翻到取不出新数据为止（板块总数会变，别写死页数）
  for (let pn = 1; pn <= 8; pn++) {
    const body = await getJson(
      'https://push2.eastmoney.com/api/qt/clist/get' +
        `?pn=${pn}&pz=100&po=1&fid=f3&fs=m:90+t:2&fields=f3,f12,f14&fltt=2`
    );
    const page = toArray(body);
    all.push(...page);
    if (page.length < 100) break;
    await sleep(PAGE_GAP_MS);
  }
  if (all.length < 50) throw new Error(`板块只拿到 ${all.length} 个，数据不完整`);
  return all
    .map((d) => ({ code: String(d.f12), name: String(d.f14), percent: Number(d.f3) }))
    .filter((d) => Number.isFinite(d.percent));
}

// 水温 = 上涨板块 / (上涨 + 下跌)，平盘不计入分母。
// 50 是多空平衡点，越高说明赚钱效应铺得越开。
function temperatureOf(up, down) {
  const denom = up + down;
  if (denom === 0) return 50;
  return Math.round((up / denom) * 100);
}

const MOODS = [
  { min: 78, key: 'hot', label: '普涨', note: '几乎全线飘红，情绪高位，注意别追高' },
  { min: 62, key: 'warm', label: '偏暖', note: '多数方向在涨，赚钱效应不错' },
  { min: 45, key: 'mixed', label: '分化', note: '涨跌各半，是结构性行情，选股比择时重要' },
  { min: 28, key: 'cool', label: '偏冷', note: '多数方向收绿，缩量观望为主' },
  { min: 0, key: 'cold', label: '普跌', note: '全线走弱，情绪低位' },
];
const moodOf = (t) => MOODS.find((m) => t >= m.min) ?? MOODS[MOODS.length - 1];

function readPrevious() {
  if (!existsSync(outPath)) return null;
  try {
    const prev = JSON.parse(readFileSync(outPath, 'utf8'));
    return prev?.breadth && Array.isArray(prev?.indices) ? prev : null;
  } catch {
    return null;
  }
}

const write = (data) => writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n', 'utf8');

// 指数走 ulist.np，板块走 clist。实测 clist 的限流严得多（分页请求密），
// 所以两半分开重试、分开降级 —— 板块抓不到不该把能拿到的指数也一起退回旧数据。
async function withRetry(label, fn) {
  let lastError = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      console.warn(`[market] ${label} 第 ${attempt}/${ATTEMPTS} 次失败：${e.message}`);
      if (attempt < ATTEMPTS) await sleep(2000 * attempt);
    }
  }
  console.warn(`[market] ${label} 放弃：${lastError?.message ?? '未知原因'}`);
  return null;
}

function summarize(sectors) {
  const up = sectors.filter((s) => s.percent > 0).length;
  const down = sectors.filter((s) => s.percent < 0).length;
  const flat = sectors.length - up - down;
  const temperature = temperatureOf(up, down);
  const byPercent = [...sectors].sort((a, b) => b.percent - a.percent);
  return {
    temperature,
    mood: moodOf(temperature),
    breadth: { up, down, flat, total: sectors.length },
    leaders: byPercent.slice(0, 3),
    laggards: byPercent.slice(-3).reverse(),
  };
}

const previous = readPrevious();

const indices = await withRetry('指数', fetchIndices);
if (indices) await sleep(PAGE_GAP_MS);
const sectors = await withRetry('板块', fetchSectors);

// 两边都没拿到、也没有历史数据 → 占位数据，保证页面能构建
if (!indices && !sectors && !previous) {
  write({
    source: 'sample',
    generatedAt: new Date().toISOString(),
    stale: true,
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

write({
  source: 'eastmoney',
  // 全新抓到才更新时间戳；部分降级时保留旧时间，免得页面显示「刚更新」却是半新半旧
  generatedAt: stale ? (previous?.generatedAt ?? new Date().toISOString()) : new Date().toISOString(),
  stale,
  ...sectorPart,
  turnover,
  indices: idxPart,
});

const { up, down, flat } = sectorPart.breadth;
console.log(
  `[market] 水温 ${sectorPart.temperature}（${sectorPart.mood.label}）` +
    ` · 板块 ${up}涨/${down}跌/${flat}平 · 指数 ${idxPart.length} 个` +
    ` · 两市成交 ${(turnover / 1e12).toFixed(2)} 万亿` +
    (stale ? `  ← 部分沿用旧数据（指数${indices ? '新' : '旧'}/板块${sectors ? '新' : '旧'}）` : '')
);
process.exit(0);
