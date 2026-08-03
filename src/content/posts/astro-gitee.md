---
title: 用 Astro + Gitee Pages 免费建站
description: 三步把一个静态博客部署到 Gitee Pages。
pubDate: 2026-08-02
tags: ['前端', 'Astro', 'Gitee']
---

# 用 Astro + Gitee Pages 免费建站

## 步骤

1. 用 Astro 写好内容（`src/content/posts` 里放 Markdown）
2. `npm run build` 生成静态文件到 `dist/`
3. 推到 Gitee 并开启 Pages 服务

## 小技巧

- 如果你用的是**项目页**（仓库名不是 `<用户名>.gitee.io`），构建前设置 `GITEE_BASE=/仓库名/`。
- 想要自己的域名，可开通 Gitee 会员绑定，并按国内规则完成备案。
