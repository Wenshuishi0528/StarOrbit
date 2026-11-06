# Changelog / 更新2，记录

按开发版本倒序记录，每版保留简短中英总结；每次完成更新继续在顶部追加。早期缺少独立证据的版本逐条标为“记录待核实”，不将后续累计功能倒填。

Development versions are listed newest first with concise Chinese and English notes; each completed update is added at the top. Early versions without separate evidence are explicitly marked unverified.

## v1.14 — 2026-11-06 · 正式版 / Release

将常驻的镜头目标栏并入「视角」菜单，按目标、居中／全貌、观察方向分组；合并重复的返回航天器操作，保留双击模型居中与独立镜头跟随，适配窄屏及四种语言；展开菜单不再被轨道地图等浮动窗口遮挡。默认测试、格式检查、三种构建和浏览器实际操作检查通过。

**English:** Merged the persistent camera-target bar into the Views menu, grouping target selection, recenter/all-craft framing and viewing directions. Removed the duplicate return-to-craft action while retaining double-click focus and independent camera following, with compact-screen and four-language support. Open menus stay above floating panels. Default tests, formatting checks, all three builds and browser interaction checks passed.

## v1.13 — 2026-11-06 · 本机版 / Local build

仅整理手写 JavaScript 与 CSS 的换行、缩进、空格及括号排版，重点展开 app.js、weather.js 等长行；不改变函数划分、名称、执行顺序、异步等待或错误处理。新增固定版本 Prettier 配置及 format／format:check 命令；排除依赖、生成产物、数据与带精确替换标记的 HTML 模板。旧源码断言适配空白变化。此格式整理随 v1.14 一并发布。

**English:** Formatting-only cleanup of handwritten JavaScript and CSS, expanding dense app.js/weather.js code without changing functions, names, execution order, async waits or error handling. Added pinned Prettier configuration and repeatable format/format:check commands; dependencies, generated artifacts, data and exact-marker HTML templates remain excluded. Source-based tests now tolerate formatting whitespace. These formatting changes are included in the v1.14 release.

## v1.12 — 2026-11-06 · 正式版 / Release

巡天取景与轨道地图改为独立窗口，右侧工具列提供各自入口、打开状态和开关；桌面分开放置，窄屏上下排列，保留手动布局，关闭一个不影响另一个。修复导航球紧凑／完整版切换卡顿和漏点：过滤读数引发的无效窗口发现与布局，避免重复文字更新，切换只调整当前窗口并保留标题位置，取消几何动画造成的按钮漂移。包含 v1.07–v1.11 的自由飞行、导航球、共享星图、太阳观测、镜头目标和巡天 52 米初始位置等累计更新。

**English:** The Xuntian finder and orbit map are now independent windows with separate toolbar toggles, visible open states, responsive placement and preserved custom layouts. Fixed slow or missed compact/full navball switches by filtering text-only discovery updates, avoiding unchanged DOM writes and resizing only the affected window while keeping its header anchored without animated geometry drift. Includes the accumulated v1.07–v1.11 flight, navball, shared sky-chart, solar observing, camera-target and 52 m Xuntian placement updates.

## v1.11 — 2026-11-06 · 本机版 / Local build

新增独立镜头目标：可分别居中并跟随当前任务航天器、巡天或全部航天器，双击模型快速切换；统一主视角、导航球、巡天取景及自由飞行的镜头语义，观察不改变驾驶对象，保存镜头目标并处理目标隐藏、任务切换和返回视角。修复已有操纵暂停后点逆行不转向，自动指向显示剩余角度。导航球补齐径向、法向和目标标记，增加可记忆的紧凑图标版，保留完整版。巡天默认改为沿轨前方 52 米，启动、重开和复位一致；实际碰撞保护仍有效。

**English:** Added independent camera targets for the active mission spacecraft, Xuntian and the whole formation, with double-click focus and translation following. Main-view, navball, finder and free-flight controls now distinguish observation from piloting; camera targets persist and recover across hidden targets, mission changes and view returns. Fixed retrograde guidance remaining paused in an existing pilot session and added remaining-angle feedback. Navballs gain radial, normal and target markers plus a persistent compact icon layout. Xuntian now starts and resets 52 m ahead, retaining actual collision protection.

## v1.10 — 2026-11-06 · 本机版 / Local build

取消主导航球、自由飞行和对接训练在关闭稳定辅助时的人为角速度上限；持续施力继续加速，松手保持惯性，SAS 以有限力矩制动。高转速飞行可正常存取，RCS 设置明确区分辅助转速上限。巡天默认移到沿轨前方 100 米，按完整装配、太阳翼旋转包络和巡天尺寸自动增加大装配的初始距离，启动、重开与恢复初始位置保持一致。导航球侧边新增轨道方向、朝天／朝地与目标定向，点击后由 SAS 渐进转向；姿态说明默认折叠。星图默认次高密度并启用避让，旧最高档设置升级时下调一档。

**English:** Removed artificial angular-rate caps during unassisted steering in the main navball, free flight and docking training. Sustained torque keeps accelerating the craft; release preserves inertia and SAS brakes with finite torque. High-rate saves remain valid and assisted-rate settings are clearly named. Xuntian starts 100 m ahead, extending that distance for larger assemblies using the station/solar-wing sweep and telescope envelope; startup, reopening and reset share this placement. Navball-side SAS buttons turn toward orbital directions, zenith/nadir and the companion target. Attitude guidance is collapsed by default; chart density defaults one step below maximum, with a one-time migration of old maximum settings.

## v1.09 — 2026-11-06 · 本机版 / Local build

主导航球增加惯性转向、RCS 平移与 SAS 稳姿，可切换操纵任务航天器和巡天，并与取景方向联动；各模块统一 KSP 键位。巡天新增准星识别、随机搜索推荐和深空目标；主画面、取景和照片共用星图分类及密度，最高密度显示视野内全部符合选项且未被遮挡的目录标注。新增四波段 SDO 太阳观测、共享更新缓存、快照导入导出及带观测时刻的照片；桌面可更新，网页版可导入快照。修复短按漏响应、切船惯性、输入框残留推力和太阳成像亮度，补齐可核实的历版记录；本批尚未发布 GitHub。

**English:** Added inertial steering, RCS translation and SAS stabilization for the selected mission spacecraft or Xuntian, synchronized finder pointing and consistent KSP keys. Finder crosshair identification, randomized search suggestions and deep-sky targets share chart categories and density with the main view and photos; maximum density includes all eligible, unoccluded labels. Four-band SDO observations add shared caching, desktop updates, portable web snapshots and dated photos. Fixed missed short inputs, switched-craft coasting, residual thrust after focusing inputs and solar-image brightness; consolidated verifiable release history. This batch has not been published to GitHub.

[操作、取舍与验证](docs/v1.09-pilot-star-chart.md) · [太阳观测与来源](docs/solar-observations.md)

## v1.08 — 2026-11-06 · 本机版 / Local build

新增自由飞行导航球、姿态辅助、对接相机与捕获条件读数，RCS 按飞船设置，对接容差按任务保存。修复切船后的键盘焦点，碰撞显示具体原因，并提供历史轨迹开关。主页面可开启导航球；小窗口支持拖动、锁定、保存及恢复布局。

**English:** Added a free-flight navball, attitude assistance, a docking camera and capture-limit readings, with per-vessel RCS and saved per-mission docking tolerances. Fixed keyboard focus after craft switches, explained collision causes and added a trail toggle. The main view gains an optional navball and movable windows with saved layouts, locking and reset.

[操作与验证](docs/v1.08-flight-instruments.md)

## v1.07 — 2026-11-06 · 本机版 / Local build

新增自由飞行。神舟和天舟可从当前装配的各自接口解锁、独立绕飞，再手动或辅助回接。支持切换驾驶、近站碰撞、对接相机、拍照、检查点和独立飞行存档。

Free flight lets you undock Shenzhou and Tianzhou from the current station assembly, pilot either ship while both keep moving, and dock again at their original ports. It includes proximity collisions, docking cameras, photos, checkpoints and separate flight saves.

## v1.06 — 2026-11-05 · 正式版 / Release

巡天取景新增独立的星名显示与 PNG 星名选项。文字随镜头转动、滚转和变焦，避开遮挡。

The Xuntian finder can label visible stars and Solar System bodies. A separate option includes names in saved PNGs.

## v1.05 — 2026-11-05 · 正式版 / Release

启用主画面的星图标注后，会同时显示视野内的恒星、行星、太阳和月球名称。太阳系标签随天体移动，并避让遮挡和其它标签。

Enabling the main sky chart displays star and Solar System names. Labels follow moving bodies and respect occlusion and label spacing.

## v1.04 — 2026-11-05 · 本机版 / Local build

主场景星空加入七颗行星，巡天可按名称搜索、跟踪和拍摄太阳、月球与行星，并可用长焦观察相位、云带与土星环。

