# 项目更新约定

- 每次完成一批用户要求的软件修改，同步把版本号递增一位，例如 v0.17 → v0.18 → v0.19；同一批修改中的修复、检查和构建只递增一次。
- 同步更新 package.json 的 version/displayVersion、package-lock.json 的项目版本及 README 当前版本，重新构建 HTML，确保顶部版本一致；更新桌面启动器使用的运行目录。
- 在 CHANGELOG.md 顶部新增对应版本的简短中英双语总结，只列完成的主要变化和必要验证。长篇过程、实现细节及参考资料放 docs 并链接。
- 本地版本更新不代表 GitHub 发布；未经用户要求，不推送、不创建 Release，也不把下载链接改成尚不存在的版本。

# 文档维护约定

- 当前功能与操作维护在使用说明.md；README 中英文只维护产品概览和入口。产品边界、架构、格式、开发发布和验证分别维护在 docs/product-scope.md、architecture.md、formats.md、development-release.md、verification.md。
- 新功能直接并入对应现行章节，核对实际控件、默认值、单位、保存与离线行为。更新已影响的帮助主题和翻译，不在手册末尾持续追加版本补丁。
- docs/v* 文件保留版本设计和当时证据。引用历史结果时标明版本与范围，不把它们写成当前版本已通过；当前验收记录绑定版本、实际构建及环境。
- 运行 npm run test:docs；打包后再运行 python3 scripts/check-docs.py --package <实际ZIP路径>。便携包文档以显式入口和相对引用收集；源码引用用固定提交链接，素材来源和许可文件应随包可读。
