# 验证与验收指南

适用版本：本地 v1.37。作者：Wenshuishi。本文说明如何验证当前能力和保存证据；实际通过范围以对应版本的执行记录为准。本页不是标准符合性认证。

[能力与范围](product-scope.md) · [使用手册](../使用说明.md) · [技术资料索引](README.md) · [更新记录](../CHANGELOG.md)

## 基线、结果与证据

`product-scope.md` 的能力ID依据现行实现建立。v1.31 世界视图的实际检查见[v1.31 执行记录](v1.31-validation.json)；[v1.30 执行记录](v1.30-validation.json)保留生日明信片的历史结果。以下流程和目标不能替代对应项目的实际结果。

[v1.20 执行记录](v1.20-validation.json)保留该版本的自动回归、构建和 107 项 Chrome 帮助检查等历史证据，不能作为本批中国星官功能的通过结论。v1.21 的中国星官历史验收保留于 [v1.21 记录](v1.21-validation.json)。v1.22 的坐标网与巡天距离历史结果见 [v1.22 记录](v1.22-validation.json)。v1.23 的宇宙探索验收保留于 [v1.23 记录](v1.23-validation.json)。v1.24 的月球观测与地形历史验收见 [v1.24 记录](v1.24-validation.json)。v1.25 的完整插画、月面地名与地质图历史验收见 [v1.25 记录](v1.25-validation.json)。v1.26 的全部插画方向与尺度复核保留在 [v1.26 记录](v1.26-validation.json)。v1.27 的云图库与向日葵验证保留于 [v1.27 记录](v1.27-validation.json)。v1.28 的亮度验证见 [v1.28 记录](v1.28-validation.json)。v1.29／v1.30 的生日历法、内容、巡天别名和图片导出记录保留其当时范围。

每条执行记录至少包括：

- 能力标识和检查名称，执行命令或可复现步骤、输入数据及其版本。
- 源码提交号；有未提交修改时增加工作区状态及受检文件/构建摘要。
- 时间/时区、OS、浏览器/引擎与版本、Node/Python、窗口/画质；浏览器还记录地址、网络和冷热缓存。
- 预期/实际结果、退出码或逐项断言，日志/JSON/截图/产物的相对位置及必要SHA-256。
- 状态：`passed`、`failed`、`blocked`、`not-run`；历史结果另作引用。
- 未完成范围、原因、关联问题和恢复步骤。截图不能替代交互、缓存或数值检查。

开发日志和截图可在输出目录生成；正式引用的关键摘要随版本保留。大图不随包分发时，保存必要小图、指标和步骤，并注明原始证据范围。

## v1.37 地球科学图层验收

完整`npm test`、四语言和文档检查通过；地球新数据逐文件SHA、全部304,632条记录、精确矿种筛选、聚合计数、地球两半球与海底高程、温度单位，以及三种构建的资源一致性均有检查。实际Chrome查看高程、近／短波红外、昼夜温度对比，操作稀土筛选、Bayan搜索与球面点击，查看2448×1896 PNG及其双栏来源／图例。窄窗口查看与滚轮缩放经过操作检查；没有把它当成实体手机测试。

[本批记录](v1.37-validation.json)绑定本机数据与执行范围。当前内置的是固定八日影像图集，矿点为历史档案。源码与公开网页已分别推送，Pages部署成功；线上版本、入口、脚本及新增数据摘要与本机验收构建一致。线上可见Chrome显示v1.37，但WebGL 2初始化失败，未完成线上三维交互复验；相同构建的本地画面与操作已验收，详细结果见本批记录。

## v1.36 地表加载、夜景与云图库验收

完整 `npm test`、文档与四语言检查通过。实际Chrome验收覆盖北京外围5km视野、地表缓存关闭联网后在主页复用、范围设置与清理暂停、小地图跟随/缩放/折叠和三个模式切换、云层内外观察，以及2025/2024夜景切换。2025夜景1156个AVIF全部核对尺寸与SHA，8个原始城市窗口与6处瓦片边缘核对通过。675MB单文件在真实浏览器完成启动、还原1152张夜景细节索引，并释放嵌入JSON块。

NASA预核验对三个成熟官方时次分别测出99.80%、94.77%、93.13%有效观测覆盖，单条读取7.5–9.6MB分段而非1.3–1.4GB完整NetCDF；极区条件另行核对。11月8日使用中的云图在隔离副本中实际完成浏览器与磁盘删除，切回内置，重新加载后无复活；原始用户文件保留。预核验不替代完整下载后的光学厚度与图像质量校验。

