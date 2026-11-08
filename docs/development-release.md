# 开发、发布与维护

适用版本：本地 v1.31。作者：Wenshuishi。核对日期：2026-11-08。

本页按本地 v1.31 的工具链和运行方式维护。命令以源码根目录为工作目录；下载的便携包不含完整 `src/`、`tests/`、构建脚本和 Node 依赖，不能直接用于开发测试。产品能力见[范围说明](product-scope.md)，结构见[系统架构](architecture.md)，执行与未执行项目见[验证指南](verification.md)。本页描述流程，不表示这些步骤在每次更新中均已完成。

地表／太阳系改动的专项入口是 `tests/ground-world.mjs`、`tests/ground-surface.mjs`、`tests/solar-world.mjs`、`tests/ground-sky.mjs`，均并入默认回归。浏览器需检查共用 canvas 的进入／返回、时间连续性、地形异步加载、输入焦点和截图；运行结果写入版本验收记录，不能仅用数值测试推断图形交互通过。

## 先识别四个位置

| 位置 | 如何确定 | 用途与注意点 |
| --- | --- | --- |
| 源码仓库 | 有 `package.json`、`src/`、`tests/`、`build.mjs` 的目录 | 编辑、测试与构建；当前工作目录不自动等于日常运行目录 |
| 安装运行目录 | 查看 `/Applications/星轨.app/Contents/Resources/launcher-config.json` 的 root | 提供 `StarOrbit.html`、`scripts/` 及可选 `dist-local/`；启动器可能引用仓库外的旧目录 |
| 便携解压目录 | 包内的 `星轨/` | 单文件、手册和本机脚本；便携 `.app` 的 `root:"."` 指其旁边的运行文件，不是源码根目录 |
| 正在运行的服务 | 当前地址、监听端口及进程命令/工作目录 | 默认 8771；复用服务可能仍载入旧 Python 代码，不能仅凭页面刷新判断服务已更新 |

各浏览器、origin 和端口的设置/缓存互相隔离。用 8772 测试源码能避免干扰 8771 日常入口，但也会使用另一份浏览器存储；不能据此证明原入口的升级恢复正确。

macOS 可用以下只读命令检查安装启动器与监听进程：

```sh
cat /Applications/星轨.app/Contents/Resources/launcher-config.json
lsof -nP -iTCP:8771 -sTCP:LISTEN
```

`launcher-config.json` 的 root 若为相对路径，按 `.app` 所在目录解析。不要以两个目录内容相似为由清理仍被启动器引用的运行目录。切换目录前先保留配置和旧运行包，切换后重开并核对实际服务内容。

## 干净环境到首次运行

推荐使用当前 CI 的 **Node.js 22、Python 3.12**；其他版本需单独验证。旧说明中的 Node 18+ 是历史环境指引，不代表本批确认过全部低版本组合。浏览器需要 WebGL 2 和正常的本地存储权限；分辨率、GPU 和系统配置会影响显示能力。

先取得完整源码工作副本，进入含 `package.json` 的目录，再执行：

```sh
node --version
python3 --version
npm ci
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r scripts/cloud-requirements.txt
npm run test:docs
npm test
npm run build
python scripts/serve.py --port 8772 --open
```

以上为 macOS/Linux shell 示例。Windows 可用 `.venv\Scripts\Activate.ps1` 激活 Python 环境，再运行等价命令；macOS 启动器仅用于 macOS。需要源码授权时应使用获准的仓库地址和访问方式。网页入口与源码仓库入口是不同交付物。

`npm ci` 按锁文件安装依赖。Python 的云图处理依赖为 NumPy、Pillow、h5py、certifi；本机启动器寻找的是系统已安装 Python，不会自动选择仓库 `.venv`。如命令行能处理云图而 Finder 启动失败，应核对两条入口实际使用的 Python 和依赖环境。

中国星官修改还需保留固定资料基线、成员目录身份与图像来源。数据制备与图像配准分别核对，不得把现代 AI 辅助教学意象写成古籍原图；检查无插画星官、三垣二十八宿导航、切换、旧场景、收藏以及照片。来源说明与图像许可应随便携包保留。