Seven planets now move through the main sky. Search the finder for the Sun, Moon and planets, track them over time, and zoom in to photograph phases, cloud bands and Saturn’s rings.

## v1.03 — 2026-11-05 · 本机版 / Local build

巡天启动和重新打开时位于空间站沿轨前方 30 米，镜头朝前，滚转归零。取景窗可一键恢复初始位置与朝向。

Xuntian starts 30 m ahead of the station, facing along the orbit with zero roll. Reopen the finder or use Restore initial position to return to this pose.

## v1.02 — 2026-11-05 · 本机版 / Local build

巡天拍摄计划的轨道总览改为从赤道高度正视地球。水平拖动时赤道保持水平，可点选倾斜轨道定位曝光时刻。

The survey planner now shows Earth from the equator with north up. Drag horizontally to rotate around Earth, or click the inclined orbit to select a time.

## v1.01 — 2026-11-05 · 正式版 / Release

巡天新增城市搜索、天球／地面／站体瞄准锁定、滚转、随轨道扫视、大取景窗和可调外景视锥，并更新至 V28 模型。取景与照片复用主场景银河图源，改善星点清晰度；首次运行默认精细 8K。阳台半球默认朝向天顶，巡天拍摄计划默认 16K 银河，并新增赤道视角与升降交点。

**English:** Xuntian gains city search, sky/ground/station pointing locks, roll, orbital scanning, a larger finder and an adjustable exterior field guide, with the V28 model. Finder and photos reuse the main sky imagery with sharper star sampling, and new installations default to detailed 8K. The balcony hemisphere opens at the zenith; the survey planner defaults to the 16K Milky Way and adds an equatorial view and orbit nodes.

