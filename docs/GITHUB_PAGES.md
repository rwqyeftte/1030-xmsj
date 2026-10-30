# GitHub Pages 发布准备

当前正式公开站点：https://rwqyeftte.github.io/1030-xmsj/

源码已上传本仓库，GitHub Pages 已启用。首次云端构建、测试与发布成功；未登录浏览器已验证 16 页直开/刷新和完整研究流程。下列步骤供后续维护使用。

目标仓库：https://github.com/rwqyeftte/1030-xmsj

用户已授权将此发布版本上传至上述仓库并启用 GitHub Pages。实际发布结果请查看仓库 Actions。

## 发布方式

1. 运行 `npm run package:pages`，使用输出的 `release/1030-xmsj-时间戳/` 目录作为待上传的仓库内容。不要上传整个原工程目录，也不要将 ZIP 文件本身作为网站。
2. 经明确授权后，才把该目录内容提交到目标仓库 `main` 分支。目录中的 `.github/workflows/deploy-pages.yml` 也需要上传。
3. 在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
4. 在 **Actions → Publish research prototype to GitHub Pages → Run workflow** 手动发布。推送到 main 会自动触发发布。
5. 成功后从该次工作流的部署结果打开网站。预期地址为 `https://rwqyeftte.github.io/1030-xmsj/`；已发布并完成线上检查。

## 本地使用与检查

需要 Node.js 22 和 npm。安装依赖：`npm ci`。开发：`npm run dev`。

`npm test` 运行领域、检索与路由测试；`npm run build` 构建原本地模式；`npm run build:pages` 构建发布模式到 `dist-pages/`。

发布包的 `npm run test:browser` 在构建发布版后运行，使用本机 Chrome 和临时静态服务器检查真实路径，结束后关闭测试服务器。它会创建隔离浏览器上下文，不读取你正在使用的浏览器数据。

Pages 使用 `/1030-xmsj/#/search` 等地址。静态服务器只请求目录首页，路由和查询参数保留在 `#` 后，因此支持直接打开、刷新和前进后退。本机开发继续使用 `/search`。

## 包含的内容

- 运行源码、样式、依赖锁文件、构建配置、公开演示目录和评审数据、自动化发布工作流及单元测试。
- 课程目录题名、来源 PDF 文件名与页码引用将出现在公开代码和网站中。原 PDF 不包含在发布包里。
- 合成文本、图像/时间轴演示数据、演示笔记与项目。标为 PRIVATE-DEMO 的种子记录也是合成示例，不是浏览器中上传的真实文件。
- 每个发布包的 `PUBLISH_MANIFEST.json` 列出实际文件、大小和 SHA-256，便于核对。

## 不包含的内容

不打包 `references/`、任务包原件、Figma 工作记录与旧导出文件、截图、浏览器配置、下载文件、备份 ZIP、日志、缓存、`node_modules/`、本机 `dist/`。发布构建也不会复制 `public/figma-prototype-files/`，不会载入 Figma capture 调试脚本。

## 使用范围

这是静态研究准备原型。登录、AI/OCR和权限为演示能力，没有账号服务器或云数据库。每位访客的保存、项目、笔记和上传文件存于自己的浏览器，不会与其他访客共享。本机 localhost 数据不会自动迁移到线上域名。站点演示登录不是网站访问控制。

本地已通过类型检查、23 项单元测试、16 页面与 90 评审状态浏览器检查，以及完整研究操作流程。线上发布状态以仓库 Actions 为准。

官方参考：https://vite.dev/guide/static-deploy.html#github-pages