正常构建使用已准备好的 `assets/`；不需要重跑原始 EXR、MODIS、城市影像或天区数据制备。只有明确更换对应资源时才安装额外地理/数据处理依赖并执行制备脚本。重制后应保存来源、日期、范围、处理参数与校验值，并按[素材说明](../素材与迁移说明.md)更新归属。

## 测试分层与证据

| 层次 | 入口 | 能证明的范围 |
| --- | --- | --- |
| 文档与例子 | `npm run test:docs` | 文档约定、例子和受支持的结构校验；具体检查以脚本输出为准 |
| 默认自动回归 | `npm test` | 当前 package.json 显式串联的数值、模块、资源、状态与 Python 服务检查 |
| 专项自动回归 | `node tests/<专题>.mjs`、`python3 tests/<专题>.py` | 所选场景；需要在报告中记录命令，不能以存在脚本推断已执行 |
| 格式检查 | `npm run format:check` | 手写 JavaScript/CSS 的固定格式规则；不等于功能验证 |
| 拆分产物 | `node tests/web-build.mjs dist`；`node tests/web-build.mjs dist-local` | 入口体积、资源路径、源文件字节/哈希、原始模型和元数据等产物检查 |
| 真实浏览器 | `tests/browser/` 中的对应 fixture，加实际界面步骤 | WebGL、布局、输入、导入往返、异步切换与照片/离线行为；多数 fixture 需先 bundle 或注入真实页面 |
| 发布包 | `python3 scripts/check-docs.py --package ...` 加 ZIP 检查和冷启动 | 实际用户拿到的文档、引用与包内容；仓库链接完好不能代替此项 |
| 运行/部署 | 实际 HTTP 版本、入口和脚本哈希及启动器检查 | 所检查地址确实提供预期构建；不证明所有功能或所有用户设备均正常 |

默认 `npm test` 不等于递归执行 tests 目录，更不等于运行全部浏览器 fixture。本批 Pages 配置在安装依赖后按 `test:docs → test → build:web → web-build` 执行。该配置的本地检查与远端实际运行分开记录；远端 CI 是否通过以对应发布运行的结果为准。

修改算法时优先检查数值和独立参考；修改状态/缓存时检查启动、切换、取消、删除与失败竞态；修改画面时检查主画面、巡天和照片。历史 `v*-validation.json`、截图和数据只对对应版本/样本有效。报告应记录环境、命令、版本/提交、结果、证据位置和未完成项，模板及范围见[验证指南](verification.md)。

## 三种构建

```sh
npm run build
npm run build:web
node tests/web-build.mjs dist-local
node tests/web-build.mjs dist
```

| 命令 | 主要输出 | 适用入口 |
| --- | --- | --- |
| `npm run build` | `StarOrbit.html`，随后生成 `dist-local/`；另有旧入口跳转文件 | 单文件直接打开，或本机服务 |
| `npm run build:local` | `dist-local/index.html`、哈希资源、version.json | 本机轻量入口，不重新生成单文件 |
| `npm run build:web` | `dist/index.html`、哈希资源、version.json | 静态网页部署 |

拆分构建会清空并重新生成自己的输出目录。`assets/app.bundle.js` 是构建中间产物，不是独立发布源文件。不要把仅构建 `dist-local/` 的结果当作单文件也已更新。

`serve.py` 在存在 `dist-local/index.html` 时，将 `/` 和 `/StarOrbit.html` 映射到轻量入口；对应 `/assets/` 从拆分目录优先提供。单文件和本机页面在同一版本下字节也不同，因此要对比“所用构建”的入口，不能拿单文件哈希对比轻量 HTTP 入口。

静态网页版没有 Python 服务；构建时的 `__WEB_BUILD__` 决定相关入口能力。需要本机处理的太阳/云图更新不能只靠上传静态文件启用。具体运行模式矩阵见[产品范围](product-scope.md)。

## 本地版本更新

每批已授权修改遵守仓库 `AGENTS.md`：版本只递增一次，同时更新 package.json 的 version/displayVersion、package-lock.json 项目版本、README 当前版本及构建页面版本；CHANGELOG 顶部保留简短中英总结，详细证据放稳定文档或版本记录。

当前显示版本使用 v1.31，对应包元数据采用项目既有的 `1.0.31` 规则。不要直接把二者当作同一字符串，也不要只改一个页面上的可见文本。使用手册和现行工程文档应标明适用版本；已归档历史说明保持原版次。