[本批记录](v1.36-validation.json)保留实际输入、构建和发布状态；原始画面与日志在开发目录 `output/release136/acceptance/`。本批未进行Safari、Firefox和移动设备验收。桌面v1.36已同步并重启空闲本机服务，启动器和新API可用；GitHub源码及v1.36便携Release已发布，Pages流水线通过，线上version.json、脚本SHA与本批网页构建一致，实际网页地表小地图和2025夜景初始化通过。

## v1.35 地形遮挡验收

检查默认关闭的「透过地形看星空」、夜间山脊遮挡与半透明切换、设置刷新恢复及3840×1702 PNG照片。北京香山一带已实际查看白天及夜间画面；距离图与大气截断、目标尺寸和分配释放、异常状态恢复由模块测试覆盖，相关地形／天空／太阳系及文档、语言和构建检查通过。

[本批记录](v1.35-validation.json)绑定本地构建摘要与执行范围，原始画面位于开发目录 `output/release135/acceptance/`。桌面v1.35已同步，启动器自检、HTTP构建摘要与实际白天山景已核验。本批未发布GitHub或网页版，未进行跨浏览器测试。

## v1.34 世界视图统一验收

完整 `npm test` 通过；后续地形接缝、异步构建、共享地球／星空、地理标注和体积极光改动通过对应定向测试。文档检查及单文件、本机拆分、静态网页构建通过。改动源码的格式检查通过；全仓格式检查仍报告未改动的 `src/xuntian-scope.js` 原有格式问题。

实际Chrome检查包括北京地面→10 km→400 km→20,000 km→地面，以及真实K键升高、香山附近山地接缝、切换西雅图自动使用其城市影像、太阳系地球昼夜／云层／背景开关、北极体积极光、中西完整连线、北斗侧视、M42搜索和DSS的0.006°放大、照片下载及返回主页资源恢复。地表返回北京后离地1.7米；图源测试包含DSS22/22及7/7瓦片实际完成。最终画面检查无WebGL控制台错误。

北京10 km稳定视角、3840×1702绘制尺寸的119帧样本：中位50 ms、P95约67.2 ms；地表数据更新中位0.1 ms、P95约0.2 ms。这是该机器和画质的实测，不代表固定帧率保证。区域网格分批生成，旧网格继续显示；新位置或退出可取消过期任务。

[本批记录](v1.34-validation.json)保留构建摘要、数值与浏览器检查。原始图和日志位于开发目录 `output/release134/acceptance/`。本批未测试Safari/Firefox、新下载天津城市包和便携ZIP；已实际检查内置北京、西雅图资源切换，缓存和共享请求另由模块测试覆盖。桌面运行目录已同步v1.34，启动器自检、HTTP脚本摘要和实际北京地景画面已核验。本批未上传GitHub或部署网页版。

## v1.33 星际穿梭验收

本机完整`npm test`、最终星际输入／数学专项、太阳系回归、四语言和文档检查通过；单文件、本机拆分与静态网页构建通过。Chrome实际运行22项检查，覆盖前往天狼星、暂停时间与位移独立、北斗侧视、航点恢复、急停／输入焦点、中文别名搜索、PNG导出、4次资源释放及太阳系往返位置和朝向。短按行为另由输入单元测试验证。

在本机2476×1702像素画布、侧视北斗、相机稳定的120帧样本中，帧间隔中位数16.7ms、P95为18.6ms；星空背景与6条连线共3次绘制，19,287个星点含太阳。反复关闭后的GPU计数均回到843个几何与13个纹理，包含主场景既有资源。新增空间数组1,234,368字节，不等于应用总内存。初次入口同步准备46.3ms。结果见[v1.33执行记录](v1.33-validation.json)。桌面启动目录已同步，实际HTTP入口与脚本SHA-256和本批构建一致；桌面入口Chrome冒烟检查无控制台错误。本批未执行Safari、移动设备或全银河数据验证，未创建ZIP或发布GitHub／网页。

## v1.32 天体观测验收

模块测试覆盖火星观测的独立Horizons基准、MOLA地形定位、真实角视场与双栏比例、日期／地点事件过滤、卫星源系数及独立星历样本。浏览器验收检查火星图层与标注、日期对比、事件跳转、地球进入地表、卫星系统与关闭后主场景恢复。当前执行结果记录在[v1.32执行记录](v1.32-validation.json)。

