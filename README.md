# 文献研究中心

中文、桌面优先的研究准备交互原型。

网站入口：[文献研究中心](https://rwqyeftte.github.io/1030-xmsj/)（首次发布工作流成功后生效）。
检索入口：https://rwqyeftte.github.io/1030-xmsj/#/search

## 本地运行

需要 Node.js 22。

```sh
npm ci
npm run dev
```

- `npm test`：领域、检索和路由测试。
- `npm run build`：本地路径模式构建。
- `npm run build:pages`：GitHub Pages 构建，输出到 `dist-pages/`。
- `npm run test:browser`：构建 Pages 后使用本机 Chrome 运行隔离浏览器检查。

## 发布与更新

仓库 Settings → Pages 的 Source 选择 GitHub Actions。更新代码后，在 Actions → Publish research prototype to GitHub Pages → Run workflow 手动发布。普通 push 不会自动发布。

## 演示范围

包含 P01—P16 和 `/#/__review` 评审入口。仅研究准备，不含正式论文写作。使用公开目录元数据及明确标记的合成材料，不包含原始 PDF 或个人上传文件。

登录、AI/OCR 与权限为本地演示，无云数据库。每位访客的笔记、项目与上传文件保存在自己的浏览器，不会互相共享；localhost 的数据不会自动迁移到线上。

详情见 [发布说明](docs/GITHUB_PAGES.md)。
