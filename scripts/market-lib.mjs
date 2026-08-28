// 大盘复盘的纯逻辑：响应解析、清单对齐、宽度统计、水温分档。
//
// 抽成单独模块是为了能单测 —— fetch-market.mjs 是顶层 await 的脚本，
// import 它就会真的去抓一次数据。

// undici 的 fetch 失败时 e.message 恒为 'fetch failed'，超时 / 被拒 / DNS 全长一个样，
// 真正的原因藏在 e.cause 里。只打印 message 的日志等于什么都没说。
export function reason(e) {
  const chain = [e?.message ?? String(e)];
  for (let c = e?.cause, i = 0; c && i < 3; c = c.cause, i++) {
    const part = [c.name, c.code, c.message].filter(Boolean).join(' ');
    if (part) chain.push(part);
  }
  return chain.join(' ← ');
}

// clist / ulist 的 diff 有时是数组、有时是以下标为键的对象，统一成数组
export const toArray = (body) => {
  const d = body?.data?.diff;
  return Array.isArray(d) ? d : Object.values(d ?? {});
};

// 把 ulist 返回的行按固化清单对齐。
// 名称以接口返回的为准（东财改了名而清单还没刷新时，不至于一直显示旧名），
// 清单里的 name 只作兜底。拿不到涨跌幅的板块直接丢掉，不能当 0% 混进统计。
export function rowsToSectors(rows, list) {
  const bySecid = new Map(rows.map((d) => [`${d.f13}.${d.f12}`, d]));
  return list
    .map((s) => {
      const d = bySecid.get(s.secid);
      const percent = Number(d?.f3);
      if (!Number.isFinite(percent)) return null;
      return { code: s.code, name: String(d.f14 ?? s.name), percent };
    })
    .filter(Boolean);
}

// 水温 = 上涨板块 /（上涨 + 下跌），平盘不计入分母。
// 50 是多空平衡点，越高说明赚钱效应铺得越开。
export function temperatureOf(up, down) {
  const denom = up + down;
  if (denom === 0) return 50;
  return Math.round((up / denom) * 100);
}

export const MOODS = [
  { min: 78, key: 'hot', label: '普涨', note: '几乎全线飘红，情绪高位，注意别追高' },
  { min: 62, key: 'warm', label: '偏暖', note: '多数方向在涨，赚钱效应不错' },
  { min: 45, key: 'mixed', label: '分化', note: '涨跌各半，是结构性行情，选股比择时重要' },
  { min: 28, key: 'cool', label: '偏冷', note: '多数方向收绿，缩量观望为主' },
  { min: 0, key: 'cold', label: '普跌', note: '全线走弱，情绪低位' },
];
export const moodOf = (t) => MOODS.find((m) => t >= m.min) ?? MOODS[MOODS.length - 1];

export function summarize(sectors) {
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
