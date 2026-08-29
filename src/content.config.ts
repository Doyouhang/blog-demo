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
    topic: z.enum(['blog', 'music', 'reading', 'watching', 'cooking', 'coding']).default('blog'),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

/** 收藏条目：歌、书、影视。加新类型只需扩 kind，页面各取各的。 */
const items = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/items' }),
  schema: ({ image }) =>
    z.object({
      kind: z.enum(['song', 'book', 'movie']),
      title: z.string(),
      creator: z.string(),
      cover: image().optional(),
      // 歌：听到的时间；书 / 影视：看完读完的时间，在读在看的用开始时间
      date: z.coerce.date(),
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

export const collections = { essays, items, moments };
