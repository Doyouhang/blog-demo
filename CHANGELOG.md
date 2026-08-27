# 变更记录

由 `npm run changelog` 从 git 历史生成，**不要手动编辑**。
提交信息用 `feat:` / `fix:` 这类前缀分组；想看某条改动的来龙去脉，点进对应的 commit。

## 2026-08-27

### 新增

- 阶段二 —— 本地图文编辑器 Studio ([`9155faf`](https://github.com/Doyouhang/blog-demo/commit/9155faf62b1233809f208b05adc188e2351cadc4))
- 阶段一 —— 内容模型落地，七个 demo 页转为内容型页面 ([`8ed44e3`](https://github.com/Doyouhang/blog-demo/commit/8ed44e33cf1bbecc6629b793dc508c621f5da3b3))
- 股票页加每日大盘复盘，去掉说明区块，README 补维护指南 ([`77ec30b`](https://github.com/Doyouhang/blog-demo/commit/77ec30be049ebdbe1c3505465777712c91e30ebc))
- 自选股加入天孚通信(300394) ([`ac8086c`](https://github.com/Doyouhang/blog-demo/commit/ac8086c4b1bb9b69984bf4a285a841242febc8f9))
- 自选股清单换成 11 只（9 只 A 股 + 2 只港股） ([`d9f55cc`](https://github.com/Doyouhang/blog-demo/commit/d9f55cc25c9f6371d940e51480ff777e7854185f))

### 修复

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

