import { defineCollection, reference, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * 三种内容类型覆盖全站，代码写一次、各兴趣页共用。
 * 设计文档：docs/superpowers/specs/2026-08-27-content-architecture-design.md
 */

/** 长文：博客、音乐故事、读书感触共用一套。用 topic 区分归属。 */
const essays = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/essays' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    topic: z.enum(['blog', 'music', 'reading', 'watching', 'food', 'coding']).default('blog'),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

/**
 * 收藏条目：歌、书、影视、菜。加新类型只需扩 kind，页面各取各的。
 * 美食分两类：dish 是自己做的，taste 是在外面吃到的 —— 后者才有 place。
 */
const items = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/items' }),
  schema: ({ image }) =>
    z.object({
      kind: z.enum(['song', 'book', 'movie', 'dish', 'taste']),
      title: z.string(),
      creator: z.string(),
      cover: image().optional(),
      // 歌：听到的时间；书 / 影视：看完读完的时间，在读在看的用开始时间；
      // 菜：做的 / 吃到的那天
      date: z.coerce.date(),
      // 只有 taste（旅途尝到的）用得上。自己在家做的不用记地点。
      place: z.string().optional(),
      rating: z.number().min(1).max(5).optional(),
      blurb: z.string(),
      // 书架 / 片单分区用；歌不需要，留空即可
      status: z.enum(['want', 'doing', 'done']).optional(),
      // 关联长文。**只在这一侧存**，长文那边需要时反查 ——
      // 两边都存必然有一天不同步。reference() 让指向不存在的 slug 在构建期就报错。
      essay: reference('essays').optional(),
      draft: z.boolean().default(false),
    }),
});

/**
 * 闪念：一句话、一个念头。**没有 title 也没有 description** —— 正文就是全部，
 * 这是它和 essays 的分界线：撑得起标题的该写成长文，撑不起的落在这里。
 */
const sparks = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/sparks' }),
  schema: z.object({
    // 只写了日期没写时刻的存 T00:00:00+08:00，页面拿整点午夜当"没记时刻"的哨兵
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

/** 图文动态：摄影 + 旅行合并后的时间线。正文就是那一段话，不单独设字段。 */
const moments = defineCollection({
  // 一条动态是一个目录（index.md + 同目录的图），删一条就是删一个目录，
  // 图片和文字始终在一起，编辑器管理起来也简单。
  loader: glob({
    pattern: '**/index.md',
    base: './src/content/moments',
    generateId: ({ entry }) => entry.replace(/\/index\.md$/, ''),
  }),
  schema: ({ image }) =>
    z.object({
      // 优先取 EXIF 的拍摄时间；A7C II 机身无 GPS，place 仍需手填
      date: z.coerce.date(),
      place: z.string().optional(),
      photos: z
        .array(
          z.object({
            src: image(),
            alt: z.string(),
            exif: z
              .object({
                camera: z.string().optional(),
                lens: z.string().optional(),
                focal: z.string().optional(),
                aperture: z.string().optional(),
                shutter: z.string().optional(),
                iso: z.number().optional(),
              })
              .optional(),
          })
        )
        .default([]),
      draft: z.boolean().default(false),
    }),
});

export const collections = { essays, items, moments, sparks };
