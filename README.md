# 文献研究中心

中文、桌面优先的研究准备交互原型。

网站入口：[文献研究中心](https://rwqyeftte.github.io/1030-xmsj/)。
检索入口：https://rwqyeftte.github.io/1030-xmsj/#/search

## 本地运行

需要 Node.js 22。

```sh
npm ci
npm run dev
```

- `npm test`：领域、检索、路由、阅读笔记与画布汇总测试。
- `npm run build`：本地路径模式构建。
- `npm run build:pages`：GitHub Pages 构建，输出到 `dist-pages/`。
- `npm run test:browser`：构建 Pages 后使用本机 Chrome 运行隔离浏览器检查。

## 发布与更新

当前正式公开版由 GitHub Pages 托管。推送到 main 后，GitHub Actions 会自动安装依赖、运行测试、构建并发布；也可在 Actions → Publish research prototype to GitHub Pages → Run workflow 手动重发。

## 演示范围

2026-10-31 更新：精简首页、检索、推荐、专题和资料详情界面；完善文本选区笔记、图片区域笔记、视频时间点与片段笔记；优化项目画布操作，并支持从多个关联卡片生成可编辑、可回溯来源的汇总卡。汇总使用本地文本提取与整理，不调用远程模型。

包含 P01—P16 和 `/#/__review` 评审入口。仅研究准备，不含正式论文写作。使用公开目录元数据及明确标记的合成材料，不包含原始 PDF 或个人上传文件。

登录、AI/OCR 与权限为本地演示，无云数据库。每位访客的笔记、项目与上传文件保存在自己的浏览器，不会互相共享；localhost 的数据不会自动迁移到线上。

详情见 [发布说明](docs/GITHUB_PAGES.md)。
