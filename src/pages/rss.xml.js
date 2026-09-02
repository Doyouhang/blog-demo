// RSS 订阅：长文 + 闪念合流成一份 feed，阅读器定时来取这个文件。
// 用 @astrojs/rss 保证日期格式（RFC 822）与转义合规 —— RSS 阅读器对这些很挑剔。
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE_TITLE, SITE_DESCRIPTION } from '../consts';
import { cstISODate } from '../utils/cst';

const B = import.meta.env.BASE_URL;

// 闪念没有标题：取正文第一行截短当标题
const lead = (text, max = 36) => {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max) + '…' : flat;
};

export async function GET(context) {
  const [essays, sparks] = await Promise.all([
    getCollection('essays', ({ data }) => !data.draft),
    getCollection('sparks', ({ data }) => !data.draft),
  ]);
  const items = [
    ...essays.map((e) => ({
      title: e.data.title,
      description: e.data.description,
      link: `${B}blog/${e.id}/`,
      pubDate: e.data.pubDate,
    })),
    ...sparks.map((s) => ({
      title: `闪念 · ${lead(s.body)}`,
      description: lead(s.body, 140),
      // 闪念页每条有日期锚点，订阅能直接跳到那一条
      link: `${B}sparks/#${cstISODate(s.data.date)}`,
      pubDate: s.data.date,
    })),
  ]
    .sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf())
    .slice(0, 30);
  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    // 频道 link 要带上子路径。context.site 是 https://用户名.github.io，
    // 而项目页真正的首页在 /blog-demo/ —— 直接用 context.site，阅读器里点
    // 「访问网站」会跳到用户页根目录，那是另一个站。条目链接本来就是对的。
    site: new URL(B, context.site).href,
    items: items.map((i) => ({ ...i, link: new URL(i.link, context.site).href })),
  });
}
