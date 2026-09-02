# 变更记录

由 `npm run changelog` 从 git 历史生成，**不要手动编辑**。
提交信息用 `feat:` / `fix:` 这类前缀分组；想看某条改动的来龙去脉，点进对应的 commit。

## 2026-09-01

### 新增

- 全站换「纸墨档案」文艺风主题 ([`395738e`](https://github.com/Doyouhang/blog-demo/commit/395738efd1ed13184370afbb68e2e46d4fbad790))

### 内容

- 建站文重写成一篇完整的踩坑复盘 ([`9279c34`](https://github.com/Doyouhang/blog-demo/commit/9279c34cd51518f9ded4e14a330e46de20e151e6))
- 「欢迎来到我的小站」并入关于页，关于页补全并润色 ([`2bf43ea`](https://github.com/Doyouhang/blog-demo/commit/2bf43ea055ad22b1b8bb65b65cb3e5283ed32ad0))

### 测试

- 两条断言不再依赖示例内容，一条不再依赖墙钟余量 ([`b741cf6`](https://github.com/Doyouhang/blog-demo/commit/b741cf621f8a6a60e4edd43126be23849b631ed0))

## 2026-08-31

### 内容

- 更新收藏 ([`68b4d07`](https://github.com/Doyouhang/blog-demo/commit/68b4d07c9ab22e8a98294990a6c073ed95b7c249))

## 2026-08-30

### 新增

- 首页改成「最近更新」混流，兴趣格子放真封面 ([`c1e7da9`](https://github.com/Doyouhang/blog-demo/commit/c1e7da9c4149973af89d906e0c2b4e01461d76c8))
- studio 支持删除条目 ([`c2d5b28`](https://github.com/Doyouhang/blog-demo/commit/c2d5b28af4a1784a264a2c27af4d42d55a38031e))
- 新增「闪念」—— 三年随笔的碎片时间线 ([`67aa893`](https://github.com/Doyouhang/blog-demo/commit/67aa8938cec5684499d7084bd77433d44f2d79e5))
- 接入微信读书搜书，studio 收藏按类型分组，匹配按钮挪到标题旁 ([`a51fba1`](https://github.com/Doyouhang/blog-demo/commit/a51fba14fd008813393fcf3e7a47aa5006da9cbd))
- 搜封面时把作者 / 歌手 / 导演一起带回来 ([`1c1fbb8`](https://github.com/Doyouhang/blog-demo/commit/1c1fbb827b8a9532873d9843d87a673898cef131))
- 收藏条目能当场选「短评还是长文」，选长文自动连带成篇 ([`2429199`](https://github.com/Doyouhang/blog-demo/commit/2429199162caa7a8f3f25912211500330d35188d))
- studio 支持按名字搜封面，书影音各走各的源 ([`c820c25`](https://github.com/Doyouhang/blog-demo/commit/c820c25a23410f88c36620a0ba706921fa05febb))
- 兴趣加影视板块，片单 + 观后感，仿读书那套 ([`a38b9a5`](https://github.com/Doyouhang/blog-demo/commit/a38b9a5e0a73c6f14ae76937ae31b00cc9117672))

### 修复

- 手动拖封面也会删掉上一张，不再留孤儿图 ([`0d922ca`](https://github.com/Doyouhang/blog-demo/commit/0d922ca86c93a63bc8edb8ed483a242defe82e8b))
- 短评里的换行不再被吃掉，长的收进折叠 ([`46b8638`](https://github.com/Doyouhang/blog-demo/commit/46b86387541ba6e4736d64626daee56894fa9fbd))
- 影视搜不到封面 —— 豆瓣那个接口变成恒返回空了，改成每类多源 ([`eb79f3c`](https://github.com/Doyouhang/blog-demo/commit/eb79f3ca17472d405c8bd11db94bab94e3ebef3e))
- studio 改完代码不用手动重启，页面也不再被缓存 ([`8cd0f35`](https://github.com/Doyouhang/blog-demo/commit/8cd0f35269e8d3b118e755df1289957fc482e3e2))

### 内容

- 加《1984》和《螺旋》，删掉脚手架剩下的示例内容 ([`6361beb`](https://github.com/Doyouhang/blog-demo/commit/6361beb150e82ac3ec3d6ffb70484ad3d264b80f))
- 奥德赛换封面、补上导演名，清掉不再引用的旧图 ([`389224a`](https://github.com/Doyouhang/blog-demo/commit/389224abee3b15899c0aaf93d43c5254d76d2715))
- 更新收藏 ([`513f52e`](https://github.com/Doyouhang/blog-demo/commit/513f52ec675ce943e5b18e49a44f04b3edcfafc8))
- 更新收藏 ([`3427cfb`](https://github.com/Doyouhang/blog-demo/commit/3427cfbf9b1b5b6d95663678fb7ca1c2a1a03283))

### 杂项

- 去掉 RSS 订阅，对外只留 GitHub ([`46b5dc3`](https://github.com/Doyouhang/blog-demo/commit/46b5dc37e2bbcc6e45c7e649312db8c153aa15b7))
- 加一个探测 workflow，查清哪些行情源在 runner 上能通 ([`c9803ef`](https://github.com/Doyouhang/blog-demo/commit/c9803ef391bf60dbe7b3f3e0ac17768d2b62477a))

## 2026-08-29

### 修复

- 编辑已有条目不再改坏内容，md 解析挪到服务端和写入配对 ([`5f89a60`](https://github.com/Doyouhang/blog-demo/commit/5f89a60b77f11890372b1b50a866c62eea006cb8))
- 指数和板块各记各的数据时间，别让提示语说错话 ([`f5a00e8`](https://github.com/Doyouhang/blog-demo/commit/f5a00e84ae93feb99a6df3cdacecfc114c4211a5))
- 照片时间跟着照片自带的时区走，HEIC 给人话提示 ([`1f57968`](https://github.com/Doyouhang/blog-demo/commit/1f57968b82f1e7ee19fb7188e3e842e1573288c5))

## 2026-08-28

### 新增

- 板块行情改走 ulist.np 批量，绕开 clist 限流 ([`ac05058`](https://github.com/Doyouhang/blog-demo/commit/ac05058264da85f8dc6fab7b96874ebf95e43e2b))

### 修复

- 大盘复盘分区降级，板块抓不到不再把指数一起藏掉 ([`2611541`](https://github.com/Doyouhang/blog-demo/commit/26115415e800335f30a45d09e921264eb92f9b23))
- 冒烟测试适配子路径 base，修复 CI 上 preview 永远等不到就绪 ([`8b152ce`](https://github.com/Doyouhang/blog-demo/commit/8b152ce0dc844711c3732410108f1168f4a93210))
- 按代码评审修复 studio 的数据丢失与安全问题，补上测试 ([`a0285e0`](https://github.com/Doyouhang/blog-demo/commit/a0285e05f683740123b2df63ed08f0b27d97d065))

### 内容

- 更新此间 ([`0fe807b`](https://github.com/Doyouhang/blog-demo/commit/0fe807b012bea2e0a4bc0f7735881f05bf3a0b3d))

## 2026-08-27

### 新增

- 阶段三 —— 站内搜索、变更记录、年度回顾 ([`e0b9dcd`](https://github.com/Doyouhang/blog-demo/commit/e0b9dcdb26ba42ae51ba7b8670b2cc0cfacd80ec))
- 阶段二 —— 本地图文编辑器 Studio ([`9155faf`](https://github.com/Doyouhang/blog-demo/commit/9155faf62b1233809f208b05adc188e2351cadc4))
- 阶段一 —— 内容模型落地，七个 demo 页转为内容型页面 ([`8ed44e3`](https://github.com/Doyouhang/blog-demo/commit/8ed44e33cf1bbecc6629b793dc508c621f5da3b3))
- 股票页加每日大盘复盘，去掉说明区块，README 补维护指南 ([`77ec30b`](https://github.com/Doyouhang/blog-demo/commit/77ec30be049ebdbe1c3505465777712c91e30ebc))
- 自选股加入天孚通信(300394) ([`ac8086c`](https://github.com/Doyouhang/blog-demo/commit/ac8086c4b1bb9b69984bf4a285a841242febc8f9))
- 自选股清单换成 11 只（9 只 A 股 + 2 只港股） ([`d9f55cc`](https://github.com/Doyouhang/blog-demo/commit/d9f55cc25c9f6371d940e51480ff777e7854185f))

### 修复

- 构建输出别再吓人，并守住搜索静默失效的两种坏法 ([`c00c7d2`](https://github.com/Doyouhang/blog-demo/commit/c00c7d20f14a38742f827d2319f1334f6e6371a9))
- 按钢琴键时右侧闪出纵向滚动条导致布局抖动 ([`4fe5afc`](https://github.com/Doyouhang/blog-demo/commit/4fe5afc305c66cde7ea56845c37b637b09757a1f))

### 文档

- 内容架构与工程化设计文档 ([`a2b7d53`](https://github.com/Doyouhang/blog-demo/commit/a2b7d53599d1f00656e58413f0a4a2bb4161689d))

## 2026-08-26

### 新增

- 首页改版为不对称双栏，补「此刻」与行情侧栏 ([`5f24e25`](https://github.com/Doyouhang/blog-demo/commit/5f24e251bcfcf21056f387c68d2361c272ad7e98))
- 补齐分享预览图与 favicon，站名用字改回「迩」 ([`434bf2c`](https://github.com/Doyouhang/blog-demo/commit/434bf2cf0930619f3fb1cadac9d384c697dbbc7b))
- 用 SVG 图标体系替换全站 emoji，并精修控件质感 ([`21a109c`](https://github.com/Doyouhang/blog-demo/commit/21a109c218e6c50ffa72ae938e3089e08ff58b85))
- 文章页阅读时长与阅读进度条 ([`b68df59`](https://github.com/Doyouhang/blog-demo/commit/b68df598c3ba79e4adc4fe58494eac79ebb56e03))
- 跨页转场、主题切换与页面脚本初始化助手 ([`88d597b`](https://github.com/Doyouhang/blog-demo/commit/88d597b4749a176e17b134e1676b3ae67d4caa21))
- 暗色主题、响应式布局与全站动效体系 ([`c5f9c3e`](https://github.com/Doyouhang/blog-demo/commit/c5f9c3e13762ec8149a8493053fef638efd312ca))

### 修复

- 股票页涨跌判断统一，补平盘与数据降级提示 ([`d4368e4`](https://github.com/Doyouhang/blog-demo/commit/d4368e4b89788654f79aba263c7bdd5577cdbc77))
- demo 页无障碍修复，代码运行器改用 Worker 沙箱 ([`e048c93`](https://github.com/Doyouhang/blog-demo/commit/e048c93a53770ff813097a8aa2327f326f2bd2b8))
- 行情抓取失败不再让整站构建挂掉 ([`cadd10b`](https://github.com/Doyouhang/blog-demo/commit/cadd10b4cf523f375afd215faabb0a9b34b9e49e))

### 重构

- 全站统一设计语言，重复排版抽成组件 ([`93de359`](https://github.com/Doyouhang/blog-demo/commit/93de35909fb383fab9384211a3a7faa937f43b42))
- 兴趣数据抽成单一数据源，首页卡片直达 demo ([`0bb30a6`](https://github.com/Doyouhang/blog-demo/commit/0bb30a65b0b5287b9b954c9cf1c4ec86f3bfa509))

### 文档

- README 补环境准备、主题动效与构建容错说明 ([`fdb0661`](https://github.com/Doyouhang/blog-demo/commit/fdb06614f25d17f4a7161127bd8fc0377a7279b4))

### 杂项

- Merge pull request #1 from Doyouhang/feat/site-overhaul ([`7817372`](https://github.com/Doyouhang/blog-demo/commit/78173722f121040522458eeada5773c18880266c))
- 关于页联系方式改为可配置，404 页装饰符号加 aria-hidden ([`dc800c9`](https://github.com/Doyouhang/blog-demo/commit/dc800c98232f0ded7ba80c34b6c10299412ba1ca))
- 引入 sitemap 与类型检查，CI 增加 check 步骤 ([`d722703`](https://github.com/Doyouhang/blog-demo/commit/d722703ca5886bd28cf724915578d188df89bb9f))
- content 配置迁移到 src/content.config.ts ([`af19e19`](https://github.com/Doyouhang/blog-demo/commit/af19e19417703ba6fded946d38acc151c782f44e))

## 2026-08-07

### 新增

- 新增股票兴趣页，接入东方财富免key行情，Actions 交易日收盘后定时刷新 ([`dbc171a`](https://github.com/Doyouhang/blog-demo/commit/dbc171a2e7e22979b67517abafb338bfb45a3f8e))

## 2026-08-05

### 新增

- 兴趣区目录化改造，每个兴趣配一个可交互小 demo ([`1e7eb55`](https://github.com/Doyouhang/blog-demo/commit/1e7eb5551aa9aa17f2a418e25d9edee6c2ba82a8))

## 2026-08-04

### 新增

- 完善博客界面（RSS 订阅、标签归档页、404、上一篇/下一篇导航），清理 Gitee 迁移遗留引用 ([`c85330c`](https://github.com/Doyouhang/blog-demo/commit/c85330c27a6252373554fbf531d328e0c0fab4f4))

### 杂项

- 升级 Actions 到 Node24 运行时版本，消除 Node20 弃用警告 ([`0e6f013`](https://github.com/Doyouhang/blog-demo/commit/0e6f0136ad112f4da12c48b5973045266b631a15))

## 2026-08-03

### 杂项

- 从 Gitee Pages 迁移到 GitHub Pages (Actions 自动部署) ([`e3c0fcc`](https://github.com/Doyouhang/blog-demo/commit/e3c0fcc0f5c6ae03e6537d6f77e4df48fbc422c5))
- 迩迩的小站 (Astro + Gitee Pages) ([`ca9fc5d`](https://github.com/Doyouhang/blog-demo/commit/ca9fc5d7cd400a9795e2ffdd023fe5de1786bfb8))