[使用手册](使用说明.md#主页面的巡天望远镜)

## v1.00 — 2026-11-05 · 本机实验版 / Local preview

阳台观测扩展到天宫、东方红一号和导入任务，按各自星历与同一地点天际线预演或实时守候。长曝光新增跟踪对照和地面追拍，巡天排程可交给主场景补拍并查看带遮挡信息的四格成果。新增可携原星历、时刻和参数重开的本机观测记录，并更新东方红一号随包根数；观测、导入与记录恢复检查通过。

**English:** Balcony observing now supports Tiangong, DFH-1 and imported missions using each target’s orbit and the selected site skyline. Added paired and ground-tracking long exposures, survey follow-up in the main telescope and four-frame results with occultation information. Local observation records preserve their ephemerides and settings, bundled DFH-1 elements were refreshed, and observation/import/reopening checks passed.

[任务实验室指南](docs/v1.00-observing.md)

## v0.99 — 2026-11-05 · 本机实验版 / Local preview

巡天取景跟随主场景地表、云与银河设置，修复日面过暗和银河细节丢失，并按屏幕实际像素绘制。新增大取景窗、曝光补偿、最高 3840 × 2400 PNG、日照地表指向和巡天外景近镜头，短按方向键可微调。验证日夜地表、云、星空、模型光轴与照片尺寸。

**English:** The finder now reuses the active surface, clouds and sky at display resolution, fixing dark daytime terrain and lost Milky Way detail. Added a larger view, exposure compensation, PNGs up to 3840 × 2400, sunlit-ground pointing, an exterior close-up and short-key fine steering. Checks cover terrain, clouds, sky pixels, model pointing and image dimensions.

[取景画质与操作](docs/v0.99-xuntian-image.md)

## v0.98 — 2026-11-05

主页面新增实时巡天望远镜，可搜索恒星、HIP 编号或星座并自动转向，支持手动取景、焦距、口径和 PNG 拍摄。巡天与空间站同屏伴飞，位置可调，地球和站体按实际方向遮挡星空。验证自动对准、口径响应、局部遮挡与照片导出。

**English:** Added a live main-view Xuntian telescope with star/HIP/constellation search, automatic pointing, manual steering, focal length, aperture and PNG capture. Both craft share an adjustable formation view with Earth and station occultations. Pointing, aperture response, partial occlusion and photo export were checked.

[操作与数据](docs/v0.98-xuntian.md)

## v0.97 — 2026-11-05 · 本机实验版 / Local preview

长曝光新增自由取景，支持鼠标转向及键盘滚转、移动相机。巡天天区选择同步四格排程，可切换星点与 16K 银河图层、导出本圈拼图，轨道图联动曝光弧段、地球遮挡和太阳避让。阳台半球默认平视西南地平线，全球视图默认显示地平线下星空。

**English:** Long exposures gain mouse aiming and keyboard camera movement and roll. Survey fields now retarget all four exposures, with selectable star/Milky Way layers, mosaic export and orbit-map visualization of exposure windows, Earth occultation and Sun avoidance. The balcony dome opens at the southwest horizon, while the full sphere shows below-horizon stars by default.

[操作说明](使用说明.md#长曝光阳台观测与巡天排程) · [巡天数据与几何](docs/v0.97-survey.md)

## v0.96 — 2026-11-05 · 本机实验版 / Local preview

长曝光恢复天宫材质，新增四个机位、位置与角度调节、单帧取景和可选补光。阳台使用共享轨道库，从当前时刻和所选地点计算，区分有效星历、近期历史估算与回放；增加半球／全天球、经纬度与海拔、设备跟随和北向校准。随包空间站星历更新至 11 月 4 日发布的数据。

**English:** Orbital photography restores station materials and adds four camera mounts, position/angle controls, an instant finder and optional fill light. Balcony observing uses the shared orbit library and selected site, distinguishes valid ephemerides from historical estimates/replay, and adds hemisphere/full-sphere views, coordinates, altitude and calibrated device tracking. The bundled station ephemeris was refreshed to the November 4 issue.

[操作说明](使用说明.md#长曝光阳台观测与巡天排程)

## v0.95 — 2026-11-05 · 本机实验版 / Local preview

任务实验室新增与过境预报、交会对接平级的长曝光、阳台观测和巡天排程。长曝光可舱体固定或恒星锁定并导出 1080p PNG；阳台可回放过境与天际线，巡天可拖动四格曝光并检查遮挡、转向冲突。验证曝光几何、有效星历内的北京过境、排程约束和切页暂停。

**English:** Three peer Mission Lab tabs add orbital long exposures, balcony observing and survey planning. They provide station/star tracking with 1080p PNG export, pass replay against a site skyline, and four-tile exposure scheduling with occultation and slew checks. Validation covers camera geometry, Beijing passes within ephemeris coverage, scheduling constraints and tab-switch pauses.

[操作说明](使用说明.md#长曝光阳台观测与巡天排程)

## v0.94 — 2026-11-05

修复 WebKit 切换已保存云图时的失效图片引用，优先读取当前副本并可从本机图库恢复匹配数据。新增向日葵-9 亚太十分钟云分类和加拿大 GDPS 全球云量预报；保留区域图的缺测范围，并区分预报起报与有效时刻。

**English:** Fixed invalid image references when WebKit switches saved cloud maps, with recovery from matching local-library data. Added ten-minute Himawari-9 regional cloud classifications and Canadian GDPS global cloud forecasts, preserving missing coverage and distinguishing forecast initialization from valid time.

[云图库使用说明](使用说明.md#云图与极光)

## v0.93 — 2026-11-05

恢复浏览器可直接下载的 Live Cloud Maps 8K 图源并去除镜像极区，新增通过本机服务下载的 NOAA GMGSI 每小时 4K 红外图。NASA 新图使用紧凑灰度与有效性编码，目标 30 MB、上限 50 MB，并保留旧图库与快照兼容性。

**English:** Restored direct-browser Live Cloud Maps 8K downloads with mirrored polar areas removed, and added hourly NOAA GMGSI 4K infrared maps through the local service. New NASA maps use compact grayscale/validity encoding, targeting 30 MB with a 50 MB ceiling while retaining old-library compatibility.

[五种图源及实际大小](docs/v0.93-cloud-sources.md)

## v0.92 — 2026-11-04

修复 Safari 恢复 NASA 云图时长时间停留启动页的问题：8K 读回由逐行改为 64 行条带，保留原始数据及有效性通道。启动先恢复模型、轨道和画质，首帧后再加载已选云图，并显示分阶段状态。保留 v0.91 的小地图功能与轻量底图。

**English:** Fixed prolonged Safari startup during NASA cloud restoration by reading 64-row strips instead of individual rows, preserving the data and validity channel. Models, orbit and quality restore before the first frame; selected clouds load afterward with clear startup stages. All v0.91 minimap features remain intact.

[Safari 启动修复](docs/v0.92-startup.md)

## v0.91 — 2026-11-04

**中文：** 补齐小地图的平滑昼夜渐变和轨迹暗色描边，保留独立明亮底图、昼夜图例与原有定位交互；按要求不绘制浅色晨昏边界线。底图约 90 KB，夜区使用固定 360×180 缓冲区、重复使用像素并缓存太阳方向，不随主场景 8K 画质或窗口尺寸扩大。

**English:** Restored smooth minimap twilight and outlined tracks while retaining the bright independent base map, day/night legend and existing seeking controls. The unwanted pale terminator is omitted. The approximately 90 KB map and reused 360×180 shade buffer remain independent of main-scene quality and window size; unchanged sunlight reuses cached pixels.

## v0.90 — 2026-11-04

**中文：** 针对 v0.89 后的启动卡住反馈，撤回新增的小地图逐像素画布与晨昏线绘制，恢复修改前的成熟渲染路径。保留独立明亮底图和增强的昼夜对比，移除浅色边界线及对应图例。按用户要求仅在内置浏览器验证重开，不改主场景画质和已有设置。

**English:** Reverted the new v0.89 per-pixel minimap canvas and terminator rendering following a startup-stall report, restoring the previous drawing path. Retained the independent brighter map and stronger day/night shading, and removed the pale boundary and its legend entry. Restart validation uses the in-app browser as requested, without changing main-scene quality or existing settings.

范围与验证：[启动回退与小地图简化](docs/v0.90-minimap-rollback.md)。

## v0.89 — 2026-11-04

**中文：** 实时轨道小地图改用独立的明亮底图，增强昼夜区分，新增连续晨昏线、窄的平滑过渡与地面昼夜图例。过去／未来轨迹保留青／金配色并增加描边，四种语言同步说明。晨昏线沿用模拟太阳与地球旋转，覆盖春秋分、至日、极区和日期变更线；主场景地表与曝光独立。

**English:** Gave the orbit minimap its own readable base map, stronger day/night contrast, a continuous ground terminator, smooth narrow twilight and a compact legend. Past/future tracks retain cyan/gold with dark outlines; labels support all four languages. Geometry reuses the simulation Sun and Earth rotation, including equinoxes, solstices, poles and the date line, independently of the main scene surface and exposure.

说明与验证：[小地图昼夜显示](docs/v0.89-minimap-daylight.md)。

## v0.88 — 2026-11-04

云图入口统一为云图库，可查看版本、保存位置、下载进度和错误，并一键使用已保存图片。下载与当前画面独立，完成文件持久保存，重开可接续任务。修复来源／快照不同步、遗漏新图、目录阻塞和错误说明丢失，保留旧图库。

**English:** Unified cloud selection, previews and downloads in one library with version, location, progress and error feedback. Downloads leave the active view unchanged, completed files persist, and reopened pages reconnect to running tasks. Fixed stale selections, omitted new frames, blocking catalogue requests and lost diagnostics while preserving existing maps.

[云图库](docs/v0.88-cloud-library.md)

## v0.87 — 2026-10-30

云图统一为官方时次、浏览器缓存和本机 NASA 历史图的版本列表，刷新只查目录，下载精确到所选时次并可取消。接缝和局部缺测改为提示，NASA 保留有效性通道与明确静态回退；撤下覆盖和清晰度不足的 VIIRS 试验入口。保留收藏、导出、当前版本保护及原始试验缓存。

**English:** Unified published cloud times, browser caches and local NASA history into one version list, with catalogue-only refresh and cancellable downloads for a selected time. Seams and partial coverage become warnings; NASA retains validity data and an explicit static fallback, while the incomplete VIIRS experiment is removed from normal selection. Favorites, export, active-version protection and archived experiment data remain available.

[统一云图版本](docs/v0.87-cloud-versions.md)

## v0.86 — 2026-10-30

**中文：** 数据与资源新增历史云图入口：按 UTC 日期/小时查询 NASA SATCORPS GCC V2A，按日期/昼夜下载 VIIRS 科学预览。支持完整性校验、去重、预览、收藏和导出，沿用容量管理；NASA 仅通过质量检查后可手动应用，历史下载不改变当前云图或自动跟随结果。

**English:** Added exact-date cloud history downloads for SATCORPS GCC V2A and daily VIIRS day/night scientific previews, with integrity checks, cache reuse, preview, favorites and export. History shares cache limits but never automatically changes the current cloud map; only screened NASA frames can be applied manually.

使用与限制：[历史云图](docs/v0.86-cloud-history.md)。

## v0.85 — 2026-10-30

**中文：** 新增独立 VIIRS 云图样本对比窗口，保留现有云图与默认设置。可查看 2026-10-28 NOAA-20 白天/夜间晴空置信度预览，以及内置静态图；支持亚洲、日期线和北极视图，明确标出无数据、样本日期与预览分辨率。未将试验掩膜用于模拟器云层。

**English:** Added an isolated VIIRS sample viewer without changing existing cloud sources or defaults. Compare NOAA-20 daytime/nighttime clear-sky-confidence previews for 2026-10-28 with the bundled static map, including Asia, date-line and polar views. Missing data, sample date and preview resolution remain explicit; the experiment does not replace simulator clouds.

样本、限制与验证：[VIIRS 云图试验](docs/v0.85-viirs-trial.md)。

## v0.84 — 2026-10-30

NASA 云图增加异常亮度平台、日期线及长直线接缝检查，不合格下载、旧缓存或导入文件不能覆盖合格版本，自动清理保护两代合格图。暂停无法可靠还原云层的 GitHub 增强图源，保留历史预览与导出，无合格下载时明确回退内置云图。

**English:** NASA maps now screen broad brightness plateaus and long seams; rejected downloads, caches and imports cannot replace accepted maps, and cleanup protects two accepted generations. Paused the unrecoverable enhanced GitHub source while retaining historical previews/exports and clearly labeling the bundled fallback.

[云图质量与回退](docs/v0.84-cloud-quality.md)

## v0.83 — 2026-10-30

2026 Q2 地表改用质量筛选的 NASA MODIS NBAR 季度合成，减少源观测条带，并校正反射率、sRGB 与大气光照标度。改善细节块、日期线和部分加载交点的硬边，保留 2004 地表与夜景选项，明确缺测及质量后备。

**English:** Replaced the 2026 Q2 surface with a quality-screened NASA MODIS NBAR composite and corrected reflectance, sRGB and atmospheric-lighting scales. Smoothed tile edges, the date line and partial-load junctions while preserving the 2004 surface, night maps and explicit missing-data/quality fallback.

[地表反射率与大气](docs/v0.83-surface-radiometry.md)

## v0.82 — 2026-10-29

**中文：** 新增 2026 第二季度约 1 公里白天地表（约 52.87 MB），保留 NASA 2004 原版切换；使用固定 RGB 真彩色显示，避免中间调过度提亮造成地表泛灰。仅按视角载入地表细节，选择持久化，失败保留原地图；注明海洋及缺测区域的旧图补充。

**English:** Added a selectable approximately 1 km daytime surface for 2026 Q2 alongside the original NASA 2004 map. Uses a fixed RGB true-color display without excessive midtone brightening, view-dependent detail loading, persistent selection and rollback on load failure. Ocean and missing-observation fallback areas are disclosed.

来源、处理与验证：[白天地表说明](docs/v0.82-day-surface.md)。

## v0.81 — 2026-10-29

新增 2024 年 NASA Black Marble 1 公里夜景，与 2016 原版一键切换并记住选择。新增资源约 40.4 MB，近看时最多载入四块夜景细节，不打包 500 米版；注明 2024 覆盖范围及极区旧图补充。

**English:** Added a remembered choice between 2024 NASA Black Marble 1 km night imagery and the original 2016 map. About 40.4 MB of new assets use up to four view-dependent detail tiles without a 500 m atlas, with coverage and polar fallback documented.

[2024 夜景说明](docs/v0.81-night-lights.md)

## v0.80 — 2026-10-29

顶栏新增 GitHub / Star 仓库入口，支持窄屏、键盘与多语言。按功能整理中英文项目介绍、使用手册及技术索引，便携包附带文档与插图。

**English:** Added a header GitHub / Star link with mobile, keyboard and language support. Reorganized Chinese/English overviews, the user manual and technical index, and included documentation and illustrations in portable packages.

## v0.79 — 2026-10-29

**中文：** 日期和时间合并为一个固定年月日时分秒顺序的输入框，左右方向键连续切换所有字段，上下键调整选中项。保留 12/24 小时制与 UTC+8 跳转；月末和闰日调整保持有效日期，拒绝无效日期输入。验证跨日期/时间的键盘切换与格式转换。

**English:** Combined date and time into one year-month-day hour-minute-second field, with continuous left/right segment navigation and up/down adjustment. Retained 12/24-hour formats and UTC+8 seeking; calendar stepping handles month ends and leap days, and invalid dates are rejected. Checked keyboard navigation across the date/time boundary and format conversion.

## v0.78 — 2026-10-29

修正东方红一号历史轨道的朝向与相位，以公开参数、酒泉发射面近似及多日过境时间重建，恢复上午北行、晚间东南向飞行。加入轨道面与近地点漂移，保留 2000 年切换规则并明确重建精度；新增 47 条报载时刻、方向和现代轨道不变性检查。

**English:** Corrected DFH-1’s historical plane and phase using reported geometry, a Jiuquan launch-plane approximation and multi-day pass times, restoring northbound mornings and southeastbound evenings. Added secular drift, retained the year-2000 switch and documented reconstruction limits, with 47 newspaper timing/direction and modern-orbit invariance checks.

[资料与验证](docs/v0.78-details.md) · [Sources and validation](docs/v0.78-details.md)

## v0.77 — 2026-10-29

新增默认开启的新手辅助和可调对接限速，关闭辅助即可纯手动推力／转动，不再自动阻尼或限制训练走廊与范围。有限接口体积按总相对撞击速度判定接触，记录和回放保留当时设置；验证切换、自由飞行、高速穿越与低速辅助捕获。

**English:** Added default-on beginner assistance and adjustable docking contact speed; disabling assistance removes automatic control, damping and training boundaries. Finite port volumes check total impact speed, replay retains contact-time settings, and tests cover mode changes, free flight, swept high-speed contact and assisted capture.

## v0.76 — 2026-10-29

**中文：** 新增神舟随机位置场景，可重新抽取初始位置与姿态，并将实际初始条件写入记录。取消飞行固定限速与超速提示，辅助控制改用距离制动；保留停靠点与高速撞击检查。验证随机初始状态、辅助回收、旧限速突破和高速碰撞。

**English:** Added randomized Shenzhou starts with reroll and recorded initial conditions. Removed fixed flight speed caps and overspeed warnings; assistance uses distance-based braking while preserving hold checks and high-speed collision detection. Tested random starts, assisted recovery, speeds beyond former caps and unsafe impacts.

## v0.75 — 2026-10-29

**中文：** 交会对接新增“大视窗”和“铺满窗口”，将曲线与检查项移至可滚动控制台，扩大三维画面并保留操纵、GO 与暂停。支持 Esc 逐级恢复，切换尺寸保留训练、相机与回放状态。

**English:** Added Large view and Fill window to the docking workbench, moving plots and checks into the scrollable console while preserving controls, GO and pause. Esc restores the previous layout; resizing retains training, camera and replay state.

## v0.74 — 2026-10-29

**中文：** 接入天和 V23、问天 V24、梦天 V25、神舟 V26、天舟 V27 新版模型；保留巡天、既有装配接口和太阳翼转轴。[模型核对](docs/v0.74-model-validation.json)。

**English:** Integrated the reviewed Tianhe V23, Wentian V24, Mengtian V25, Shenzhou V26 and Tianzhou V27 models, preserving Xuntian, assembly interfaces and solar-array pivots. [Validation](docs/v0.74-model-validation.json).

## v0.73 — 2026-10-29

**中文：** 修复地表高清分块在斜视时被再次混回低清底图，改善夜景城市清晰度；保留四块缓存、按需加载与纹理抗锯齿。[说明](docs/v0.73-details.md)。

**English:** Preserve loaded surface detail at oblique viewing angles instead of blending it back to the coarse global map. Keep the four-tile cache, on-demand loading and mip/anisotropic filtering. [Details](docs/v0.73-details.md).

## v0.72 — 2026-10-29

修复 NASA 云图与轨道更新的连接重试、超时衔接及错误信息，区分未发布、覆盖不足和网络失败。增加有限自动恢复、断网接续与重试时间提示，并提供约 126 KB 的本机轻量入口及 Safari 兼容修复。

**English:** Fixed cloud/orbit connection retries, timeout coordination and diagnostics, distinguishing unpublished data, insufficient coverage and network failures. Added bounded recovery, reconnection and retry feedback, a roughly 126 KB local entry page and Safari timer compatibility.

[原因、恢复规则与验证](docs/v0.72-details.md) · [Causes, recovery rules and validation](docs/v0.72-details.md)

## v0.71 — 2026-10-29

**中文：** 交会对接升级为完整训练台：三种场景、停靠点检查与 GO 放行、人工／辅助接近／保持／撤离、四元数姿态与有限角速率响应。新增方向仪表、无推力预测、事件记录、回放和 JSON／CSV 导出；捕获报告保留接触前真实读数。[模型、使用与验证](docs/v0.71-details.md)。

**English:** Expanded docking into a staged training workbench with three scenarios, hold-point checks and GO clearance, manual/assisted/hold/retreat modes, quaternion attitude and bounded angular-rate response. Added directional instruments, coast prediction, event logs, replay and JSON/CSV export. Capture reports preserve actual pre-contact readings. [Model, usage and validation](docs/v0.71-details.md).

## v0.70 — 2026-10-29

**中文：** 整理任务实验室：过境预报固定显示航天器、地点和轨道时段覆盖，计算成功后收起参数并展示结果；对接画面与读数、控制并排，窄窗口控制区独立滚动。保留原计算和训练逻辑，统一云图来源名称。[说明与验证](docs/v0.70-details.md)。

**English:** Reorganized the Mission Lab with spacecraft, observer and orbit-coverage summaries, results shown after successful pass calculation, and docking controls alongside the viewport. Narrow layouts keep the viewport visible while controls scroll independently. Calculation and training models are preserved; cloud-source names are aligned. [Details and validation](docs/v0.70-details.md).

## v0.69 — 2026-10-28

**中文：** 修复环境收藏覆盖缓存与更新偏好的问题，兼容旧收藏。首次使用仅展开任务与时间，增加全部展开／收起；截图、摄影与收藏集中归类。窄窗口使用工具菜单和可收起小地图，避免遮挡读数与入口，并修正弹窗返回焦点。[说明与验证](docs/v0.69-details.md)。

**English:** Saved environments now preserve global cache and update preferences, including when loading legacy presets. New sessions expand only mission and time controls, with expand/collapse-all actions and grouped photography tools. Narrow windows use a tools menu and collapsible orbit map, with corrected dialog focus restoration. [Details and validation](docs/v0.69-details.md).

## v0.68 — 2026-10-28

**中文：** 新增统一“数据与资源”面板，清楚区分已下载、正在使用、无更新与检查失败；优化 NASA 云图检查和数据复用。缓存自动清理默认开启，保护当前数据、收藏与设置引用；避免重复下载、解码及轨道重建。[使用与验证](docs/v0.68-details.md)。

**English:** Added a unified Data & resources panel distinguishing downloaded, active, unchanged and failed states. Improved NASA checks and data reuse. Automatic cache cleanup is enabled by default and protects active, starred and referenced data; redundant downloads, decoding and orbit regeneration are avoided. [Usage and validation](docs/v0.68-details.md).

## v0.67 — 2026-10-28

**中文：** 修复轨道总览远景云层的雪花缺口与时间轴“上一个事件”反复跳回同一事件的问题。过境预报改为方向/时刻三阶段指引、时间—仰角曲线和拖动读数。核对当前空间站轨道与官方逐项一致，并更新内置快照至 10 月 28 日—11 月 4 日。[说明与验证](docs/v0.67-details.md)。

**English:** Fixed cloud depth artifacts when zooming out and repeated Previous-event selections. Pass forecasts now show three viewing stages, an elevation-over-time plot and an interactive direction readout. Verified the active CSS ephemeris against the official source and refreshed the bundled October 28–November 4 snapshot. [Details and validation](docs/v0.67-details.md).

## v0.66 — 2026-10-28

新增任务实验室：按地点预报过境、绘制天空轨迹与导出日历，并提供独立交会对接训练、舰载相机和捕获判定。轨道时效、暂停隔离、四语界面及轨道／几何／浏览器检查一并完善。东方红一号铭牌分离红底材质和浮雕，修复反光色斑、重复金边，并连接阶梯外框。

**English:** Added the Mission Lab with site-based pass forecasts, sky tracks, calendar export and independent docking training with a body-fixed camera and capture checks. Orbit-age limits, pause isolation and four-language workflows were checked against orbital, geometry and browser references. The DFH-1 plaque separates enamel from relief, removing painted highlights and duplicated gold borders and joining its stepped frame.

[使用与验证](docs/v0.66-flight-lab.md) · [Usage and validation](docs/v0.66-flight-lab.md) · [说明与验证](docs/v0.66-details.md) · [Details and validation](docs/v0.66-details.md)

## v0.65 — 2026-10-28

**中文：** 东方红一号替换为新版整星模型，包含修订腰带、单台地平仪、靠下的长天线底座、两个太阳角计和平顶铭牌；保留米制尺寸、朝向及轨道姿态控制。[说明与验证](docs/v0.65-details.md)。

**English:** Replaced DFH-1 with the revised complete satellite, including the waist fittings, single horizon sensor, lower antenna mounts, two Sun sensors and planar-relief plaque. Preserved metre scale, body axes and orbit/attitude controls. [Details and validation](docs/v0.65-details.md).

## v0.64 — 2026-10-28

**中文：** “夜面也显示云层”现在实际控制夜面暗云对城市灯光的遮挡，厚云遮蔽、薄云透光；关闭后恢复无遮挡夜景。移除地表重复遮挡并保留日面光照。[说明与验证](docs/v0.64-details.md)。

**English:** The night-cloud option now controls city-light occlusion: thick clouds obscure lights and thin clouds transmit partially; disabling it restores the clear night view. Removed duplicate surface attenuation while retaining daylight illumination. [Details and validation](docs/v0.64-details.md).

## v0.63 — 2026-10-28

**中文：** 取消夜云的 800 倍月光增亮，去除深夜固定环境补光，使普通云和体积云在夜侧接近黑色；保留日面亮度、晨昏照明与云层遮挡。[说明与验证](docs/v0.63-details.md)。

**English:** Removed the 800× moonlight boost and deep-night ambient fill from regular and volumetric clouds. Night clouds remain nearly black while daytime lighting, twilight and cloud occlusion are preserved. [Details and validation](docs/v0.63-details.md).

## v0.62 — 2026-10-28

**中文：** 修复夜面云层发白及开关改变白天亮度的问题：恢复太阳光照、云内阴影与大气处理，仅在夜面加入受月相、方向和遮挡约束的微弱月光。保留设置、预设和场景分享。[说明与验证](docs/v0.62-details.md)。

**English:** Fixed bright white night-side clouds and the toggle changing daytime brightness. Restored solar lighting, cloud self-shadowing and atmospheric transport; added weak night-only moonlight constrained by phase, direction and occultation. Preferences, presets and scene sharing remain supported. [Details and validation](docs/v0.62-details.md).

## v0.61 — 2026-10-28

**中文：** 云层设置新增默认关闭的“夜面也显示云层”，同时支持普通云层和 8K 体积云；选项随环境预设与分享场景保存。[说明与验证](docs/v0.61-details.md)。

**English:** Added an optional “Show clouds on the night side” setting for both regular and 8K volumetric clouds, saved with environment presets and shared scenes. Off by default. [Details and validation](docs/v0.61-details.md).

## v0.60 — 2026-10-28

**中文：** 修复东方红一号轨道总览缺口：改为直接绘制当前航天器的完整轨道椭圆，不再受时间窗口限制；切换年代时整体切换轨道，保留日照／地影配色。[说明与验证](docs/v0.60-details.md)。

**English:** Fixed the missing arc in the DFH-1 orbit overview by drawing the complete active orbital ellipse without a time window. Era changes replace the whole orbit; sunlight/eclipse colours are preserved. [Details and validation](docs/v0.60-details.md).

## v0.59 — 2026-10-28

**中文：** 修复东方红一号启动时混入随机背景音乐的问题；自动播放等待任务恢复，旧曲目的结束事件与过期重播回调不再影响当前音频。[说明与验证](docs/v0.59-details.md)。

**English:** Fixed random background music starting before the DFH-1 mission was restored. Autoplay now waits for mission selection; stale media-end events and repeat callbacks no longer affect the active audio. [Details and validation](docs/v0.59-details.md).

## v0.58 — 2026-10-27

**中文：** 8K 极光改为体积光幕，加入卷曲亮弧、向上散开的绿光、淡红上缘和局部粉紫底缘；采用限分辨率、低频更新与静止画面缓存。4K 保留原效果。[说明与验证](docs/v0.58-details.md)。

**English:** Rebuilt 8K auroras as emissive volumes with curled arcs, spreading green veils, faint red tops and sparse pink-violet lower edges. Bounded resolution, throttled updates and static-frame caching control rendering cost. The original 4K effect is preserved. [Details and validation](docs/v0.58-details.md).

## v0.57 — 2026-10-27

**中文：** 8K 极光改为柔和的宽幅发光区，加入蜿蜒亮弧、缓慢起伏和高度分层；4K 保留原效果。共享小纹理、单批绘制并按需简化，降低计算开销。[说明与验证](docs/v0.57-details.md)。

**English:** Added soft, broad auroral emission, winding bright arcs and gently animated height layers in 8K, while preserving the original 4K effect. Shared small textures, one draw batch and adaptive detail reduce rendering work. [Details and validation](docs/v0.57-details.md).

## v0.56 — 2026-10-27

**中文：** 地球地点标识新增三级主要城市，默认显示一级，可逐级增加；与首都共用标注位置，支持四语、设置记忆与场景恢复，沿用按需刷新和避让。[说明](docs/v0.56-details.md)。

**English:** Added three tiers of major-city labels, with tier 1 selected by default and cumulative expansion. Cities share anchors with capitals, support four languages and saved scenes, and reuse cached layout and collision avoidance. [Details](docs/v0.56-details.md).

## v0.55 — 2026-10-27

新增东方红一号实时遥测：太阳与红外参考探头产生连续调频声音，支持单路、10 秒实验路序和电压波形。音频跟随轨道、姿态、自旋及时间操作，保留历史录音与四语界面；探头几何、PCM 鉴频和音频状态检查通过。

**English:** Added live DFH-1 telemetry with continuous FM audio from reference Sun/IR probes, individual channels, a ten-second experimental sequence and voltage traces. Audio follows orbit, attitude, spin and time controls while retaining historical recordings and four languages; geometry, PCM demodulation and lifecycle checks passed.

[说明](docs/v0.55-details.md) · [Details](docs/v0.55-details.md)

## v0.54 — 2026-10-27

**中文：** 日期与时间合并为一个输入栏，保留原有键盘调整、日期选择和 24h／12h 切换。

**English:** Combined date and time into one input bar, preserving keyboard editing, the date picker and 24h/12h switching.

## v0.53 — 2026-10-27

**中文：** 新增公开网页累计访问数，本地和网页共用计数模块，支持缓存和四语显示；仅正式网站记录访问，通过固定接口传输计数标识。[说明](docs/v0.53-details.md)。

**English:** Added a public web visit counter shared by local and web builds, with caching and four-language display. Only the official website records visits, using a fixed counter identifier. [Details](docs/v0.53-details.md).

## v0.52 — 2026-10-27

**中文：** 修复较高轨道下地表与城市夜景细节变糊的问题：高清分块按视角和屏幕像素需求加载，取消 2,000 公里固定高度限制；保持原有缓存和单路解码上限。

**English:** Fixed blurry ground and city-light detail at higher orbital altitudes. Detail tiles now follow camera projection and screen resolution instead of a fixed 2,000 km cutoff, retaining the existing cache and single-decoder limits.

## v0.51 — 2026-10-27

**中文：** 东方红一号在 2000 年以前使用 1970 年公报的历史轨道参数（439 × 2384 km、68.5°、114 分钟），2000 年起自动切换现有轨道；位置、地面轨迹和轨道事件同步切换。分界采用 UTC+8。[说明](docs/v0.51-details.md)。

**English:** Dong Fang Hong 1 uses the 1970 communiqué’s historical orbit (439 × 2384 km, 68.5°, 114 minutes) before 2000, then automatically switches to the current orbit. Position, ground tracks and events follow the same UTC+8 boundary. [Details](docs/v0.51-details.md).

## v0.50 — 2026-10-26

**中文：** 恢复时间框的分段键盘操作：左右键选择时、分、秒及 AM／PM，上下键调整当前项，保留直接输入和 24h／12h 切换。

**English:** Restored segmented keyboard editing for time: left/right selects hours, minutes, seconds or AM/PM; up/down adjusts the selected part. Direct typing and the 24h/12h switch remain available.

## v0.49 — 2026-10-26

**中文：** 左侧日期时间默认使用 24 小时制，新增紧凑的 24h／12h 切换并记住选择，保留日期选择器与 UTC+8 时区。

**English:** The orbit date/time input now defaults to 24-hour time, with a compact, remembered 24h/12h selector. The date picker and UTC+8 time zone are preserved.

## v0.48 — 2026-10-26

**中文：** 普通音乐播放器明确显示“列表循环”，列表末尾回到首曲持续播放；单首歌单使用原生音频循环。东方红一号保留专属广播循环。

**English:** The regular music player now shows Repeat playlist and continuously wraps from the last track to the first. Single-track playlists use native audio looping; Dong Fang Hong 1 retains its exclusive broadcast loop.

## v0.47 — 2026-10-26

**中文：** 新增东方红一号专属广播彩蛋，使用提供的乐曲与遥测音频，完整播放后间隔 5 秒循环；切换其他航天器时恢复原音乐。复用左下角播放器，支持暂停、音量和从头播放。

**English:** Added an exclusive Dong Fang Hong 1 broadcast Easter egg using the supplied melody and telemetry recording, with a five-second gap between repeats. Switching away restores the previous music; the existing player provides pause, volume and restart controls.

## v0.46 — 2026-10-26

**中文：** 时间轴收起后仅在右下角显示“展开时间轴”按钮，释放原时间轴占用的画面空间。

**English:** Collapsing the timeline now leaves only an Expand timeline button in the bottom-right corner, freeing the timeline’s screen space.

## v0.45 — 2026-10-26

**中文：** 星空显示默认改为“观赏增强 · 16K 银河”，同步更新四语引导和说明。整体画质继续默认标准 4K，保留已有保存设置。

**English:** Changed the default sky display to Enhanced · 16K Milky Way and updated guidance in all four languages. Overall quality remains Standard · 4K, with saved preferences preserved.

## v0.44 — 2026-10-26

**中文：** 软件正式更名为“星轨 · StarOrbit”，统一四语界面、帮助、桌面应用、导出文件及说明文档。GitHub 仓库更名为 StarOrbit，在线版启用新网址；保留现有存档与数据兼容。[详情](docs/v0.44-details.md)。

**English:** Renamed the app to StarOrbit across all four interface languages, help, desktop launcher, exports and documentation. Renamed the GitHub repository to StarOrbit with a new Pages URL, preserving existing storage and data compatibility. [Details](docs/v0.44-details.md).

## v0.43 — 2026-10-26

**中文：** 航天器姿态新增通用三轴调节，空间站和卫星均可用输入框或滑条控制 X 滚转、Y 俯仰、Z 偏航，角度同步显示，支持姿态归零并按任务保存。拖动复用模型与太阳翼遮挡缓存。[详情](docs/v0.43-details.md)。

**English:** Added shared three-axis attitude controls for stations and satellites, with synchronized numeric inputs and sliders for X roll, Y pitch and Z yaw, reset and per-mission persistence. Editing reuses model geometry and solar occlusion caches. [Details](docs/v0.43-details.md).

## v0.42 — 2026-10-26

**中文：** 帮助介绍新增“下一个”，画质介绍前移并分为整体画质、星空画质两个入口，分别用箭头定位控件，教程末尾新增隐藏航天器名称说明。首次使用默认标准 4K 与“4K · 星表观赏”，保留已保存设置。原创内容采用 CC BY-NC 4.0，商用须经作者书面许可。[详情](docs/v0.42-details.md)。

**English:** Added Next navigation to help cards and moved quality guidance ahead of exploration, with separate overall and sky quality entries pointing to their controls, plus a final tour step for hiding spacecraft labels. First-time defaults are Standard · 4K and 4K · Star catalog view; saved preferences are preserved. Original content uses CC BY-NC 4.0; commercial use requires the author’s written permission. [Details](docs/v0.42-details.md).

## v0.41 — 2026-10-26

**中文：** 帮助改为可边看边操作的箭头与高亮引导，选择条目时自动展开、定位对应控件，点击画面保持打开。新增独立画质介绍，推荐“精细 · 8K”并指向画质选择。桌面与窄屏布局、四语说明同步更新。[详情](docs/v0.41-details.md)。

**English:** Help now reveals and highlights real controls with arrows while remaining open during interaction. Added a dedicated quality guide recommending Fine · 8K and pointing to the selector. Updated desktop/mobile placement and all four languages. [Details](docs/v0.41-details.md).

## v0.40 — 2026-10-26

**中文：** 新增 GitHub Pages 在线版，与桌面版共用源码和版本号，模型、贴图与音乐按需加载。新增四步首次导览与右上角帮助，支持四种语言；网页版默认使用内置轨道和云图，保留文件导入。详见[网页版说明](docs/v0.40-details.md)。

**English:** Added a GitHub Pages web edition sharing the desktop source and version, with on-demand model, texture and music loading. Added a four-step welcome tour and upper-right help in four languages. The web edition uses bundled orbits and clouds with file import support. See [details](docs/v0.40-details.md).

## v0.39 — 2026-10-26

新增俄语和法语并记住语言选择；时间步进可跨天、跨年，轨迹、小地图和事件同步延续且保留播放状态。星历区间外复用开普勒轨道估算，计算与缓存不随跨度增长；全套测试和 27 项浏览器检查通过。

**English:** Added persistent Russian and French interfaces and continuous time stepping across days and years, keeping tracks, minimap and events synchronized with playback. Cached Kepler approximations support times outside ephemeris coverage at bounded cost; the full test suite and 27 browser checks passed.

[更新说明](docs/v0.39-details.md) · [details](docs/v0.39-details.md)

## v0.38 — 2026-10-26

新增 1 秒／1 分／10 分／1 小时时间步进，默认 1 分，时长选择跨任务和重启保存。步进保留播放与倍速，现实时间转为 1× 自定义播放，到轨道边界暂停；支持中英文提示与键盘操作。全套测试、32 项浏览器检查及本机启动器核验通过。

**English:** Added persistent 1-second, 1-minute, 10-minute and 1-hour time steps, defaulting to 1 minute. Steps preserve playback/speed, transition real time to custom 1× and pause at ephemeris boundaries, with bilingual keyboard-accessible controls. The full test suite, 32 browser checks and launcher verification passed.

[时间步进说明](docs/v0.38-details.md) · [验证记录](docs/v0.38-validation.json)

## v0.37 — 2026-10-26

新增公共轨道事件时间轴，显示日照／半影／全影、近远地点与赤道交点，支持时间范围、类别筛选、定位和折叠。拖动保留播放，可提前 30 秒观看或到事件自动暂停；复用分批计算和缓存，处理掠影与任务切换。全套测试和 74 项浏览器检查通过。

**English:** Added a shared orbit-event timeline for sunlight/eclipses, apsides and equator crossings, with range/category filters, seeking and collapse. Scrubbing preserves playback, with a thirty-second lead-in and optional event pause; batched cached calculations handle grazing events and mission changes. The full test suite and 74 browser checks passed.

[时间轴说明](docs/v0.37-details.md) · [验证记录](docs/v0.37-validation.json)

## v0.36 — 2026-10-26

新增“地理与星图”分组和国家、首都、边界、海域、地貌、河湖标注；北京使用红星，中国轮廓采用天地图官方数据。小地图可识别航天器下方区域，地理设置跨任务共用并支持记忆、预设和场景分享。批量绘制与缓存控制开销，数据和浏览器回归检查通过。

**English:** Added a Geography & star chart group with country, capital, boundary, sea, landform, river and lake labels, including a Beijing star and official Tianditu China geometry. The minimap identifies the region beneath the craft, and shared settings support persistence, presets and scenes. Batched cached drawing bounds resource use; data and browser regressions passed.

[地理与星图](docs/v0.36-details.md)

## v0.35 — 2026-10-26

新增分层星图标注：361 颗主要恒星、965 条已收录星名、牛郎／织女／北极星精选，以及可独立开关的 88 星座名称、连线和边界。提供中英文、密度调节、遮挡和避让，跨任务共享资源与偏好。复用字图与排版缓存，兼容旧设置、收藏及场景，数据与浏览器检查通过。

**English:** Added layered sky labels for 361 major stars, 965 catalogue names, an Altair/Vega/Polaris preset and independent names, lines and boundaries for 88 constellations. Chinese/English labels support density, occlusion and spacing, sharing resources and preferences across missions. Cached glyph/layout work preserves old settings, presets and scenes; data and browser checks passed.

[星图标注](docs/v0.35-details.md)

## v0.34 — 2026-10-26

修复航天器表面的条纹状自阴影，阴影偏移与范围按模型尺寸适配。静止或仅移动镜头时复用阴影与遮挡计算，太阳、自旋和太阳翼变化时更新，全影时跳过无效绘制。完成最高画质下空间站与东方红一号的 GPU 阴影、光照和清晰度回归。

**English:** Fixed striped spacecraft self-shadows with model-scale-aware bias and coverage. Cached shadows and occlusion refresh for Sun, spin and array changes instead of camera-only movement, skipping unlit work in eclipse. Highest-quality station/DFH-1 GPU shadow, lighting and clarity regressions passed.

[修复与验证](docs/v0.34-details.md)

## v0.33 — 2026-10-26

小地图点击或拖动定位保留运行／暂停状态和原倍速，现实时间拖动后从选中时刻以 1× 继续。修复指针取消与失去捕获后的拖动结束，验证天宫、东方红一号和设置恢复。

**English:** Minimap seeking now preserves playback/pause and speed, with real-time scrubbing continuing at 1× from the selected time. Pointer cancellation and lost capture finish cleanly; both missions and saved-state recovery were checked.

[小地图播放状态](docs/v0.33-validation.json)

## v0.32 — 2026-10-26

修复东方红一号全影中的固定展示反光，所有航天器统一使用辅助照明开关。精细档 HDR 增加最高 4× MSAA，并随浏览器缩放、跨屏和模型预览更新像素比。验证四档地影、补光、任务切换与 GPU 抗锯齿。

**English:** Fixed DFH-1’s persistent studio reflections in eclipse and unified spacecraft auxiliary lighting. Detailed HDR gains up to 4× MSAA and refreshed pixel density after browser zoom, display changes and model previews. Checks cover eclipse lighting, fill light, mission switching and GPU antialiasing.

[光照与清晰度修复](docs/v0.32-details.md)

## v0.31 — 2026-10-26

新增全局音乐播放器，内置六首 AAC，随机首曲并按列表循环，切任务或调时间不打断播放。支持导入去重、移除恢复、排序、音量与进度，圆形音符可展开操作，曲库和偏好独立保存。真实播放、离线、恢复、失败回滚和多标签页检查通过。

**English:** Added global music with six AAC tracks, a random first track and playlist looping independent of mission/time changes. The expandable note control supports deduplicated imports, removal/restoration, ordering, volume and seeking, with separate library/settings storage. Playback, offline use, recovery, rollback and multi-tab checks passed.

[全局音乐与验证](docs/v0.31-details.md)

## v0.30 — 2026-10-26

修复 NASA 云图重启恢复，更新期间继续使用上次完整图片。新增配置 JSON、GLB 与轨道文件的航天器导入和持久化，模型比例、轴向、自旋与更新源可配置，公共环境和任务轨道分开管理。验证导入回滚、模型方向、刷新、场景往返及跨任务资源复用。

**English:** Fixed NASA cloud restoration and retained the last complete image during updates. Added persistent spacecraft import from configuration, GLB and orbit files, with configurable scale/axes/spin/update sources and separate shared-environment/mission-orbit storage. Import rollback, axis mappings, reloads, scene round-trips and resource reuse were checked.

[模块化任务与公共资源](docs/v0.30-details.md)

## v0.29 — 2026-10-26

新增通用航天器／任务框架和东方红一号，独立管理模型、轨道、姿态、功能及镜头记忆。东方红一号使用 CelesTrak GP／SGP4，支持在线更新、轨道导入、惯性定轴和可关闭的 120 转／分历史自旋，并校正模型比例与轴向。升级场景兼容与缓存隔离，修复恢复竞态、手动翼角记忆和鼠标旋转；自动、浏览器及独立 Skyfield 对照检查通过。

**English:** Added a shared spacecraft/mission framework and DFH-1 with independent models, orbits, attitudes, capabilities and camera memory. DFH-1 uses CelesTrak GP/SGP4 with updates/imports, inertial pointing, optional historical 120 rpm spin and corrected scale/axes. Scene compatibility and isolated caches fix restoration races, array-angle persistence and mouse rotation; automated, browser and independent Skyfield checks passed.

[任务框架与验证](docs/v0.29-details.md)

## v0.28 — 2026-10-25

新增天气与奇观：云内闪电、红色精灵、蓝色喷流、夜侧气辉和流星，可选自然或增强模式。效果遵循云层、地球遮挡与大气透射，限制事件与资源开销，支持时间控制、记忆、预设和分享。现象为程序模拟，不代表实时观测。

**English:** Added lightning, sprites, blue jets, night airglow and meteors with Natural/Enhanced modes. Effects follow clouds, Earth occlusion and atmospheric transmission, with bounded resources and support for time controls, persistence, presets and scenes. These are simulated phenomena, not live observations.

[天气与奇观](docs/weather-phenomena.md)

## v0.27 — 2026-10-24

启动图标改为手绘三舱构型，校准天和、问天、梦天与太阳翼位置，方形舱段使用直角箱体和侧面阴影。同步绘图源、1024 px 原图、完整图标尺寸及 macOS 启动器。

**English:** Replaced the launcher icon with an illustrated three-module station, correcting module/array placement and angular box sections. Updated the drawing source, 1024 px artwork, icon sizes and macOS launcher.

## v0.26 — 2026-10-24

新增场景分享，通过 JSON 保存组合、太阳翼、时间、镜头和环境设置，并自带轨道数据。导入暂停在分享时刻，匹配本机天气快照，缺失时明确回退；导入前检查格式、层级和数值。验证递归组合、文件往返、刷新恢复、缺失资源和无效输入。

**English:** Added JSON scene sharing for assemblies, arrays, time, cameras and environment settings, including orbit data. Imports pause at the shared time, match local weather snapshots or provide an explicit fallback, and validate structure and numeric ranges. Recursive assemblies, file round-trips, reloads, missing resources and invalid inputs were checked.

## v0.25 — 2026-10-24

左侧六个设置模块可独立展开／收起，保留控件数值并记忆折叠状态，恢复默认可重置。支持中英文、键盘与窄屏，验证独立性和重开恢复。

**English:** Six sidebar modules now expand/collapse independently while preserving values and remembering their state, with factory reset support. Bilingual, keyboard and narrow-screen behavior plus reload recovery were checked.

## v0.24 — 2026-10-23

GitHub 云图新增自适应遮罩重建，减轻碎片和阶梯边缘，保留原始缓存；无法恢复上游大范围误分类。独立 Worker 一次处理并由普通云、体积云和云影共享遮罩。轨道数据框增加开关和关闭按钮，视角菜单支持点击展开、外点和 Esc 收起。

**English:** Added adaptive GitHub cloud-mask reconstruction to reduce fragments and stepped edges while preserving raw caches; large upstream classification errors remain unresolved. A one-shot worker shares the processed mask across regular/volume clouds and shadows. Orbit readouts gain visibility controls, and the view menu supports click, outside-click and Escape dismissal.

[处理依据与验证 / Method and validation](docs/v0.24-details.md)

## v0.23 — 2026-10-23

稳定体积云纹理梯度并移除低密度硬截断，保留弱云过渡。对照原始 Alpha 确认灰块和阶梯缺口来自 GitHub 图源，保留原缓存和其他来源，不以模糊掩盖缺失信息。自动测试和生产着色器 GPU 检查通过。

**English:** Stabilized volume-cloud texture gradients and removed the low-density cutoff. Raw-alpha comparisons traced grey blocks and stepped gaps to the GitHub source; caches and alternative sources remain intact without blur hiding missing information. Automated and production-shader GPU checks passed.

[诊断、修正范围与参考 / Diagnosis, scope and references](docs/v0.23-details.md)

## v0.22 — 2026-10-23

8K 太阳星芒仅在视线掠过大气边缘时渐入，白昼关闭，光晕随消光和遮挡连续变化。修正晨昏高亮色彩及地球／月球遮挡，复用 HDR 缓冲。自动测试与 GPU 太阳／遮挡检查通过。

**English:** In 8K, solar starbursts fade in only near the atmospheric limb, with extinction and occlusion controlling glare. Corrected twilight highlight colors and Earth/Moon masks while reusing HDR buffers. Automated and GPU Sun/occlusion checks passed.

[实现、验证与参考 / Implementation, validation and references](docs/v0.22-details.md)

## v0.21 — 2026-10-23

针对 GitHub 增强灰度云图加入连续透明度校正，减轻灰底遮挡海洋，普通云、体积云、云影和夜光共用。兼容历史 PNG／JPEG 并保留原始缓存；这是显示校正，不能恢复严格晴空／薄云分类。自动测试与 GPU 检查通过。

**English:** Added a continuous opacity correction for enhanced GitHub cloud maps, reducing the grey veil consistently across clouds, shadows and city lights. Legacy PNG/JPEG caches remain intact; the display correction cannot recover scientific clear-sky/thin-cloud classification. Automated and GPU checks passed.

[图源含义、处理与验证 / Source interpretation, processing and validation](docs/v0.21-details.md)

## v0.20 — 2026-10-23

8K 大气改用六波长光谱，修正白昼紫边并保留晨昏过渡与弱气辉。太阳圆面、光晕和空间站照明随大气光程变色，并处理地球、月球及云层遮挡。复用 HDR，仅增加 6 KiB 查找表，自动与 GPU 检查通过。

**English:** Six-wavelength atmospheric transport fixes daytime purple edges while retaining twilight and faint airglow. The Sun, glare and station lighting follow atmospheric color and Earth/Moon/cloud occultation. Existing HDR is reused with a 6 KiB lookup; automated and GPU checks passed.

[实现、验证范围与参考资料 / Implementation, validation and references](docs/v0.20-details.md)

## v0.19 — 2026-10-23

加入轻量多次散射和线性 RGB 合成，修正白昼大气低层偏暖，保留自然晨昏变化。新增微弱夜侧气辉，修正云层前方的大气光程，并按画面尺寸复用 HDR、失败时降级。新增查找表 6 KiB，自动与 GPU 检查通过。

**English:** Added compact multiple scattering and linear RGB compositing to correct warm daytime limbs while preserving twilight. Faint night airglow and cloud-aware atmospheric paths reuse viewport-sized HDR with fallback on failure. The extra lookup uses 6 KiB; automated and GPU checks passed.

[实现、验证范围与参考资料 / Implementation, validation and references](docs/v0.19-details.md)

## v0.18 — 2026-10-23

改善 8K 大气边缘、晨昏和云层受光，减少内存使用。新增 NASA 8K 全球云图，按最近 30 天每日时次筛选并验证全球及极区覆盖，失败保留合格缓存，兼容历史和统一更新。移除旧 2024 NASA 图，保留 GitHub 来源；加载、缓存迁移及构建检查通过。

**English:** Improved 8K atmosphere, twilight, cloud lighting and memory use. Added NASA 8K global cloud composites with rolling thirty-day coverage checks and cache fallback, integrated with history and unified updates. Retired the 2024 NASA map while preserving GitHub data; loading, cache migration and build checks passed.

[修改详情与参考资料 / Details and references](docs/v0.18-details.md) · [云图处理与更新规则 / Cloud processing](docs/cloud-sources.md)

## v0.17 — 2026-10-23

云图优先无损 PNG，兼容历史 JPEG，保留 8K 尺寸、遮罩通道及厚云浓淡，并修复重选画质后退回内置图。新增带图标的 macOS 启动应用，支持 Intel／Apple Silicon 和后台服务复用。

**English:** Prefer lossless PNG clouds while retaining legacy JPEG, 8K dimensions, mask metadata and cloud-density variation; reselecting quality no longer loses the downloaded map. Added an illustrated macOS launcher for Intel/Apple Silicon with a reusable background service.

## v0.16 — 2026-10-23

整合 8K 地表与城市夜光细节、随时间变化的月球与月相、16K 银河、四档画质、动态／体积云及云图／极光更新。新增设置记忆、恢复默认和环境收藏，小地图可拖动站点或点轨迹定位时间。发布离线便携版，保留递归组合、太阳翼追日、中英文及全屏适配。

**English:** Integrated detailed 8K Earth/city lights, time-based Moon phases, a 16K Milky Way, four quality levels, dynamic/volume clouds and cloud/aurora updates. Added saved settings, factory reset, environment presets and minimap time seeking. Released an offline portable build retaining recursive assembly, solar tracking, bilingual UI and fullscreen adaptation.

## v0.15 — 记录待核实 / Record pending verification

尚未找到本版独立的提交、发布说明或版本文档，具体改动与日期待核实。

**English:** No separate commit, release note or version document has been located for this version; its changes and date remain unverified.

## v0.14 — 记录待核实 / Record pending verification

尚未找到本版独立的提交、发布说明或版本文档，具体改动与日期待核实。

**English:** No separate commit, release note or version document has been located for this version; its changes and date remain unverified.

## v0.13 — 记录待核实 / Record pending verification

尚未找到本版独立的提交、发布说明或版本文档，具体改动与日期待核实。

**English:** No separate commit, release note or version document has been located for this version; its changes and date remain unverified.

## v0.12 — 记录待核实 / Record pending verification

尚未找到本版独立的提交、发布说明或版本文档，具体改动与日期待核实。

**English:** No separate commit, release note or version document has been located for this version; its changes and date remain unverified.

## v0.11 — 记录待核实 / Record pending verification

尚未找到本版独立的提交、发布说明或版本文档，具体改动与日期待核实。

**English:** No separate commit, release note or version document has been located for this version; its changes and date remain unverified.

## v0.10 — 2026-10-21

修正空间站相对地面轨迹的朝向和全屏／窗口尺寸适配。支持通过尾口递归添加天和核心舱，新节点可继续连接其他舱段并列入左侧组合列表。

**English:** Corrected ground-track-relative station attitude and fullscreen/window resizing. Added recursive Tianhe assembly through aft ports, with further attachments available at each new core and listed in the sidebar.

## v0.9 — 记录待核实 / Record pending verification

尚未找到本版独立的提交、发布说明或版本文档，具体改动与日期待核实。

**English:** No separate commit, release note or version document has been located for this version; its changes and date remain unverified.

## v0.8 — 记录待核实 / Record pending verification

尚未找到本版独立的提交、发布说明或版本文档，具体改动与日期待核实。

**English:** No separate commit, release note or version document has been located for this version; its changes and date remain unverified.

## v0.7 — 2026-10-21

首个完整留存的软件版本：离线三维空间站支持重复部署飞船、自由组合及单轴／双轴太阳翼控制。整合公开轨道、现实／自定义时间、昼夜和自动追日，地影内太阳翼继续转动。提供三档地球、星表星空、小地图、截图和中英文界面。

**English:** The earliest fully preserved software version combines an offline 3D station, repeatable spacecraft, free assembly and single-/dual-axis solar-array control. Published orbits, real/custom time, day/night lighting and eclipse-aware solar tracking share one simulation. Includes three Earth tiers, catalogue stars, a minimap, screenshots and bilingual UI.

## v0.6 — 记录待核实 / Record pending verification

尚未找到本版独立的提交、发布说明或版本文档，具体改动与日期待核实。

**English:** No separate commit, release note or version document has been located for this version; its changes and date remain unverified.

## v0.5 — 记录待核实 / Record pending verification

尚未找到本版独立的提交、发布说明或版本文档，具体改动与日期待核实。

**English:** No separate commit, release note or version document has been located for this version; its changes and date remain unverified.

## v0.4 — 记录待核实 / Record pending verification

尚未找到本版独立的提交、发布说明或版本文档，具体改动与日期待核实。

**English:** No separate commit, release note or version document has been located for this version; its changes and date remain unverified.

## v0.3 — 记录待核实 / Record pending verification

尚未找到本版独立的提交、发布说明或版本文档，具体改动与日期待核实。

**English:** No separate commit, release note or version document has been located for this version; its changes and date remain unverified.

## v0.2 — 记录待核实 / Record pending verification

尚未找到本版独立的提交、发布说明或版本文档，具体改动与日期待核实。

**English:** No separate commit, release note or version document has been located for this version; its changes and date remain unverified.

## v0.1 — 记录待核实 / Record pending verification

尚未找到本版独立的提交、发布说明或版本文档，具体改动与日期待核实。

**English:** No separate commit, release note or version document has been located for this version; its changes and date remain unverified.

## 既有数据与素材来源 / Earlier data and asset sources

| 来源 / Source | 项目用途 / Use |
| --- | --- |
| [中国载人航天工程办公室 / BACC](https://en.cmse.gov.cn/news/202107/t20210722_48418.html) | 公开轨道记录，在有效时间范围内插值 / Published orbital ephemerides |
| [Solar System Scope / INOVE](https://www.solarsystemscope.com/textures/) | 基础档地球、云层、夜光与海洋遮罩，CC BY 4.0 / Base Earth textures |
| [NASA Blue Marble Next Generation](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography/) | v0.16 的 8K 地表与近距离细节切片；2004 年历史合成 / Daytime surface detail |
| [NASA Black Marble 2016](https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/) | v0.16 城市夜光细节，Suomi NPP / VIIRS 历史合成 / City-light detail |
| [Live Cloud Maps](https://github.com/matteason/live-cloud-maps) | 可更新云图；v0.17 优先使用 PNG 的 alpha 遮罩。Contains modified EUMETSAT data |
| [NOAA SWPC OVATION](https://www.swpc.noaa.gov/products/aurora-30-minute-forecast) | 极光预测覆盖网格 / Aurora forecast coverage |
| [NASA Cloudy Earth](https://science.nasa.gov/earth/earth-observatory/cloudy-earth-85843/)、[Clouds on the Move](https://science.nasa.gov/earth/earth-observatory/earths-clouds-on-the-move-154443/) | 本地生成云系的地理分布参考 / Geographic cloud-pattern references |
| [d3-celestial / XHIP](https://github.com/ofrohn/d3-celestial)、[StarSky Studio](https://github.com/Wenshuishi0528/StarSkyStudio) | 41,411 条目录星、星空显示与普通银河效果 / Star catalogue and styling |
| [NASA SVS Deep Star Maps 2020](https://svs.gsfc.nasa.gov/4851/) | 原生 16K 银河背景；NASA/Goddard SVS、Ernie Wright、ESA/Gaia/DPAC / Enhanced Milky Way |
| [NASA SVS CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/)、[Astronomy Engine](https://github.com/cosinekitty/astronomy) | 月面素材与太阳/月球位置计算 / Lunar texture and astronomical calculations |

素材处理、署名、授权与精度说明见 [素材与迁移说明](素材与迁移说明.md)。历史条目依据本仓库 Git 提交、版本文档及 [GitHub Releases](https://github.com/Wenshuishi0528/StarOrbit/releases) 整理；最早完整源码为 v0.7，最早现存软件 Release 为 v0.16。已核对主模型项目和桌面运行目录的文档；v0.1–v0.6、v0.8–v0.9、v0.11–v0.15 尚无可逐版确认的独立记录，未以模型版本或后续累计功能代替。
