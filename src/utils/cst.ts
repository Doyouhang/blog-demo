/**
 * 站里的时间一律按北京时间算。
 *
 * 构建可能跑在 UTC 的 runner 上，而 Date 的 getFullYear() / toLocaleDateString()
 * 用的是机器时区 —— 一条 `2025-01-01T00:00:00+08:00` 的记录在 UTC 下会变成
 * 2024-12-31，年度归档直接进错桶。所以格式化必须显式指定时区，不能靠环境。
 */
const TZ = 'Asia/Shanghai';

// hourCycle 要显式写 h23：hour12:false 在部分实现下午夜会给出 "24" 而不是 "00"
const FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

type Part = 'year' | 'month' | 'day' | 'hour' | 'minute';

function parts(d: Date): Record<Part, number> {
  const out = {} as Record<Part, number>;
  for (const p of FMT.formatToParts(d)) {
    if (p.type !== 'literal') out[p.type as Part] = Number(p.value);
  }
  return out;
}

/** 北京时间的年份，按年归档用 */
export const cstYear = (d: Date) => parts(d).year;

/** 北京时间的月份，1–12 */
export const cstMonth = (d: Date) => parts(d).month;

/** 「2024 年 1 月」 */
export function cstYearMonth(d: Date): string {
  const p = parts(d);
  return `${p.year} 年 ${p.month} 月`;
}

/** 「1 月 14 日」 */
export function cstMonthDay(d: Date): string {
  const p = parts(d);
  return `${p.month} 月 ${p.day} 日`;
}

/**
 * 「21:49」。整点午夜返回 null —— 只写了日期、没写时刻的记录存成
 * `T00:00:00+08:00`，用它当哨兵，页面上就只显示日期。
 * 真在 0 点整写下一条的概率可以忽略。
 */
export function cstTime(d: Date): string | null {
  const p = parts(d);
  if (p.hour === 0 && p.minute === 0) return null;
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}
