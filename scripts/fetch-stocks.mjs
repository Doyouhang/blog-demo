// 构建时抓取自选股行情（A股 + 港股，东方财富 push2 免费接口，无需 key），写入 src/data/stocks.json
//
// 重要约定：这个脚本**不会让构建失败**。
// 行情接口是第三方服务，从 GitHub 的海外 runner 上偶尔连不上；
// 一个兴趣页的数据源抖动不该把整个站点（博客、关于页、RSS）一起带下线。
// 抓不到就沿用仓库里已有的数据，并打上 stale 标记让页面显示提示。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const watchlistPath = path.join(here, '../src/data/stocks.watchlist.json');
const outPath = path.join(here, '../src/data/stocks.json');

const ATTEMPTS = 3;
const TIMEOUT_MS = 15000;
const RETRY_DELAY_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// secid 的前缀就是东方财富的市场号：0 深、1 沪、116 港。
// 币种必须跟着市场走 —— 港股报的是港元，混进来按人民币显示就是错数据。
const CURRENCY_BY_MARKET = { 0: 'CNY', 1: 'CNY', 116: 'HKD' };
const currencyOf = (secid) => CURRENCY_BY_MARKET[secid.split('.')[0]] ?? 'CNY';

// 自选清单读不出来是仓库自身的问题，这个才该让构建失败
let watchlist;
try {
  watchlist = JSON.parse(readFileSync(watchlistPath, 'utf8'));
  if (!Array.isArray(watchlist) || watchlist.length === 0) throw new Error('清单为空');
} catch (e) {
  console.error(`[stocks] 读不了自选清单 ${watchlistPath}：${e.message}`);
  process.exit(1);
}

function readPrevious() {
  if (!existsSync(outPath)) return null;
  try {
    const prev = JSON.parse(readFileSync(outPath, 'utf8'));
    return Array.isArray(prev?.rows) && prev.rows.length > 0 ? prev : null;
  } catch {
    return null;
  }
}

// 抓取失败时沿用上一份数据，但**必须按当前清单重排**：
// 旧文件里可能还留着已经从清单删掉的股票，直接沿用会让页面显示早就不看的票。
// 按 secid 对齐后，删掉的自然消失，新加的显示「暂无数据」，等下次抓到再补上。
function alignToWatchlist(prevRows) {
  const bySecid = new Map(prevRows.map((r) => [r.secid, r]));
  return watchlist.map((s) => {
    const old = bySecid.get(s.secid);
    return old?.ok ? { ...old, ...s } : { ...s, ok: false };
  });
}

// f2 最新价 f3 涨跌幅 f4 涨跌额 f12 代码 f13 市场 f14 名称 f15 最高 f16 最低 f18 昨收
// fltt=2：价格直接返回小数
function buildUrl() {
  const secids = watchlist.map((s) => s.secid).join(',');
  return (
    'https://push2.eastmoney.com/api/qt/ulist.np/get' +
    `?secids=${encodeURIComponent(secids)}` +
    '&fields=f2,f3,f4,f12,f13,f14,f15,f16,f18&fltt=2'
  );
}

async function fetchQuotes() {
  const res = await fetch(buildUrl(), {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  const diff = body?.data?.diff ?? [];
  if (!Array.isArray(diff) || diff.length === 0) throw new Error('接口返回了空数据');
  return diff;
}

function toRows(diff) {
  const bySecid = new Map(diff.map((d) => [`${d.f13}.${d.f12}`, d]));
  return watchlist.map((s) => {
    const d = bySecid.get(s.secid);
    const price = d ? Number(d.f2) : NaN;
    if (!d || !Number.isFinite(price)) {
      console.warn(`[stocks] ${s.name}(${s.secid}) 无数据（可能停牌或代码有误）`);
      return { ...s, ok: false };
    }
    return {
      ...s,
      ok: true,
      price,
      change: Number(d.f4),
      percent: Number(d.f3),
      prevClose: Number(d.f18),
      high: Number(d.f15),
      low: Number(d.f16),
      currency: currencyOf(s.secid),
    };
  });
}

function write(data) {
  writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

let lastError = null;
for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  try {
    const rows = toRows(await fetchQuotes());
    const got = rows.filter((r) => r.ok).length;
    if (got === 0) throw new Error('清单里没有一只股票拿到数据');

    write({
      source: 'eastmoney',
      generatedAt: new Date().toISOString(),
      stale: false,
      rows,
    });
    console.log(`[stocks] 已更新 ${got}/${rows.length} 条行情 → src/data/stocks.json`);
    process.exit(0);
  } catch (e) {
    lastError = e;
    console.warn(`[stocks] 第 ${attempt}/${ATTEMPTS} 次抓取失败：${e.message}`);
    if (attempt < ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
  }
}

// 走到这里说明重试都失败了。降级，但绝不让构建挂掉。
const previous = readPrevious();
const alignedRows = previous ? alignToWatchlist(previous.rows) : [];
const reusable = alignedRows.filter((r) => r.ok).length;

if (reusable > 0) {
  write({ ...previous, stale: true, rows: alignedRows });
  console.warn(
    `[stocks] 抓不到行情（${lastError?.message ?? '未知原因'}），` +
      `沿用 ${previous.generatedAt} 的数据继续构建（${reusable}/${alignedRows.length} 条可复用），` +
      '页面会提示数据非最新。'
  );
} else {
  write({
    source: 'sample',
    generatedAt: new Date().toISOString(),
    stale: true,
    rows: watchlist.map((s) => ({ ...s, ok: false })),
  });
  console.warn(
    `[stocks] 抓不到行情（${lastError?.message ?? '未知原因'}），` +
      '本地也没有可用的历史数据，先用占位数据构建。'
  );
}
process.exit(0);