## v1.31 世界视图验收

- 数值：运行 `node tests/ground-world.mjs`、`node tests/ground-surface.mjs`、`node tests/solar-world.mjs`、`node tests/ground-sky.mjs`；保存实际退出码。涵盖WGS84往返、局部方向、加减速／时间独立、高程采样、地心月球位置、半年季节变化及真实半径；地面天空专项对照日月地平位置，检查高海拔、南北半球、地球遮挡和昼夜亮度。
- 地表：北京、山地、南半球和跨日界线选点；等待局部数据后观察站立高度与山体遮挡。短按、持续按、松开、反向、文字输入和窗口失焦逐一检查；W低头、S抬头。
- 天空：同一地点比较昼夜和不同季节；银河／DSS、中西连线与插画切换、地平线遮挡、拍照和照片来源分别检查。
- 联动：在UTC+8输入时刻、倍速和倒放后切换太阳系、地月与地表，确认时间、地点标记和返回后的轨道时间一致；检查真实半径与增强显示只影响尺寸。
- 生命周期：反复进入与返回、纹理与高程请求中切换、显式在线搜索失败、收藏后重开；记录网络状态、图形错误和资源释放情况。

以上为完整验收流程，已执行范围见[v1.31 执行记录](v1.31-validation.json)。

## 测试分层

| 层级 | 主要检查 | 环境与边界 |
| --- | --- | --- |
| 文档和静态一致性 | 文档版本、入口路径、相对文件链接/标题锚点、参数和默认值、公开身份、打包清单 | 仓库与最终分发包分别检查；“链接目标存在”不证明锚点、网页内容或操作正确 |
| 数值与模块回归 | 轨道、坐标、HCW、姿态、缓存事务、取消、配额、数据校验和状态切换 | `npm test`中的Node/Python检查；不少使用内存、模拟服务或固定参考，不能代替真实浏览器和在线源验收 |
| 构建与资产 | 单文件、本机拆分、静态网页的版本、模型、星历、资源路径、哈希、许可和包体约束 | 使用当前源码和实际产物；三种构建各自记录，不由网页版成功推断单文件成功 |
| 真实浏览器和输入 | WebGL实际渲染、Worker、IndexedDB、失焦/键盘/触摸、导入导出、窗口和照片 | 记录实际Chrome/WebKit等版本；模块fixture、完整应用页面和生产入口是不同测试对象 |
| 离线与恢复 | 内置资源断网启动、缓存重开、下载取消/删除竞态、来源失败、存储不可用 | 同一来源和新来源分别测试；至少一次重开页面，单页仍驻留内存不等于持久保存 |
| 本机运行与发布 | 启动器路径、HTTP实际文件、端口、进程恢复、包内文档、线上及Release状态 | 本机、远端部署和下载包独立核对；本地构建通过不改变远端发布状态 |

## 默认回归和构建入口

在源码仓库根目录执行，依赖按开发/发布说明准备。运行本机数据处理服务和部分Python回归需要 `scripts/cloud-requirements.txt` 中的依赖。

```sh
npm ci
npm run test:docs
npm test
npm run format:check
npm run build
npm run build:web
node tests/web-build.mjs
node tests/web-build.mjs dist-local
git diff --check
```

`npm run build` 生成单文件及本机拆分产物；`build:web` 生成静态网页。`tests/web-build.mjs` 默认检查 `dist/`，传 `dist-local` 检查本机拆分目录；它核对资源内容和结构，不执行实际浏览器渲染。打包后还应检查ZIP完整性、运行文件、文档/插图/许可清单和版本，记录实际大小与SHA-256。

文档修改检查准确性、链接/锚点和包内可用性；同批改变帮助、构建或分发时补做相应验证。发现新问题再扩大回归，无需无区别重复全部外部来源下载。

## 持续集成的实际覆盖

当前 `.github/workflows/pages.yml` 在main推送或手动触发时使用Ubuntu、Node.js 22和Python 3.12，安装依赖后运行 `npm run test:docs`、`npm test`、`npm run build:web` 和 `node tests/web-build.mjs`，成功后部署Pages。`test:docs`运行 `scripts/check-docs.py`、`tests/docs-examples.mjs` 和 `tests/documentation.py`。

