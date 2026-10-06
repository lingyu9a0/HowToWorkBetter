# 发布说明

正文位于 book/，章节清单位于 book.json。修改正文后更新清单中的条目数量；添加新章节时同时更新 README 中的导航。

本地安装 Node.js 22、Pandoc 3.8.3、Typst 0.15.0 和中文字体，运行 npm install 后再运行 npm run build。输出位于 dist/。

GitHub 中进入 Settings → Pages，把 Source 设置为 GitHub Actions。提交至 main 后会生成 PDF、EPUB、离线 HTML，并先更新 Release 下载文件，再发布阅读网页。PR 只生成可下载的检查产物，不发布。

首次上传前检查正文、版权与本地引用说明。不要把 node_modules、dist、私人原始资料及发布准备记录上传。

下载链接固定为 releases/download/book-latest/HowToWorkBetter.pdf（或 epub / html）。已下载的旧文件不会自动更新。

tools/pdf 与 tools/epub 改编自 eternity4719/HowToLiveBetter，MIT 版权声明保留在 LICENSE-CODE。原作者代码中的书名、作者与正文授权已做适配，本书正文使用 CC BY-NC 4.0（见 LICENSE）；该正文许可不改变复用工具代码的 MIT 许可。
