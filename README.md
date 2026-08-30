# 迩迩的小站（Astro + GitHub Pages）

一个用 [Astro](https://astro.build) 搭建的个人博客 + 兴趣分享页，**静态托管在 GitHub Pages，完全免费**。

> 注：Gitee Pages 已于 2025-06-06 官方下线，本项目改用 GitHub Pages。

## 环境准备

需要 **Node.js 22**（与 GitHub Actions 里的 `node-version: 22` 保持一致）和随附的 npm。

检查当前环境：

```bash
node -v   # 期望 v22.x
npm -v
```

### 安装 Node 22（Ubuntu，无需 sudo）

系统 apt 源里的 nodejs 只有 12.x，太老。下面这种装法把 Node 放在用户目录，不动系统、不需要 root：

```bash
# 1. 取最新的 v22 版本号并下载
VER=$(curl -sS https://nodejs.org/dist/index.json | grep -o '"version":"v22[^"]*"' | head -1 | cut -d'"' -f4)
mkdir -p ~/.local/opt && cd /tmp
curl -fSL -o node.tar.xz https://nodejs.org/dist/$VER/node-$VER-linux-x64.tar.xz

# 2. 解压并用软链固定路径（以后升级只需换这个软链）
tar -xJf node.tar.xz -C ~/.local/opt
ln -sfn ~/.local/opt/node-$VER-linux-x64 ~/.local/opt/node

# 3. 加进 PATH
echo 'export PATH="$HOME/.local/opt/node/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

node -v && npm -v
```

卸载就是 `rm -rf ~/.local/opt/node*` 再把 `~/.bashrc` 里那行删掉。

> 也可以用 [nvm](https://github.com/nvm-sh/nvm)（`nvm install 22`），适合需要在多个 Node 版本之间切换的场景。

### 装依赖

```bash
npm ci        # 按 package-lock.json 精确安装，推荐
# 或 npm install
```

国内网络慢的话可以临时换镜像：

```bash
npm ci --registry=https://registry.npmmirror.com
```

### 环境变量

| 变量 | 作用 | 取值 |
| --- | --- | --- |
| `SITE_BASE` | 站点路径前缀 | 本地开发不用设（默认 `/`）；构建项目页时设为 `/blog-demo/` |

页面里的链接一律用 `import.meta.env.BASE_URL` 拼接，不要写死 `/`，否则线上会 404。

### 完整自检

装完之后跑一遍，确认环境可用：

```bash
npm ci
npm run check                     # 类型检查，应当 0 error
npm run test:unit                 # 纯函数单测，应当全过
npm run fetch:all                 # 抓大盘 + 行情，正常会打印水温和「已更新 12/12 条行情」
SITE_BASE=/blog-demo/ npm run build
```

`dist/` 下出现 `index.html`、`blog/`、`interests/`、`rss.xml` 就说明环境没问题。

注意 `fetch:all` 会改写 `src/data/stocks.json` 和 `src/data/market.json`。这两份是提交进仓库的
「种子数据」—— 只是本地试跑的话，调试完记得还原：

```bash
git checkout -- src/data/stocks.json src/data/market.json
```

真正换了自选股清单、或想把最新快照带进仓库时，才需要连它们一起提交。

## 本地开发

```bash
npm ci           # 首次：安装依赖（详见上面「环境准备」）
npm run dev      # 本地预览，默认 http://localhost:4321
npm run check    # 类型检查（astro check），CI 里也会跑，提交前建议过一遍
npm run build    # 生成静态站点到 dist/（项目页会自动带 /blog-demo/ 前缀）
npm run preview  # 预览构建产物
```

## 目录结构

```
src/
  pages/            # 页面：首页 / 博客 / 兴趣 / 关于
  content/posts/    # 博客文章（写 Markdown 即可）
  layouts/          # 页面布局
  components/       # 头部、底部等组件
  data/
    interests.ts    # 兴趣列表的唯一数据源（首页和兴趣页都读它）
    now.json        # 首页「此刻」的近况条目
    stocks.*.json   # 股票自选清单 + 抓下来的行情快照
    market.json     # 大盘复盘快照（水温 / 指数 / 领涨板块）
    sectors.list.json # 行业板块清单（固化，npm run refresh:sectors 手动刷）
  scripts/init.ts   # 页面脚本初始化助手（跨页转场下的时机问题，见下）
  utils/            # 小工具函数（阅读时长估算等）
  styles/global.css # 全局样式与设计令牌（含暗色主题）
public/             # 静态资源（favicon 等）
scripts/
  fetch-stocks.mjs  # 构建期抓自选股行情
  fetch-market.mjs  # 构建期抓大盘复盘数据
  market-lib.mjs    # 大盘复盘的纯逻辑（清单对齐 / 宽度统计 / 水温分档），有单测
  refresh-sectors.mjs # 刷新行业板块清单，手动跑，不进构建流程
  changelog.mjs     # 从 git 历史生成 CHANGELOG.md
studio/             # 本地图文编辑器（npm run studio），不参与生产构建
tests/              # 单元测试 + 浏览器冒烟测试（npm test）
```

改内容改哪个文件，见下面的「内容维护速查」。

## 主题与动效

- **暗色模式**：默认跟随系统（`prefers-color-scheme`），页头右上角的按钮可以手动切换，选择存在
  `localStorage.theme` 里。颜色全部走 `src/styles/global.css` 顶部的设计令牌，改配色只改那一处。
- **跨页转场**：`BaseLayout` 里引了 Astro 的 `<ClientRouter />`，换页是客户端导航 + View Transitions，
  文章标题和兴趣 emoji 用 `transition:name` 做了共享元素动画。
- **进场揭示**：加了 `class="reveal"` 的元素滚进视口才淡入上浮（`IntersectionObserver`）。
  JS 没跑起来时它们保持可见，不会白屏。
- **阅读进度条**：文章页顶部那条，纯 CSS 滚动驱动（`animation-timeline: scroll()`），
  浏览器不支持就不显示，不用兜底 JS。
- 以上动效全部受 `prefers-reduced-motion: reduce` 管辖，系统开了「减少动态效果」就自动关掉。

### 写页面脚本要注意的一个坑

Astro 的 `<script>` 是 ES module（天然 defer）。开了 `ClientRouter` 之后，换页时脚本会被重新插入
文档并**异步**执行，很可能赶不上这一次导航的 `astro:page-load` —— 直接写
`document.addEventListener('astro:page-load', init)` 会出现「刚进页面那一小会儿交互是死的」。

所以页面脚本统一用 `src/scripts/init.ts` 里的助手：

```ts
import { onPageReady, markReady } from '../../../scripts/init';

function initDemo() {
  const card = document.querySelector<HTMLElement>('.demo-card');
  if (!markReady(card)) return;   // 保证幂等，重复调用直接返回
  // ……绑定事件
}

onPageReady(initDemo);            // 立刻跑一次 + 之后每次 page-load 再跑
```

另外：View Transitions 在转场动画播放期间会用快照层盖住页面，这大约 250ms 内点击落不到真实元素上。
这是该 API 的固有行为，不是 bug。

## 行情数据与构建容错

`scripts/fetch-market.mjs`（大盘复盘）和 `scripts/fetch-stocks.mjs`（自选股行情）在构建前各抓一次
东方财富的免费接口（无需 key），分别写进 `src/data/market.json` 和 `src/data/stocks.json`。
页面直接读这两个 JSON，运行时零外部请求。

**这两个脚本都不会让构建失败。** 行情接口是第三方服务，从 GitHub 的海外 runner 上偶尔连不上；
一个兴趣页的数据源抖动不该把整个站点一起带下线。它的降级顺序是：

1. 抓取失败 → 最多重试 3 次；
2. 仍然失败 → 沿用仓库里已有的 `stocks.json`，打上 `stale: true`，页面顶部显示「不是最新价」提示；
3. 连历史数据都没有 → 写一份占位数据（`source: "sample"`），页面显示「示例数据」提示。

任何一种情况退出码都是 0，站点照常部署。

`fetch-stocks.mjs` 沿用旧数据时还会**按当前清单重排**：从 watchlist 删掉的股票不会再冒出来，
新加的显示「暂无数据」，等下次抓到再补。所以改完清单就算当场抓不到，页面也不会显示错的票。

本地想一次跑完两个：`npm run fetch:all`。

> 东财接口有限流，而且**分接口**：`ulist.np`（指数、自选股、板块行情）很宽松，
> `clist`（分页列表）很严。触发之后会**稳定**返回 `UND_ERR_SOCKET other side closed`，
> 实测连打三分钟都不恢复，容易误判成「接口挂了」或「我的清单写错了」。
> 构建流程已经不碰 `clist` 了（见下面的大盘复盘一节），只有 `npm run refresh:sectors`
> 会用到它 —— 那个脚本正好是手动跑的，撞上限流等几分钟再来即可。
>
> 另外用 curl 手工验证时记得加 `--http1.1`，默认的 HTTP/2 在这个域名上会握手失败
> （Node 的 fetch 默认就是 1.1，不受影响）。还有：undici 的 fetch 失败时 `e.message`
> 恒为 `fetch failed`，超时 / 被拒 / DNS 全长一个样，真正的原因在 `e.cause` 里 ——
> 脚本的日志已经把整条 cause 链打出来了，别只看第一句。

## 分享预览图（可选）

`src/consts.ts` 里的 `OG_IMAGE` 默认为空，此时只输出文字类分享信息。
想要微信 / X 上的大图卡片，放一张 1200×630 的图到 `public/`，然后：

```ts
export const OG_IMAGE = 'og.png';
```

## 内容维护速查

日常更新基本不用碰页面代码，改一个数据文件就行。先按「我想改什么」查表：

| 我想改…… | 改这个文件 |
| --- | --- |
| 站名、作者、分享预览图 | `src/consts.ts` |
| 首页「此刻」在读什么、在听什么 | `src/data/now.json` |
| 兴趣卡片（增 / 删 / 改文案） | `src/data/interests.ts` |
| 自选股清单 | `src/data/stocks.watchlist.json` |
| 发文章、写观后感读后感 | `src/content/essays/*.md` |
| 书架 / 片单 / 歌单的条目 | `src/content/items/*.md`（封面可在 studio 里搜） |
| 「此间」的图文动态 | `src/content/moments/<条目>/` |
| 关于页正文 | `src/pages/about.astro` |
| 配色、圆角、动效时长 | `src/styles/global.css` 顶部的设计令牌 |
| 图标 | `src/components/icons.ts` |

改完本地 `npm run dev` 看一眼，没问题就提交推送，Actions 会自动重新部署。

**不想碰文件的话**：`npm run studio` 起本地图文编辑器，图形界面填字段、拖照片、
一键提交发布。拖进去的照片会自动压缩并读出拍摄时间和相机参数。
收藏那一栏按书 / 音乐 / 影视分组，标题旁边有「按标题匹配信息」，
点一下就把封面和作者一起搜出来。见 [studio/README.md](studio/README.md)。

### 写新文章

在 `src/content/essays/` 新建一个 `.md`，头部写好 frontmatter：

```md
---
title: 文章标题
description: 一句话简介，会显示在列表和分享卡片里
pubDate: 2026-08-03
topic: blog          # blog / music / reading / watching / cooking / coding
tags: ['标签1', '标签2']
draft: false
---

正文用 Markdown 写……
```

- `topic` 决定这篇长文挂在哪儿：`blog` 只进博客列表，其余的会同时出现在对应
  兴趣页的侧栏（比如 `watching` 出现在影视页的「观后感」里）。
- `draft: true` 的文章不会出现在列表、标签页和 RSS 里，适合写一半先存着。
- 标签不用登记，写进 `tags` 就自动出现在标签云和 `/blog/tags/<标签>/` 页面。
- 文件名就是 URL：`hello.md` → `/blog/hello/`。用英文短横线命名，别用中文和空格。

### 书架 / 片单 / 歌单：加一条

三者共用 `src/content/items/`，靠 `kind` 区分，页面各取各的：

```md
---
kind: movie          # book / song / movie
title: 让子弹飞
creator: 姜文        # 书填作者，歌填歌手，影视填导演
date: 2026-08-22     # 看完 / 读完的时间；在看在读的填开始时间
status: done         # want 想看 / doing 在看 / done 看完；不填按 done 算
rating: 5            # 1–5，可不填
blurb: 一句话短评。
essay: some-slug     # 可选，关联一篇长文（只在这一侧写）
draft: false
---
```

- `essay` 指向 `src/content/essays/` 里的文件名。指错了**构建期就会报错**，
  不会等到线上才发现空链接。
- 电影和剧集不分家，都写 `kind: movie` ——「在看」天然覆盖追剧。
- 封面 / 海报把图片放同目录，写 `cover: ./xxx.jpg` 即可，构建时自动压缩。

### 短评还是长文：在 studio 里当场选

收藏条目的「一句话」名义上是短评，写着写着变成一整篇是常事。
所以表单里有个「这段文字」下拉：

- **短评**：就写在卡片上（默认）。
- **长文**：多出一个正文框，保存时会**连带写出一篇长文**并自动关联。

选长文之后这些字段不用你填，全从条目派生：

| 长文的字段 | 从哪来 |
| --- | --- |
| `title` | 条目标题 + 后缀（《X》观后 / 读后 / 听后），想改就填「长文标题」 |
| `topic` | 按 kind 映射：book→reading、movie→watching、song→music |
| `description` | 那句「一句话」——它同时是卡片摘要和长文简介，不用写两遍 |
| `pubDate` / `draft` | 跟着条目走 |
| 文件名 | 条目文件名 + `-note` |

这么做的好处是长文能被站内搜索索引到，片单卡片上也会出现「读全文 →」；
而几百字塞在 blurb 里的话，搜索搜不到，卡片还会被撑成一条长溜。

几个边角：

- **再保存一次不会多出一篇**。条目记着关联的长文 id，落回同一个文件。
- **切回短评只解除关联，不删文件**。里面是你写过的字，静默删掉太危险；
  要删自己去「长文」列表里删。
- 已经关联了长文的条目，打开就是长文模式，正文从那篇载进来，就地改。
- 「关联长文」那个字段只在短评模式下露出来 —— 用来手动挂一篇已经写好的长文。
  长文模式下它由系统填，露出来让人手改必然打架。

### 封面：不用自己找图

studio 里填好标题，点封面栏的「搜封面」，会按条目类型去对应的源检索，
点一张就自动下载、压缩、存进 `src/content/items/` 并填好 `cover` 字段。

| 类型 | 源 | 脾气 |
| --- | --- | --- |
| 书 | 微信读书 + 豆瓣 | 微信读书的作者字段最全（「[美]黄仁宇」这种译者标注都带着）|
| 影视 | 豆瓣 + 猫眼 | 带年份，剧集会标出来并分季；猫眼还给导演 |
| 音乐 | 豆瓣 + QQ音乐 + iTunes + 网易云 | 四家一起搜，结果标了来源 |

选中一张之后，封面会下载压缩存进条目目录，**作者 / 歌手 / 导演也顺手填上**
（已经填过的不覆盖，只在日志里说一声搜到的是什么）。

音乐为什么要三家一起：它们的库互相补不齐。周杰伦在网易云是下架的，
搜「范特西」只能搜到翻唱；iTunes 的华语老专辑不如 QQ 全。三家并排给，
自己挑一张对的最省事。豆瓣音乐没在列 —— 它那个 suggest 接口已经废了，
任何查询词都返回空数组。

几件值得知道的事：

- **一家挂了不影响别家**。这些都是非公开接口，随时可能改结构或封掉。
  某一家没响应时，结果里会写明「XX 这次没响应」，其余照常出。全挂了也
  只是搜不到，拖一张图进来那条路照旧。
- **图必须由服务端转一手**。豆瓣的图有防盗链，不带 Referer 直接返回 418，
  而跨站 Referer 是浏览器伪造不了的 —— 所以缩略图走 `/api/cover/thumb`
  代理，不是直接 `<img src>` 指过去。
- **图片来源是白名单制**。那个代理端点接受一个外部 URL，不设限的话就是个
  能从服务端打到内网的洞（比如云厂商的元数据端点）。所以只认
  `img*.doubanio.com`、`*.mzstatic.com`、`y.gtimg.cn`、`p*.music.126.net`
  这几个主机，按 hostname 精确匹配 —— `img9.doubanio.com.evil.com` 这种
  伪装也挡得住，有测试盯着。
- 大图是白拿的：各家都把尺寸写在 URL 里（豆瓣 `/s/`→`/l/`、iTunes
  `100x100bb`→`600x600bb`、微信读书 `s_`→`t9_`），换掉即可，不用多打一次接口。
- **换封面会把上一张删掉**。不删的话，反复试几次就攒下一堆几百 KB 的图，
  长得还一模一样，事后分不清哪张还在用。
- 有的源会给出已经失效的封面地址（微信读书偶尔如此）。取不回来的候选会自己
  从结果里撤掉，不会留一个空白格子让人以为是网卡了。

### 首页「此刻」

`src/data/now.json`，改完就生效：

```json
{
  "updatedAt": "2026-08-26",
  "items": [
    { "icon": "book", "text": "在读《置身事内》" }
  ]
}
```

`icon` 必须是 `src/components/icons.ts` 里已有的名字，写错了构建时就会报错，不会等到线上才发现。
`updatedAt` 是手写的，改内容记得一起改，不然页面上的日期会骗人。

条数没有硬限制，但侧栏放 3～4 条最好看，多了会把右边那一列拉得比文章列表还长。

### 兴趣：加一个新的

两步：

1. 往 `src/data/interests.ts` 的数组里加一项（首页卡片和 `/interests/` 列表都从这里读，只改这一处）：

   ```ts
   { icon: 'map', slug: 'travel', title: '旅行',
     desc: '一句话介绍。',
     tags: ['标签1', '标签2'] },
   ```

2. 新建 `src/pages/interests/<slug>/index.astro`，套 `InterestLayout`：

   ```astro
   ---
   import InterestLayout from '../../../layouts/InterestLayout.astro';
   ---
   <InterestLayout icon="map" title="旅行" description="一句话描述">
     <div class="demo-card">……</div>
   </InterestLayout>
   ```

`slug` 必须和目录名一致，否则首页卡片会点进 404。首页兴趣区是**全部展示**、不分页的，
加到十几个会把那一整条色带撑得很长，到时候再考虑折叠。

首页那排卡片的列数写在 `src/styles/global.css` 的 `.int-row` 里（现在是 6 列，
正好放下现有的 6 个）。加减兴趣时顺手改一下，不然右边会空出格子。

如果这个兴趣页要写交互脚本，务必用 `src/scripts/init.ts` 的 `onPageReady`，原因见上面那节坑。

### 自选股：加减股票

只改 `src/data/stocks.watchlist.json`，一只一行：

```json
{ "secid": "0.300308", "code": "300308", "name": "中际旭创" }
```

`secid` 的前缀就是东方财富的市场号：

| 市场 | 前缀 | 例子 |
| --- | --- | --- |
| 深市（含创业板） | `0.` | `0.300308` |
| 沪市（含科创板） | `1.` | `1.688008` |
| 港股（代码五位） | `116.` | `116.09988` |

**别凭印象填代码。** 简称和你记的经常对不上（比如 `688347` 东财叫「华虹宏力」不叫「华虹公司」），
港股还容易混到涡轮牛熊证上去。用东财的搜索接口查一下，一秒钟的事：

```bash
curl -s -G --data-urlencode "input=中际旭创" \
  --data "type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=6" \
  https://searchapi.eastmoney.com/api/suggest/get
```

返回里的 `MktNum` 就是 secid 前缀，`Code` 是代码，`SecurityTypeName` 告诉你是深A / 沪A / 港股。

习惯上 **A 股排前面、港股排后面**，加票时按这个分组插，别一路追加到末尾。

港股价格是港元，页面会自动在那一行挂个 `HK$` 标签（`currency` 由脚本按市场号判断，不用手填）。
跨币种不做换算 —— 涨跌幅本身与币种无关，硬凑汇率反而引入每天都在变的假精度。

### 大盘复盘（水温）

股票页顶部那张卡片，数据来自 `scripts/fetch-market.mjs` → `src/data/market.json`，构建期抓一次。
**不用手工维护**，但两个地方你可能想调：

- **关注哪些指数**：`scripts/fetch-market.mjs` 顶部的 `INDICES` 数组，加减一行即可，
  secid 规则和自选股一样。
- **水温的分档和措辞**：`scripts/market-lib.mjs` 里的 `MOODS` 数组，改 `label` 和 `note`
  就能换说法。

水温的定义是 **上涨板块 ÷（上涨 + 下跌）**，平盘不计入分母，50 是多空平衡点。

指数和板块是**分开抓、分开降级**的，展示上也分开：板块没抓到时页面照常显示指数，
只把水温和宽度条那一块收起来，并说明「这次构建没能取到板块数据」。
（早先这里是整张卡片一票否决，结果指数明明抓到了、页面还是一片空白。）

用的是**板块级宽度**而不是个股涨跌家数，这是被接口逼出来的取舍：东财 `clist` 的 `pz` 硬上限是
100，按个股统计全市场要翻五十多页，请求一密必被限流；而行业板块自带的涨跌家数字段没法加总 ——
496 个板块里一级和细分并存，同一只股票被重复归类，加出来是实际的三倍多。板块级宽度口径自洽，
也更能看出「热点是普涨还是只集中在几个方向」。

#### 板块清单为什么要固化

板块行情**不走 `clist`**。翻五页的请求密度会稳定触发限流，线上因此长期抓不到板块 ——
表现是复盘卡片一直显示「还没有抓到大盘数据」，而同一页的自选股行情却是好的
（它走 `ulist.np`，那个接口不限流）。

现在的做法：板块清单固化在 `src/data/sectors.list.json`，构建期用 `ulist.np`
按清单**一次批量取全**（496 个 secid 拼一条 URL，约 5 KB，实测没有条数上限）。

清单半年也未必变一次，所以不进构建流程。什么时候手动刷一次：

```bash
npm run refresh:sectors     # 走 clist 翻页，撞上限流会拒绝写入并让你等几分钟
```

- 页面上「N 个行业板块」的数字明显变少，或东财调整了行业分类时，跑一次。
- 脚本拿不满 400 个会**拒绝覆盖**旧清单 —— 残缺清单会让宽度统计凭空少一截，
  而页面上完全看不出异常，宁可保留旧的。
- 抓取时如果按清单只取回不到 8 成，构建期会当作失败处理、沿用旧数据，
  同样是不让「少算一截」的数据冒充完整数据。

### 图标

全站没有 emoji，图标统一走 `src/components/icons.ts`（24px 网格的实心剪影，颜色继承 `currentColor`）。
加一个：往 `ICONS` 里添一条 SVG path，`IconName` 类型会自动收敛，名字写错构建期就报错。

```astro
<Icon name="camera" size={18} />
```

**图标数据必须放在 `.ts` 文件里，不能写进 `.astro` 的 frontmatter** —— Astro 编译器提升
`export const` 大对象时会产出坏 JS，报的错还对不上行号，踩过一次。

### 站内搜索

[Pagefind](https://pagefind.app/)，构建期扫 `dist` 生成索引，搜索完全在浏览器里跑，
零后端、零请求。`npm run build` 已经包含索引生成这一步。

**只有详情页进索引。** 首页、博客列表、标签页、兴趣列表这些索引类页面挂了 `noIndex`，
因为它们的内容是详情页的重复 —— 都索引进去的话，搜「Astro」第一条弹出来的是标签页
而不是那篇文章。新增页面时想清楚它属于哪一类。

写法上有个坑：`data-pagefind-body={!noIndex}` 是错的。`data-*` 不是布尔属性，
`false` 会被渲染成字符串 `"false"`，属性依然存在，而 Pagefind 只看存不存在。
必须传 `undefined` 才会整个属性都不输出。

中文是按词切分的，所以搜一个长句会匹配到包含其中多数词的页面，这是预期行为，不是 bug。

### 变更记录

```bash
npm run changelog
```

从 git 历史生成 `CHANGELOG.md`，按 `feat:` / `fix:` 这类前缀分组、按日期分节，
每条链回对应的 commit。**别手动改这个文件**，下次生成会覆盖。

提交信息的正文（那些「为什么这么改」的说明）不会进 CHANGELOG —— 它们留在 git 里，
想看细节点链接就是了。变更记录塞满长段落反而没人读。

### 年度回顾

`/year/2026/` 这类页面自动生成，数据来自三个 collection 的统计：读完的书、
记下的歌、拍的照片、去过的地方、写的文章，外加一张逐月活跃度柱状图。

**只为有内容的年份生成页面** —— 空年份的回顾页只会是一排零。入口在时间线页的侧栏。

### 改版面之前：一条排版规则

全站只有一条布局规则，加新页面时照着来就不会跑偏：

**索引页 = 宽双栏，阅读页 = 窄单栏。**

- 索引页（首页 / 博客 / 兴趣 / 标签 / 关于）：`<BaseLayout fullWidth>` + `.container-wide`（1120px），
  骨架用 `.split`（1.75fr : 1fr），窄屏自动塌成单列
- 阅读页（文章正文）：默认容器 880px，正文再限宽到 720px —— 正文太宽反而难读，这里不跟风

重复的排版已经抽成组件，别再手写一遍：`PageHeader`（页头）、`PostCard`（文章条目，首页/博客/标签共用）、
`InterestCard`、`TagCloud`、`.side-box`（侧栏卡片）。

**一个坑**：`BaseLayout` 已经渲染了 `<main>`，双栏的左列要用 `div.split-main`。再套一个 `<main>`
是非法 HTML（一个文档只能有一个 main 地标），而且 `main` 的上下留白会被内层吃到，
左栏会比右栏矮一截。

## 部署到 GitHub Pages

仓库 `blog-demo` 是**项目页**，线上地址为 `https://doyouhang.github.io/blog-demo/`。
配置里已默认 `SITE_BASE=/blog-demo/`，无需手动设置。

### 方式一：GitHub Actions 自动部署（推荐）

1. 在 GitHub 新建仓库 `blog-demo`（**不要**勾选初始化 README/LICENSE）。
2. 把本地仓库推到 GitHub（SSH 需先在 GitHub 添加你的公钥 `~/.ssh/id_ed25519.pub`）：
   ```bash
   git remote add github git@github.com:Doyouhang/blog-demo.git
   git push -u github main
   ```
3. 仓库 → **Settings → Pages** → Source 选 **GitHub Actions**。
4. 等 Actions 跑完（几分钟），访问 `https://doyouhang.github.io/blog-demo/`。

以后每次 `git push` 到 `main` 都会自动重新部署。

### 方式二：手动部署（兜底，不依赖 Actions）

把构建产物推到 `gh-pages` 分支，再到 Settings → Pages 选该分支：
```bash
GH_REMOTE=git@github.com:Doyouhang/blog-demo.git ./deploy.sh
```

## 换成用户页（可选）

若想要更干净的地址 `https://doyouhang.github.io/`（不带 `/blog-demo/`）：
1. 新建仓库，名称必须为 `doyouhang.github.io`。
2. 把 `astro.config.mjs` 里的 `SITE_BASE` 默认值改为 `/`（构建时不再带前缀）。
3. 部署方式同上。

## 绑定自己的域名（可选）

GitHub Pages 可免费绑定自定义域名（需在域名服务商做好 CNAME 解析）。
国内规则下自定义域名需完成 **ICP 备案**；使用 `*.github.io` 免费子域名无需备案。