该工作流未自动执行全部 `tests/browser/`、`format:check`、单文件/本机构建、macOS启动器、ZIP和各语言视觉检查。CI成功只覆盖列出的步骤；记录对应run ID、提交和结果。

## 能力到测试的映射

以下是重点入口，完整默认清单以 `package.json` 的 `scripts.test` 为准。代码路径对应源码仓库；执行结果关联本批JSON中的同名ID。

| 能力ID | 自动或浏览器检查入口 | 操作与通过判定 | 环境与证据 |
| --- | --- | --- | --- |
| SO-CRAFT-01 | `tests/assembly.mjs`、`tests/missions.mjs`、`tests/mission-packages.mjs`；`tests/browser/missions.js` | 切任务、改组合、合法/非法导入、快速切换和恢复；模型/轨道独立，失败保留原场景 | 模块+完整页面重开；保存输入/素材摘要、断言和截图 |
| SO-ORBIT-01 | `tests/physics.mjs`、`tests/pass-reference.mjs`、`tests/dfh1-history.mjs`、`tests/orbit-events.mjs` | 有效期内外、暂停/倍速/跳时、事件与过境；坐标/单位一致，外推和无效数据说明正确 | 固定参考+完整页面；记录星历、历元、时刻和误差口径 |
| SO-PILOT-01 | `tests/main-flight-physics.mjs`、`tests/main-flight-input.mjs`、`tests/main-flight-controller.mjs`；`tests/browser/main-flight.js`、`flight-input.js` | 短按/松开、RCS/SAS/制动、失焦/切船、范围限制和退出；无遗留指令，不改参考星历 | 模块+输入fixture+完整应用；保存对象、开关、位移和焦点转换 |
| SO-FLIGHT-01 | `tests/free-flight-physics.mjs`、`tests/free-flight-assembly.mjs`、`tests/free-flight-instruments.mjs`；`tests/browser/free-flight.js` | 两船离站/切换、原口回接/碰撞、参数更改和保存重开；两船独立，加载先暂停 | 实际GLB+同源重开；保留存档、失败原因和仪表读数 |
| SO-DOCK-01 | `tests/docking-training.mjs`、`tests/docking-assistance.mjs`、`tests/docking-workbench.mjs`；`tests/browser/flight-lab.js` | 起点、辅助/纯手动、停靠点、接触和导出；判定符合设置，快捷键不绕过限制 | 模块+训练页；记录场景、容差、辅助、接触值和JSON/CSV |
| SO-OBSERVE-01 | `tests/pass-prediction.mjs`、`tests/exposure-lab.mjs`、`tests/balcony-lab.mjs`、`tests/survey-lab.mjs`；`tests/browser/observation-archive.js`、`survey-live.js` | 切目标、地点/时段、曝光对照、排程/补拍、保存重开；正确星历/时间，缺格明确 | 固定星历+完整实验；保存输入、窗口、成片和重开结果 |
| SO-TELESCOPE-01 | `tests/xuntian-pointing.mjs`、`tests/xuntian-crosshair.mjs`、`tests/xuntian-view-render.mjs`、`tests/solar-data.mjs`；`tests/browser/xuntian-view-render.js` | 搜索/固定/手动/导航球接管、遮挡、近站深度、照片；四波段/两分辨率/坏快照；时刻与来源正确 | 模块+WebGL+下载PNG；记录构图、快照、像素/几何结果 |
| SO-WORLD-01 | `tests/ground-world.mjs`、`tests/ground-surface.mjs`、`tests/solar-world.mjs`、`tests/ground-sky.mjs`；完整应用浏览器 | 坐标、高程、键位与加速、日期天空、太阳系联动、退出恢复 | 数值日志＋真实浏览器截图与操作结果 |
| SO-EARTH-01 | `tests/city-terrain-cache.mjs`、`tests/city-terrain.mjs`、`tests/earth-elevation-math.mjs`、`tests/earth-elevation.mjs`；`tests/browser/earth-elevation.js`、`earth-elevation-geography.js` | 城市离线/下载/取消/删除/重开，高程/照片、地理开关、缺源与释放；影像/高程来源分开 | 模块+Chrome/WebKit/IndexedDB；保存视野、块数、预算、PNG和网络/重开结果 |
| SO-SKY-01 | `tests/deep-sky-catalog.mjs`、`tests/sky-detail-cache.mjs`、`tests/constellation-art.mjs`；`tests/browser/sky-detail.js`、`sky-source-switch.js` | 三种目录范围、五种影像来源、回退、共享照片、关闭释放；目录/影像天区与年代正确 | 模块+完整渲染/重开/窄屏；保存来源、视场、目录口径和PNG |
| SO-LUNAR-01 | `tests/lunar-math.mjs`、`tests/lunar-terrain.mjs`、`tests/lunar-features.mjs`、`tests/lunar-state.mjs`；实际浏览器 | NASA 参考、观测视角、真实地形、地名、事件、回放、导出、巡天交接 | 不将数值检查替代实际画面；不声称完整物理月食渲染或高分辨率地形测绘 |
| SO-COSMIC-01 | `tests/cosmic-math.mjs`、`tests/cosmic-content.mjs`、`tests/cosmic-state.mjs`；完整应用实际操作 | 五主题、参数／曲线、暂停／切页、真实目标、署名导出、四语言窄屏 | 数值与实际 WebGL 分开；记录模型边界及浏览器范围 |
| SO-RESOURCE-01 | `tests/resource-fetch.mjs`、`tests/resource-cache.mjs`、`tests/resource-recovery.mjs`、`tests/cloud-switch.mjs`、Python服务测试；`tests/browser/cloud-versions.js` | 重复下载、配额、断网、重启、收藏、取消/删除迟到响应；保留有效数据和独立错误 | 模拟服务与真实浏览器分开，使用隔离缓存；保存事务、请求和状态 |
| SO-SAVE-01 | `tests/scene-share.mjs`、`tests/environment-presets.mjs`、`tests/free-flight-instruments.mjs`；`tests/browser/missions-reload.js`、`observation-archive.js` | 场景往返、缺快照、偏好独立、飞行读取、同源重开和存储失败；临时副本明确 | 正常/受限存储及不同源对照；保存测试文件和步骤 |
| SO-DELIVERY-01 | `scripts/check-docs.py`、`tests/docs-examples.mjs`、`tests/documentation.py`、`tests/web-build.mjs`；`tests/browser/help-current.js`、`floating-windows.js`，ZIP/启动器核验 | 版本、帮助、三构建资源与包内文档一致；四语言关键入口窄屏可达；启动器目录正确 | 文档检查+三构建+解压包+实际入口；保存版本、SHA-256、签名/启动及链接检查范围 |

