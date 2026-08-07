// 构建时抓取 A 股自选股行情（东方财富 push2 免费接口，无需 key），写入 src/data/stocks.json
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const watchlistPath = path.join(here, '../src/data/stocks.watchlist.json');
const outPath = path.join(here, '../src/data/stocks.json');

// 东方财富 secid 规则：沪市 1.代码，深市 0.代码
const watchlist = JSON.parse(readFileSync(watchlistPath, 'utf8'));
const secids = watchlist.map((s) => s.secid).join(',');

// f2 最新价 f3 涨跌幅 f4 涨跌额 f12 代码 f13 市场 f14 名称 f15 最高 f16 最低 f18 昨收
// fltt=2：价格直接返回小数
const url =
  'https://push2.eastmoney.com/api/qt/ulist.np/get' +
  `?secids=${encodeURIComponent(secids)}` +
  '&fields=f2,f3,f4,f12,f13,f14,f15,f16,f18&fltt=2';

let body;
try {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) {
    console.error(`[stocks] 东方财富接口返回 HTTP ${res.status}`);
    process.exit(1);
  }
  body = await res.json();
} catch (e) {
  console.error('[stocks] 请求东方财富接口失败：' + e.message);
  process.exit(1);
}

const diff = (body && body.data && body.data.diff) || [];
const bySecid = new Map(diff.map((d) => [`${d.f13}.${d.f12}`, d]));

const rows = watchlist.map((s) => {
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
    currency: 'CNY',
  };
});

const got = rows.filter((r) => r.ok).length;
if (got === 0) {
  console.error('[stocks] 所有股票都没拿到数据，请检查网络或接口是否变更');
  process.exit(1);
}

const out = { source: 'eastmoney', generatedAt: new Date().toISOString(), rows };
writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
console.log(`[stocks] 已更新 ${got}/${rows.length} 条行情 → src/data/stocks.json`);
