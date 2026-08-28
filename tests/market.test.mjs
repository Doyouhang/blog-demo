// 大盘复盘纯逻辑的回归测试。
// 这里每一条都对应一种「输出看着正常、数值其实是错的」的坏法 ——
// 板块统计一旦悄悄少算一截，页面上的水温照样是个体面的两位数，没人看得出来。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toArray, rowsToSectors, temperatureOf, moodOf, summarize } from '../scripts/market-lib.mjs';

test('toArray: diff 是对象格式时也要取出来', () => {
  // 东财同一个接口，有时给数组、有时给以下标为键的对象。
  // 只按数组处理的话，对象那次会静默变成 0 个板块 —— 页面显示「没抓到」，
  // 而接口其实是 200 且数据完整。
  assert.equal(toArray({ data: { diff: [{ f12: 'BK1' }] } }).length, 1);
  assert.equal(toArray({ data: { diff: { 0: { f12: 'BK1' }, 1: { f12: 'BK2' } } } }).length, 2);
  assert.deepEqual(toArray({ data: { diff: null } }), []);
  assert.deepEqual(toArray(undefined), []);
});

test('rowsToSectors: 按 secid 对齐，接口没给的板块要丢掉而不是当 0%', () => {
  const list = [
    { secid: '90.BK1432', code: 'BK1432', name: '氮肥' },
    { secid: '90.BK1341', code: 'BK1341', name: '房产租赁经纪' },
  ];
  const rows = [{ f13: 90, f12: 'BK1432', f14: '氮肥', f3: 7.33 }];
  const out = rowsToSectors(rows, list);
  // 缺的那个若被当成 0% 混进来，就会被算作「平盘」，
  // 平盘不进水温分母，却会把 total 撑大 —— 宽度条的比例当场失真。
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { code: 'BK1432', name: '氮肥', percent: 7.33 });
});

test('rowsToSectors: 名称以接口返回的为准，清单里的只兜底', () => {
  const list = [{ secid: '90.BK1432', code: 'BK1432', name: '旧名字' }];
  const rows = [{ f13: 90, f12: 'BK1432', f14: '新名字', f3: 1.2 }];
  assert.equal(rowsToSectors(rows, list)[0].name, '新名字');
});

test('rowsToSectors: 涨跌幅不是数字就丢掉', () => {
  const list = [{ secid: '90.BK1', code: 'BK1', name: 'A' }, { secid: '90.BK2', code: 'BK2', name: 'B' }];
  const rows = [
    { f13: 90, f12: 'BK1', f14: 'A', f3: '-' },   // 东财对没数据的行会给 '-'
    { f13: 90, f12: 'BK2', f14: 'B', f3: 0 },     // 0 是合法的平盘，必须留下
  ];
  const out = rowsToSectors(rows, list);
  assert.deepEqual(out.map((s) => s.code), ['BK2']);
});

test('temperatureOf: 分母为零时不能除出 NaN', () => {
  // 全部平盘（比如春节休市那天）会走到这里。NaN 会一路渗进 JSON，
  // 页面上的水温条 left:NaN% 直接失效。
  assert.equal(temperatureOf(0, 0), 50);
  assert.equal(temperatureOf(10, 0), 100);
  assert.equal(temperatureOf(0, 10), 0);
  assert.equal(temperatureOf(1, 1), 50);
});

test('moodOf: 分档边界取到该取的那档', () => {
  assert.equal(moodOf(78).key, 'hot');
  assert.equal(moodOf(77).key, 'warm');
  assert.equal(moodOf(45).key, 'mixed');
  assert.equal(moodOf(0).key, 'cold');
});

test('summarize: 涨跌平计数与领涨领跌方向', () => {
  const sectors = [
    { code: 'A', name: 'A', percent: 3 },
    { code: 'B', name: 'B', percent: 1 },
    { code: 'C', name: 'C', percent: 0 },
    { code: 'D', name: 'D', percent: -2 },
  ];
  const r = summarize(sectors);
  assert.deepEqual(r.breadth, { up: 2, down: 1, flat: 1, total: 4 });
  assert.equal(r.temperature, 67);
  // 领涨从高到低，领跌从最低往上 —— 写反了页面照样渲染，只是意思全反
  assert.equal(r.leaders[0].code, 'A');
  assert.equal(r.laggards[0].code, 'D');
});

test('summarize: 空数组不炸，给出中性结果', () => {
  const r = summarize([]);
  assert.deepEqual(r.breadth, { up: 0, down: 0, flat: 0, total: 0 });
  assert.equal(r.temperature, 50);
  assert.deepEqual(r.leaders, []);
});