## 中国星官持续验收目标

以下项目按本批执行记录分别确认，不因存在实现或素材而自动通过：

1. 固定清代资料基线，核对全部天区、独立／附属星官及成员解析；HIP、Gaia 与星团身份不能互相冒用，未解析项明确记录；不造精确宿界。
2. 中西切换不改时刻、镜头方向或影像源；名称、连线、搜索、准星、成员图与四语言一致；旧体系群组不硬映射。
3. 主画面、巡天和实际 PNG 使用同一体系；深度放大图像淡出，地球遮挡、选中成员星与照片独立标注开关有效。
4. 检查密集北天、广角四象、拥挤银河天区和无插画星官；窄屏能找到天区／星官与定位，成员图可读。
5. 同源重开、场景导入导出及环境收藏恢复体系；旧场景缺字段回到西方，非法值被严格校验拒绝。
6. 反复切换、关闭和导出后核对图像请求取消、纹理预算与释放；离线内置数据和图像可用，最终便携包包含资料与各自许可。

已存在的 `tests/sky-culture-rendering.mjs` 供共享图像与文化隔离专项检查，其实际覆盖以源码和本批执行结果为准；完整应用、资料核验、存储往返和视觉检查仍需分别记录。

## 浏览器脚本如何使用

`tests/browser/` 中包含不同年代的三类入口：供Playwright CLI执行的 `async(page)=>{...}` 函数、导出检查函数的Node模块，以及需要esbuild打包后注入页面的浏览器模块。先读对应文件的说明、导出和路径；不能把所有 `.js` 逐一当作 `node file.js` 执行。

帮助目录共16个主题，首次导览保持八步。`tests/browser/help-current.js`用于核对主题目录、目标控件和退出恢复；实际执行状态由本批记录决定。

历史脚本可能固定旧文件、URL、控件或版本断言。运行前适配受检目标并记录；脚本失配与产品失败分开，跳过的断言不得记为通过。

独立真实来源检查有两个明确的Node入口，需要可用Playwright模块、相应浏览器和网络：

