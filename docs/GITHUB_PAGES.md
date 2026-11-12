# 文献研究中心 · GitHub Pages 发布说明

Pages 托管检索、精读、笔记和研究画布的静态前端。模型请求由单独部署的 Node.js 服务处理。[打开网站](https://rwqyeftte.github.io/1030-xmsj/) · [源码仓库](https://github.com/rwqyeftte/1030-xmsj)

## 本地运行与发布前检查

使用 Node.js 22，在仓库根目录运行 `npm ci` 安装依赖，`npm run dev` 启动开发服务器。`npm test` 运行单元测试，`npm run build:pages` 完成类型检查并将前端写入 `dist-pages/`。构建后可用 `npm run test:browser` 启动临时静态服务器和隔离的本机 Chrome 会话，检查页面与研究流程。

2026 年 11 月 13 日的精读与画布交互可按下面的步骤复核。

1. 打开《老字号包装的叙事性设计研究》的文本精读，用「本篇结构」跳到「2.1 叙事主题」。目录保留收录章节的原编号。[文章精读](https://rwqyeftte.github.io/1030-xmsj/#/resources/A02/read?view=text)
2. 选中一段文字，记下观察或直接点「放到项目画布」。独立阅读时可选择或创建项目，从项目内阅读时沿用当前项目。PDF 段落、图片区域、视频时间点与片段也支持放入画布。
3. 点「查看画布卡片」并单击卡片，查看原始来源与个人观察。「回到原文」可定位阅读位置，「返回原工作版位置」可找到原来的卡片。桌面详情显示在右栏，手机上从底部打开。

## 发布静态前端

1. 在仓库的 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
2. 将源码、所需素材、锁文件、测试和 `.github/workflows/deploy-pages.yml` 提交至 `main`。推送会触发工作流，也可在 **Actions → Publish research prototype to GitHub Pages → Run workflow** 手动发布。
3. 在对应提交的工作流中确认测试、构建和部署成功，再打开部署链接。Pages 使用 `/1030-xmsj/#/search` 等地址，刷新和直接打开时均从目录首页载入。本地开发使用 `/search`。[发布记录](https://github.com/rwqyeftte/1030-xmsj/actions/workflows/deploy-pages.yml)

单独交付源码包时运行 `npm run package:pages`。输出目录 `release/1030-xmsj-时间戳/` 内的 `PUBLISH_MANIFEST.json` 记录本次打包文件的大小和 SHA-256。脚本排除开发缓存、浏览器数据、测试截图和本机环境变量文件。

## 配置独立 AI 服务

如需公开版使用 DeepSeek 辅助检索、专题与阅读问答或 PDF 选段解读，需要同时配置后端和前端构建。

1. 在支持 Node.js 22 和 HTTPS 的后端部署这份源码，安装依赖，在后端的 Secret 中设置 `DEEPSEEK_API_KEY`，并设置 `READER_SITE_ORIGIN=https://rwqyeftte.github.io`。
2. 使用 `npm run start:reader-api` 启动服务，监听托管平台提供的 `PORT`。单进程最多同时处理 2 个请求，每小时最多受理 30 个请求，访客共用该进程的额度。
3. 在 GitHub 仓库的 Actions 变量中，将 `VITE_READER_API_URL` 设为后端完整的 HTTPS 地址，以 `/api/reader` 结尾。重新运行 Pages 工作流，使公开接口地址进入前端构建。密钥保存在后端。
4. 打开已部署的站点，提交一次辅助检索或阅读问题来验证模型响应。静态发布成功仅能确认前端已部署。前端缺少接口地址时，会提示服务尚未配置。

本地开发可通过服务端环境变量或被 Git 忽略的 `.env.local` 提供密钥。服务端支持 Windows 系统代理和 `DEEPSEEK_HTTPS_PROXY`。运行 `node tests/reader-ai.mjs` 可检查检索流程，附加 `--live` 会调用真实模型。

## 资料范围与保存位置

- 课程节选包括论文 A01–A04、书籍 B01–B04 的 8 个实际 PDF 文件，以及 V01–V03 的 3 段视频预览。各条编目注明课程包未附公开再分发许可。I01–I18 的 18 张课程图片预览标为原作权利信息未载明。
- 保温瓶专题包含 3 张附来源和权利标注的图像，分别标注为 CC0、作者释入公有领域、文件页标注美国公有领域。专题另有原创导读。每件图像的详情页可以核对其来源。
- 合成种子资料、示例笔记和项目用于展示研究流程。`PRIVATE-DEMO` 标记的是合成记录。访问者自行上传的文件、项目和笔记保存在自己的浏览器中，问答记录保存在当前标签页的会话中。