本地版本递增不自动代表已上线或已发布下载包。记录中应分别说明源码、本机运行、网页版和 Release 的已核验状态。检查失败或未执行时保留明确结果，不把“准备发布”写成“正式发布”。

## 便携包和 macOS 启动器

先生成单文件，再执行打包脚本。下面以本批本地 v1.31 的新输出路径为例；脚本读取源码版本，不按文件名决定版本：

```sh
python3 scripts/package-portable.py output/release131/StarOrbit-v1.31-portable.zip
python3 -m zipfile -t output/release131/StarOrbit-v1.31-portable.zip
python3 scripts/check-docs.py --package output/release131/StarOrbit-v1.31-portable.zip
shasum -a 256 output/release131/StarOrbit-v1.31-portable.zip
```

需要 macOS 启动器时，先在装有 Swift/Xcode 命令行工具的 Mac 上生成一个**尚不存在**的 `.app` 路径，再把它交给打包脚本：

```sh
python3 scripts/create-macos-launcher.py --root . --output output/release131/launcher/星轨.app --portable
python3 scripts/package-portable.py output/release131/StarOrbit-v1.31-portable.zip --macos-launcher output/release131/launcher/星轨.app
python3 -m zipfile -t output/release131/StarOrbit-v1.31-portable.zip
python3 scripts/check-docs.py --package output/release131/StarOrbit-v1.31-portable.zip
```

生成工具需要 swiftc、lipo、sips、iconutil 和 codesign。当前脚本构建 arm64/x86_64 的 macOS 12+ 启动器并做本地 ad-hoc 签名；签名检查不能替代公证或所有系统的启动验收。脚本拒绝覆盖已存在的 `.app`；更换已有启动器前保留旧副本和配置。

打包检查至少覆盖：

1. ZIP 可完整读取，包内版本、单文件及可选启动器与本批构建一致。
2. 用户手册、来源/署名、许可和引用资源在包内可用；源码与测试链接明确指向相应仓库版本。
3. 解压到新的目录，在允许的浏览器中启动；分别检查直接文件和本机服务路径。
4. 断网时可用的是内置资源及此前已缓存的范围；对未缓存的外部影像/高程核对回退提示。
5. 若包含 `.app`，从解压后的最终位置运行，确认 `root:"."` 正确；不要仅在源码旁边测试启动器。

v1.29 的单文件预算为 500 MB，便携包解压后的运行文件预算为 600 MB；覆盖 319 幅中国星空教学插画、完整月面地名及着陆目录、地质纹理和原图，以及随包可读的资料署名；宇宙探索馆使用程序化模型，不新增大型贴图。打包预算由脚本执行，不能因本地有全部资源就把原始处理数据、依赖缓存和开发输出一并分发。文档/署名引用检查与运行资产检查互相补充：前者通过不证明渲染正确，后者通过也不证明使用手册可读。

## 运行版本与哈希核对

在源码目录记录预期版本和文件哈希：

```sh
node --input-type=module -e 'import fs from "node:fs"; const p=JSON.parse(fs.readFileSync("package.json")); console.log({version:p.version,displayVersion:p.displayVersion});'
shasum -a 256 StarOrbit.html dist-local/index.html dist/index.html
```

测试本机日常入口时，保存真实响应并与对应轻量入口比对：

```sh
curl --fail --silent --show-error --max-time 20 http://127.0.0.1:8771/StarOrbit.html -o output/release131/served-index.html
shasum -a 256 output/release131/served-index.html dist-local/index.html
```

如果安装根目录与当前源码不同，应与安装根目录中的目标产物比对，再确认它与本批构建一致。核对真实入口引用的 `assets/app.bundle-<hash>.js`，下载该脚本并比对 SHA-256；文件名内的短哈希不是完整 SHA-256 结果。

`/api/status` 只回报固定应用标识，`version.json` 也只回报显示版本。完整核对需同时看入口页面、引用脚本和相应产物。浏览器可能持有旧入口缓存，重载后还应读取页面顶部版本和真实请求资源。

安装启动器可运行 `Contents/MacOS/StarOrbitLauncher --check`，并检查 Info.plist 的版本、`launcher-config.json` 根目录、codesign 和二进制架构。`--check` 会启动/复用本机服务；其 READY 仅表明文件和服务探测成功，不能证明页面版本、视觉效果或所有 API 正确。