```sh
node tests/city-terrain-source-browser.mjs
CITY_TEST_ENGINE=webkit node tests/city-terrain-source-browser.mjs
node tests/earth-elevation-source-browser.mjs
DEM_ENGINE=webkit node tests/earth-elevation-source-browser.mjs
```

若Playwright不是源码项目的本地依赖，可按脚本说明将 `PLAYWRIGHT_MODULE` 指向实际已安装模块。Chromium路径使用 `channel: 'chrome'`，需要相应Chrome；WebKit是自动化引擎检查，不能直接代称原生Safari启动器验收。上述脚本访问真实来源并输出开发证据，不在当前默认CI中自动执行。

浏览器检查记录控制台异常和未处理拒绝，等页面/纹理就绪并查看实际画面。写设置、清缓存的测试使用独立profile/来源和服务目录。

## 离线与存储验收步骤

1. **内置离线**：在未预热的测试profile中，用已解压的单文件或本机包断开外网启动；检查两任务、内置城市、JWST和全球高程底座。网页首次加载无法等同此步骤。
2. **持久下载**：联网主动下载一个非内置城市或指定资源，等到完成状态；关闭页面，屏蔽外网，在同一来源重开，核对实际纹理/高程和目录状态。只在原页切离线不能证明跨启动保存。
3. **失败与竞态**：在请求/解码时切任务、换来源、取消或删除；延迟响应完成后确认旧数据未重新写回/应用；中断服务后恢复并确认状态可继续。
4. **清理范围**：分别检查浏览器副本、手动城市包、自动天空/高程缓存和本机云图库。验证活动/收藏保护及明确的删除提示；不对用户真实库执行破坏性验收。
5. **存储受限**：模拟IndexedDB/localStorage不可写、配额不足和事务失败，检查错误提示、内存回退与现有记录；重开后不将临时副本说成永久存档。
6. **来源隔离**：在另一个浏览器/主机名/端口打开，验证文档未承诺自动共享。场景和快照转移后分别核对配置、模型库、天气、太阳图与飞行存档，缺失资源应明确提示。

## 数据、数值与性能结论的范围

`tests/reference/`保存Skyfield轨道/过境、大气光谱等参考。记录来源、版本、输入、单位和误差定义；区分实现一致性、插值/拟合误差和真实测量精度。地形源采样核对仍需另做画面、遮挡、地理叠加和释放检查。

性能记录应注明设备、浏览器、窗口像素、DPR、画质、视野、驻留块数、网络与缓存状态、测量时长及方法。GPU预算、CPU类型数组、压缩磁盘缓存和浏览器进程RSS分别记录；历史视场的内存或帧率样本不作为全设备承诺。不存在已定义的统一FPS/启动秒数门槛时，不补造一个“达标”结果。

## 当前覆盖边界与证据索引

| 类别 | 可查资料或入口 | 使用边界 |
| --- | --- | --- |
| 当前能力基线 | [产品范围](product-scope.md)及本页能力映射 | 当前实现整理，不是追补的历史需求审批记录 |
| 本批执行 | `docs/v1.23-validation.json` | 由实际运行填写；每种未运行的浏览器、构建或来源必须保留相应状态 |
| 历版验证 | `docs/v*-validation.json`、[v0.55记录](v0.55-validation.md)、各版本专题“验证”章节 | 对应版本、样本和环境的历史证据，不能证明当前源码全部通过 |
| 高程与城市 | [地形数据和检查](v1.17-earth-elevation.md)、[城市与星空](v1.16-city-sky.md)、相关source-browser脚本 | 第三方源可能变化；完整联网检查、合成故障和离线重开分别记录 |
| 星空与太阳 | [高清星空](v1.15-sky-detail.md)、[深空目录](deep-sky-catalog.md)、[太阳数据](solar-observations.md) | 历史目录/影像年代与软件时刻分开；来源/颜色和回退按实际使用写入 |
| 自动集成 | `.github/workflows/pages.yml`与对应GitHub run | 仅证明该次列出的步骤；不等于所有浏览器、便携包和本机入口 |
| 发布与安装 | 实际构建/包摘要、入口版本和启动器配置，发布渠道的版本/URL/run/release ID | 不能用CHANGELOG中的“正式版”标签代替远端当前状态核验 |

尚无全OS/浏览器/设备支持矩阵和统一性能门槛，默认CI未聚合全部浏览器脚本。历史报告和忽略目录截图需确认仍可取得；执行记录应明确这些覆盖边界及其使用影响。
