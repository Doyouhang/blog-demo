// 兴趣的唯一数据源：首页卡片和兴趣列表页都从这里读，避免两处各写一份。
//
// 摄影与旅行已合并进 /moments/ 时间线（见 docs/superpowers/specs/2026-08-27-…），
// 不在这个列表里 —— 它走主导航，不是「有专门 demo 页的爱好」。
//
// desc 目前是占位文案，换成你自己的话即可，改这里全站生效。
import type { IconName } from '../components/icons';

export interface Interest {
  icon: IconName;
  slug: string;
  title: string;
  desc: string;
  tags: string[];
}

export const interests: Interest[] = [
  {
    icon: 'book', slug: 'reading', title: '读书',
    desc: '读到的书都记在书架上，值得说几句的会单写一篇。',
    tags: ['书架', '读后感'],
  },
  {
    icon: 'headphones', slug: 'music', title: '音乐',
    desc: '循环过的歌攒成歌单，有故事的单独讲。',
    tags: ['歌单', '故事'],
  },
  {
    icon: 'chart', slug: 'stocks', title: '股票',
    desc: '每日大盘复盘和自选股行情，由构建流水线定时刷新。',
    tags: ['大盘复盘', '自选股', '定时刷新'],
  },
  {
    icon: 'code', slug: 'coding', title: '代码',
    desc: '业余写点小工具，这个站本身就是其中之一。',
    tags: ['前端', '自动化'],
  },
  {
    icon: 'pot', slug: 'cooking', title: '下厨',
    desc: '周末研究点家常菜。',
    tags: ['家常'],
  },
];
