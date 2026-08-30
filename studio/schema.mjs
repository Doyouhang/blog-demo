// Studio 的字段描述：表单由它生成。
//
// **这份描述必须和 src/content.config.ts 保持一致。**
// 两处定义不理想，但从 TS + Zod 里反推字段要在运行时解析类型，代价远大于收益。
// 兜底办法是保存后自动跑 astro check —— 对不上会立刻报错，而不是等到构建。
export const TYPES = {
  moments: {
    label: '此间',
    hint: '日常图文，一段话为限。超过就该写成长文。',
    // 一条动态一个目录：index.md 和照片放在一起
    dir: 'src/content/moments',
    entry: 'index.md',
    bodyLabel: '这一段话',
    bodyRequired: true,
    fields: [
      { key: 'date', label: '时间', type: 'datetime', required: true, fromExif: true },
      { key: 'place', label: '地点', type: 'text', placeholder: '上海 · 武康路' },
    ],
    photos: true,
  },
  items: {
    label: '收藏',
    hint: '听过的歌、读过的书、看过的片。想细说的另写长文，在这里关联过去。',
    dir: 'src/content/items',
    flat: true,
    bodyLabel: '',
    bodyRequired: false,
    fields: [
      { key: 'kind', label: '类型', type: 'select', required: true,
        options: [{ v: 'book', t: '书' }, { v: 'song', t: '歌' }, { v: 'movie', t: '影视' }] },
      { key: 'title', label: '标题', type: 'text', required: true },
      { key: 'creator', label: '作者 / 歌手 / 导演', type: 'text', required: true },
      { key: 'date', label: '听到 / 读完 / 看完的时间', type: 'date', required: true },
      // 歌没有状态一说；书和影视共用一组，文案写成两边都读得通的
      { key: 'status', label: '状态', type: 'select', onlyWhen: { kind: ['book', 'movie'] },
        options: [{ v: '', t: '（不填，按已完成算）' }, { v: 'doing', t: '在读 / 在看' },
                  { v: 'done', t: '读完 / 看完' }, { v: 'want', t: '想读 / 想看' }] },
      { key: 'rating', label: '评分', type: 'rating' },
      // 这段文字是短评还是长文。**transient：只影响表单，不写进 md** ——
      // 当前是哪种模式由「有没有关联长文」反推得出，多存一个字段就多一处会不同步的地方。
      { key: 'noteMode', label: '这段文字', type: 'select', transient: true,
        options: [{ v: 'blurb', t: '短评（写在卡片上）' },
                  { v: 'essay', t: '长文（单独成篇，卡片上给链接）' }] },
      { key: 'blurb', label: '一句话（卡片上显示）', type: 'textarea', required: true, rows: 2 },
      { key: 'noteTitle', label: '长文标题', type: 'text', transient: true,
        onlyWhen: { noteMode: 'essay' }, placeholder: '留空就用《标题》观后' },
      { key: 'noteBody', label: '正文（Markdown）', type: 'textarea', transient: true,
        onlyWhen: { noteMode: 'essay' }, rows: 14, required: true },
      // 只在短评模式下露出来（用来手动挂一篇已经写好的长文）。
      // 长文模式下这个字段由系统填，露出来让人手改必然打架。
      { key: 'essay', label: '关联长文', type: 'ref', refTo: 'essays',
        onlyWhen: { noteMode: 'blurb' } },
    ],
    cover: true,
  },
  essays: {
    label: '长文',
    hint: '博客、音乐故事、读书感触，用「归属」区分。',
    dir: 'src/content/essays',
    flat: true,
    bodyLabel: '正文（Markdown）',
    bodyRequired: true,
    fields: [
      { key: 'title', label: '标题', type: 'text', required: true },
      { key: 'description', label: '一句话简介', type: 'textarea', required: true, rows: 2 },
      { key: 'pubDate', label: '发布日期', type: 'date', required: true },
      { key: 'topic', label: '归属', type: 'select', required: true,
        options: [{ v: 'blog', t: '博客' }, { v: 'music', t: '音乐' }, { v: 'reading', t: '读书' },
                  { v: 'watching', t: '影视' }, { v: 'cooking', t: '下厨' }, { v: 'coding', t: '代码' }] },
      { key: 'tags', label: '标签', type: 'tags' },
    ],
  },
};

/** 草稿标记所有类型都有，不用每份都写一遍 */
export const DRAFT_FIELD = { key: 'draft', label: '存为草稿（线上不显示）', type: 'bool' };