## 升级、备份与故障恢复

升级前明确保留三个层次：

- **运行文件**：旧便携包或旧运行目录、对应版本、必要哈希、启动器和 root 配置。保留路径不能与即将清空的构建目录重合。
- **用户数据**：界面导出的主场景、天气/太阳快照、自定义模型和轨道原文件。独立自由飞行、观测库、音乐和全部偏好没有统一导出包，需另行保留浏览器配置数据。
- **本机云图库**：默认 `~/Library/Application Support/Tiangong Orbit Simulator/clouds`，或 `TIANGONG_CLOUD_CACHE` 指定目录；备份/恢复前停止对应下载和服务，保留完整 PNG/JSON 配对。

“恢复出厂设置”、清浏览器数据、删本机云图库的影响不同。恢复场景文件也不会自动还原全部缓存和独立飞行存档。升级时保留同一浏览器、同一 origin 有助于继续使用原数据；更换端口或 localhost/127.0.0.1 会表现为另一份数据空间。

| 现象 | 定位与恢复步骤 |
| --- | --- |
| 源码已更新，软件仍显示旧版本 | 核对启动器 root、监听进程、实际 HTTP 入口与脚本；按实际构建位置补同步，重开后读回版本 |
| 页面新，云图/太阳接口行为旧 | 确定 8771 对应服务进程和根目录，停止该进程后从正确运行目录启动；替换 Python 文件需要重启 |
| 8771 已被占用 | 用 lsof 查看监听进程，确认它是否属于星轨；临时测试可改用 8772。未确认归属前不要停止其他应用 |
| 新版本打开后没有原收藏/存档 | 先核对浏览器、协议、主机名和端口，回到原 origin；不要先清除网站数据 |
| 特定来源下载失败 | 保留旧数据，检查该来源状态/覆盖/观测时间、Python 依赖与网络；其它允许来源和已保存快照仍可用 |
| 新构建回退到旧运行包 | 停止新服务，恢复已保留运行目录和启动器配置，重启并核对旧版本/哈希；浏览器数据是否能回退需另行确认 |

Python 后台服务日志通常为系统临时目录下 `tiangong-viewer-<port>.log`。诊断时记录相关错误与时间，不需要公开用户原始导入数据或整个浏览器配置。回退二进制/静态文件不保证反向迁移新版本的浏览器数据库；保留升级前用户数据副本才有恢复依据。

## 外部发布边界与完成条件

本地整理、测试和构建按已授权范围完成；推送、部署及创建/更新 GitHub Release 按用户明确的发布要求执行。仓库 `AGENTS.md` 明确区分本地版本更新与 GitHub 发布，不能在本地完成后自动把下载链接改成尚不存在的版本。

获得发布授权后，使用实际仓库和既有 Pages 工作流：先核对拟发布提交和产物，通过约定检查，再推送/触发部署；等工作流完成，读取公开站点版本、入口和脚本并与本批网页构建比对。Release 则检查标签、状态、附件名/大小、版本及下载回来的包 SHA-256。发布操作成功的页面提示不能替代这些读回。

完成记录至少列出：源码提交/工作树状态、本机运行目录及版本、网页地址与核对结果、便携包路径/哈希、启动器结果、实际测试范围、未完成项。仅本地完成时直接标明“未推送、未部署、未更新 Release”；某项尚未完成时说明它影响的交付范围。

工具实现可查固定公开基线：[构建脚本](https://github.com/Wenshuishi0528/StarOrbit/blob/5ed3d96b52db26f5e9500430eec3a67a32d14f35/build.mjs)、[本机服务](https://github.com/Wenshuishi0528/StarOrbit/blob/5ed3d96b52db26f5e9500430eec3a67a32d14f35/scripts/serve.py)、[便携打包](https://github.com/Wenshuishi0528/StarOrbit/blob/5ed3d96b52db26f5e9500430eec3a67a32d14f35/scripts/package-portable.py)、[macOS 启动器](https://github.com/Wenshuishi0528/StarOrbit/blob/5ed3d96b52db26f5e9500430eec3a67a32d14f35/macos/Launcher.swift)。本地 v1.31 的文档检查和打包调整以当前工作副本及本批验证记录为准。
