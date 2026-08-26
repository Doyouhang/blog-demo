// 兴趣的唯一数据源：首页卡片和兴趣列表页都从这里读，避免两处各写一份。
import type { IconName } from '../components/icons';

export interface Interest {
  icon: IconName;
  slug: string;
  title: string;
  desc: string;
  /** 首页只展示一部分，标记为 true 的会出现在首页 */
  featured?: boolean;
  tags: string[];
}

export const interests: Interest[] = [
  {
    icon: 'camera', slug: 'photography', title: '摄影', featured: true,
    desc: '喜欢扫街和风光，器材是富士 X 系列。',
    tags: ['街头', '风光', '胶片模拟'],
  },
  {
    icon: 'book', slug: 'reading', title: '读书', featured: true,
    desc: '偏社科、历史和科幻，今年目标是 24 本。',
    tags: ['非虚构', '科幻'],
  },
  {
    icon: 'compass', slug: 'travel', title: '旅行', featured: true,
    desc: '走过川西、云南和东南亚，最爱小城慢生活。',
    tags: ['国内', '东南亚'],
  },
  {
    icon: 'code', slug: 'coding', title: '代码', featured: true,
    desc: '业余写点小工具，最近在玩 Astro 和自动化。',
    tags: ['前端', '自动化'],
  },
  {
    icon: 'pot', slug: 'cooking', title: '下厨',
    desc: '周末喜欢研究面食和家常菜。',
    tags: ['面食', '家常'],
  },
  {
    icon: 'headphones', slug: 'music', title: '音乐',
    desc: '从后摇到 city pop，写代码时循环播放。',
    tags: ['后摇', 'City Pop'],
  },
  {
    icon: 'chart', slug: 'stocks', title: '股票',
    desc: '盯一盯 A 股自选股，行情由构建流水线定时刷新。',
    tags: ['A股', '自选股', '定时刷新'],
  },
];

export const featuredInterests = interests.filter((i) => i.featured);
