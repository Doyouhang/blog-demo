---
title: 用 Astro + GitHub Pages 免费建站
description: 记一次真实的部署踩坑：从 Gitee Pages 停运到迁移 GitHub Pages。
pubDate: 2026-08-02
tags: ['前端', 'Astro', '部署']
---

# 用 Astro + GitHub Pages 免费建站

## 为什么要换平台

本来打算用 Gitee Pages 托管这个博客，结果一搜才发现：**Gitee Pages 已于 2025 年 6 月正式下线**，官方入口都撤了。于是果断迁移到 GitHub Pages。

## 三步部署到 GitHub Pages

1. 用 Astro 写好内容（`src/content/posts` 里放 Markdown）
2. `npm run build` 生成静态文件到 `dist/`
3. 推到 GitHub，仓库 **Settings → Pages → Source 选 GitHub Actions**

配好 `.github/workflows/deploy.yml` 后，以后每次 `git push` 到 `main` 都会自动构建并上线，不用再手动点任何东西。

## 项目页 vs 用户页

- **项目页**：仓库名 `blog-demo` → 访问 `https://<用户名>.github.io/blog-demo/`，构建要带 `SITE_BASE=/blog-demo/`。
- **用户页**：仓库名 `<用户名>.github.io` → 直接访问 `https://<用户名>.github.io/`，`SITE_BASE=/`。

## 踩坑记录

- Gitee Pages 免费服务已停，别再等了。
- GitHub Pages 免费额度对个人博客绰绰有余：1GB 存储、100GB/月流量。
- 绑定自己的域名需要在域名商做好 CNAME 解析，`.github.io` 子域名则免备案直接可用。
