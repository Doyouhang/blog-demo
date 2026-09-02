---
title: 一个只在 CI 上出现的 bug
description: 本地全绿、CI 全红，日志只有一句「preview 没起来」。查到最后发现两处探测用了不同的主机名。
pubDate: 2026-09-02
topic: coding
repo: https://github.com/Doyouhang/blog-demo
tags: ['CI', '调试', 'Node', '踩坑']
---

推了十个提交，Actions 红了。本地跑过完整流水线，八项快照全绿。

## 第一反应通常是错的

失败的步骤叫「Visual snapshots」，视觉回归快照。我的第一反应是渲染环境不同导致像素对不上 —— CI 用的字体、抗锯齿和本地都不一样，这是视觉回归最常见的坑。

但这个猜测经不起推敲：那一步跑的是 `--capture-only`，只截图不比对。它根本不做像素判断，怎么会因为像素失败？

**猜测和事实之间隔着一份日志。** 别猜，去拿。

## 日志只有一句话

```
[visual] preview 没起来
Error: Process completed with exit code 1.
```

上传 artifact 的那一步还留了个附注：`No files were found with the provided path: tests/visual/actual`。一张截图都没出来 —— 说明失败发生在浏览器启动之前，`astro preview` 没能被连上。

然后就没有然后了。脚本里写着 `stdio: 'ignore'`，preview 的输出被整个扔掉了。

## 先排除「慢」

CI 上会不会只是启动慢？脚本给了 60 次 × 300ms = 18 秒的等待。

本地量一下：

```
就绪耗时(127.0.0.1) ms = 532
```

532 毫秒。要让 18 秒不够用，得慢 34 倍。runner 是慢，但不至于。**「慢」这个解释站不住，那就是「根本没连上」。**

## 差异藏在一个字符串里

同一个仓库里有两处会起 preview：冒烟测试和视觉快照。冒烟那步在 CI 上是绿的。两份代码几乎一样，只有一处不同：

```js
// 冒烟：绿
const BASE = at(`http://localhost:${PORT}`);

// 视觉快照：红
const BASE = at(`http://127.0.0.1:${PORT}`);
```

`astro preview` 是 listen 在 **`localhost` 这个名字**上的（它自己打印的地址就是 `http://localhost:4321/`）。绑到哪个地址取决于这台机器怎么解析这个名字：

- 本地 `localhost → 127.0.0.1`，两种写法都通
- CI 上 `localhost` 若先解析到 `::1`，preview 就只监听 IPv6 回环

这时候拿写死的 `127.0.0.1` 去连，永远是 `ECONNREFUSED`，等满 18 秒，报「没起来」。而冒烟用的是名字，Node 的 fetch 按同样的规则解析，自然连得上。

**这个错在本地怎么跑都复现不了**，因为本地两条路通向同一个地址。

## 真正的缺陷不是那个字符串

一个字符串写错很正常。真正的问题是：为什么查这个错花了这么久？

因为视觉快照那份起停逻辑是冒烟那份的**弱化拷贝**：

- `stdio` 写成 `'ignore'`，子进程的输出全扔了
- 不检查子进程是不是已经退了，只会干等满超时
- 超时时间是 18 秒而不是 30 秒
- 没有端口占用预检

同一件事有两份实现，其中一份悄悄退化了。修法不是改那个字符串，是把被验证过的那份抽出来共用：

```js
// scripts/preview-server.mjs —— 两处共用
export async function startPreview({ port, label, root, portEnv, timeoutMs = 30000 }) { … }
```

捕获输出、子进程一退就打印真实原因、先查端口占用、主机名只写一次。改完之后故意把端口设成 80 试了一下：

```
[visual] preview 启动失败（退出码 1）：
22:00:01 [ERROR] Error: listen EACCES: permission denied 127.0.0.1:80
```

立刻报出真实原因，不再干等超时。**新加的诊断路径自己也得验一遍**，否则下次照样两眼一抹黑。

## 顺手改了流水线的一件事

这一步在 workflow 里的注释写着「不做像素比对，只截图上传 artifact 供人工对比」。既然它只是取证、不判定站点对错，就不该拦住部署 —— 对错由上面的冒烟测试把关。

```yaml
- name: Visual snapshots
  run: npm run test:visual -- --capture-only
  continue-on-error: true
```

失败仍然会在 Actions 里显示成橙色、日志照样留着，只是不再用工具链的毛病扣住一个能用的站。

## 记下来的三条

1. **失败步骤的名字不等于失败的原因。** 「视觉快照」这一步的失败和视觉毫无关系。
2. **同一件事只留一份实现。** 两份拷贝里弱的那份会在最不方便的时候出问题，而且因为看起来"差不多"，没人会去比对。
3. **`stdio: 'ignore'` 是在给未来的自己挖坑。** 子进程的输出是排障时唯一的线索，尤其在你连不上的那台机器上。

下一次推送，这一步在真的 runner 上是 success —— 不是被 `continue-on-error` 掩盖的那种。
