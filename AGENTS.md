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

# 私有源码与公开发布（2026-11-09 起）

- 完整源码、原始模型工程、全部开发历史和历史便携附件位于私有仓库 `Wenshuishi0528/StarOrbit-source`。本工作副本 origin 已指向私库。
- `Wenshuishi0528/StarOrbit` 是全新历史的公开展示与网页仓库，Pages 地址为 `https://wenshuishi0528.github.io/StarOrbit/`。仅同步通过检查的 `dist/` 网页产物、公开文档、截图、许可和发布说明。
- 公开仓库本机工作副本为 `/Users/apple/Documents/Codex/Tiangong-Orbit-Simulator/publish/public`。禁止向公开仓库推送本仓库分支、标签、src、scripts、tests、macos、可编辑模型工程、源码映射和便携源码包。
- 原 `pages.yml` 工作流已在 GitHub 停用。向私库推送不会自动更新网页版；每次授权发布还需单独同步并推送公开发布工作副本，再等待 Pages 完成并验证线上。
- 旧 Release 与附件完整保留在私库。公开 Release 仅归档说明，标记原发布日期，其标签指向公开资料。新发布也遵循这一分工。
- 本机 pre-push hook 限制源码只推送到私库；新克隆需重新设置本机 hook 并检查远端地址。
- 本次迁移只调整仓库与发布资料，网页保持已验证的 v1.36 构建。

# 本机目录统一（2026-11-09）

- 唯一开发与桌面运行根为本仓库；`/Applications/星轨.app`配置root指向本仓库，继续使用127.0.0.1:8771，优先提供dist-local。不要再向原3D打印目录同步完整开发副本。
- 公开发布工作副本为`publish/public`，由根`.gitignore`隔离，保持独立Git和公开remote；构建仍先写`dist`，不要让构建脚本覆盖公开工作副本的`.git`。
- 清理大产物先核对恢复来源；保留未匹配云端的ZIP、原始科学数据、验收记录与最近回退。移动到废纸篓时保留恢复清单，不自动清空废纸篓。
