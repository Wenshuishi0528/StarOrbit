# Changelog / 更新记录

按开发版本倒序记录，每版保留简短中英总结；每次完成更新继续在顶部追加。早期缺少独立证据的版本逐条标为“记录待核实”，不将后续累计功能倒填。

Development versions are listed newest first with concise Chinese and English notes; each completed update is added at the top. Early versions without separate evidence are explicitly marked unverified.

## v1.40 — 2026-11-10 · 本机版 / Local build

白天地表新增默认的2026 Q2原生500米级MODIS合成，采用分块AVIF并沿用各视图共用地球。海岸采用细分遮罩，海面和缺测区域使用连续海色与后备影像；1公里和NASA原版可切换。首次迁移默认图源，此后保留用户选择。

**English:** Added a default native 500 m MODIS daytime atlas for 2026 Q2, encoded as AVIF tiles and shared by all Earth views. Fractional coast coverage preserves land detail; water and gaps use continuous fallback imagery. Existing 1 km and original NASA sources remain selectable. Defaults migrate once, then preserve explicit choices.

轨道在原始星历区间外统一使用包含摄动的接续演算，修复轨道面停止进动，并统一主场景、小地图、受照及观测预测。小地图底图跟随地球图源；增加一天步进，以及独立于列表时长的上／下一次高仰角查询，默认≥60°、可调整，可选当地白天或黑夜。

**English:** Unified perturbed orbit continuation beyond recorded ephemerides across the scene, maps, illumination and observation planners. The minimap shares the selected Earth base. Added one-day stepping and previous/next high-elevation searches independent of list duration, with an adjustable 60° default and local day/night selection.

[数据来源与处理 / Data and processing](assets/earth/day-2026-q2-500m/README.md) · [本批验收 / Validation](docs/v1.40-validation.json)

## v1.39 — 2026-11-09

星际导航图增加默认简易版和可记忆的完整版切换；简易版保留导航球、二维／三维、缩放、复位、目标距离与停止。主页面、世界模式和行星观测统一同步窗口尺寸、当前屏幕像素比例与完整渲染区域。

**English:** Added a compact default stellar navigator with remembered Simple/Full switching, retaining the map, 2D/3D, zoom, reset, target distance and stop controls. Main, world and planetary views now share canvas sizing with current browser DPR and a full render viewport.

[操作 / Guide](docs/interstellar.md#星际导航图) · [验收 / Validation](docs/v1.39-validation.json)

## v1.38 — 2026-11-09 · 本机版 / Local build

星际穿梭新增二维俯视／侧视与三维导航球，共享恒星、观察者、目标和航点。支持太阳定位、真实三维距离、朝向与移动方向、边缘指示、航迹、所选星图连线、独立缩放和展开。地图单击只选择，显式看向／前往；修正点击导航地图导致自动航行停止的问题，保留窗口失焦与空格急停。

**English:** Added a shared-data stellar navigator with 2D top/side views and a 3D sphere, Sun/target/waypoint location, true spatial distances, gaze and travel direction, edge indicators, bounded trails and selected pattern lines. Map zoom/rotation are independent of the flight view. Selecting a map target preserves navigation; explicit Look/Go actions and window-blur/Space stopping remain available.

[操作与实现 / Guide and implementation](docs/interstellar.md#星际导航图)

## v1.37 — 2026-11-09

地球观测增加NASA可见光、近红外、短波红外、昼夜地表温度及同源ETOPO地形／海底高程图。新增304,632条USGS历史矿点，支持矿种筛选、搜索、按尺度聚合、点击资料及亮度调整。新增栅格统一AVIF，沿用现有观测、对比和拍照入口；图像数据期、科学图例与场景时钟分开，照片保留来源与色标。调整地球标注优先级，优先呈现主要地名。

**English:** Added NASA visible/NIR/SWIR composites, day/night land surface temperature and ETOPO elevation/bathymetry to Earth observation. Added 304,632 historical USGS mineral records with commodity filters, search, spatial grouping, record inspection and marker brightness. AVIF imagery reuses the existing observatory, comparison and photo workflow; acquisition periods, legends and scene time remain distinct. Earth labels now prioritize major places.

[来源 / Sources](assets/earth/observation/README.md) · [验收 / Validation](docs/v1.37-validation.json)

## v1.36 — 2026-11-08

地表移动时按视野加载卫星影像与分级高程，主页地球复用同一缓存；加载半径可分别调整，漫游影像和高程可独立清理。增加默认展开的位置小地图，显示朝向、地名和比例尺；云层沿用主页数据与设置，修正从云层下方观察的显示。夜景默认更新为2025年500米数据，保留2024及2016选项；新增夜景资源采用AVIF分块按需加载。NASA 下载目录自动预核验覆盖范围，可筛选基本全球版本；云图库支持确认后删除最新及收藏版本，同步清理浏览器、本机文件和完成任务引用。

**English:** Added view-driven satellite imagery and terrain streaming with caches shared by the main Earth, independent coverage radii and cache cleanup. A default-open location map shows heading, place names and scale. Clouds share the main view’s data and settings, including observation from below. Night lights now default to the 2025 nominal 500 m dataset, retain 2024/2016 options, and use on-demand AVIF tiles. NASA download listings now estimate observation coverage automatically and can filter near-global versions. Explicit cloud deletion now includes recent and favourite versions and removes browser/local copies and completed-job references.

[操作 / Guide](使用说明.md#地表观测与太阳系) · [数据与实现 / Implementation](docs/world-explorer.md) · [验收 / Validation](docs/verification.md)

## v1.35 — 2026-11-08 · 本机版 / Local build

地表新增默认关闭的「透过地形看星空」，记住选择并应用于照片；正常观察时山体遮住星空。大气与云层按真实地形距离截断，修正远山被过度冲淡的问题，日月行星标签也遵循山体遮挡。

**English:** Added an opt-in, remembered see-through-terrain mode for ground observing and photos. Mountains normally occlude the sky; atmospheric/cloud paths and celestial labels now respect the rendered terrain silhouette.

[操作 / Guide](使用说明.md#地表观测与太阳系) · [验收 / Validation](docs/verification.md)

## v1.34 — 2026-11-08 · 本机版 / Local build

地表、太阳系和星际视图共用主页的地球材质、城市影像、地形、银河／巡天图源与中西标注设置。地表统一自由移动和可见键位提示，支持地面、高空、近地轨道和完整地球间连续升降；接触高度采用原始DEM而非远景绘制网格。星际连线默认覆盖当前体系，远方巡航可独立查看太阳视角的图源和插画。

**English:** Ground, Solar System and interstellar views reuse the main Earth's materials, city imagery, terrain, sky surveys and cultural annotations. Ground navigation has one free-movement scheme, visible key guidance and continuous surface-to-space altitude presets. Contact height samples the original DEM. Interstellar views draw the active culture's spatial lines and offer a solar-origin survey/art reference during distant travel.

[实现 / Implementation](docs/world-explorer.md) · [验收 / Validation](docs/verification.md)

## v1.33 — 2026-11-08 · 本机版 / Local build

新增星际穿梭，共用世界视图、时钟、操控键与拍照；19,286颗可靠距离恒星支持自由加减速、搜索前往、回望太阳、中西星图侧视和命名航点。相对坐标、批量星点和共享纹理控制精度与资源占用；太阳／天狼星A近景使用实测半径，太阳系附近沿用几何星历。

**English:** Added interstellar travel with 19,286 distance-qualified stars, shared world navigation and photography, free movement, star travel, looking back at the Sun, spatial cultural constellations and saved waypoints. Split relative coordinates, batched points and borrowed textures bound resource use. The Sun and Sirius A use measured radii; nearby planets share the geometric ephemerides.

[数据与性能 / Data and performance](docs/interstellar.md) · [验证 / Validation](docs/verification.md)

## v1.32 — 2026-11-08 · 本机版 / Local build

新增统一天体观测入口，火星真实地形与可见光／昼夜热红外／高程／地质图、地名与着陆点、地面望远镜视角；地球复用昼夜云图与地形，可选点进入地表。加入20颗主要卫星目录与母星系统、按需加载JPL星历子集。支持事件查询、同视场日期与图层对比，以及带时间地点和来源的照片。

**English:** Added a unified observatory with measured Mars terrain, visible/thermal/elevation/geological layers, named features and landing sites, and Earth-based disk views. Earth reuses existing layers and connects to ground exploration. Twenty major moons and parent-system views use compact, on-demand ephemerides. Added event searches, equal-field date/layer comparisons and attributed photo exports.

[数据与算法 / Data and methods](docs/planetary-observatory.md) · [验证 / Validation](docs/verification.md)

## v1.31 — 2026-11-08

新增地表观测与三维太阳系入口，共用模拟时钟。地表支持内置地名／显式联网搜索、坐标与地图选点、地点收藏、默认真实地形、贴地及自由升降、共用键位与持续按键加速；自然天空、银河和DSS、中西星空图层与拍照。太阳系显示同历元日心位置、行星轨道、地月系统和地面地点，可切换真实尺寸与显示增强。局部地面使用WGS84与稳定高程采样。

**English:** Added movable ground observing and a linked 3D Solar System on the simulation clock. Ground mode supports offline names and explicit online search, coordinate/map selection, saved sites, measured terrain, grounded/free movement with shared keys and progressive speed, natural/Milky Way/DSS skies, cultural layers and photography. Solar views use geometric heliocentric positions, orbit tracks, Earth–Moon and site views, with physical or enhanced body sizes. Local terrain uses WGS84 and stable elevation samples.

[实现与计算口径 / Implementation](docs/world-explorer.md) · [本批验证 / Validation](docs/v1.31-validation.json)

## v1.30 — 2026-11-08 · 本机版 / Local build

生日卡背面改为独立星空明信片：东方／西方天区、银河／DSS背景、插画与连线分别选择；支持星名、坐标网等标注、独立亮度及缩放平移旋转。全幅横竖版与可选同尺寸导出，正反面预览分别缓存。DSS宽视场使用完整同源巡天瓦片，保留真实坐标与源配准。

**English:** Birthday backs are independent full-frame postcards with Chinese/Western fields, Milky Way/DSS backgrounds, separate artwork/lines/labels, brightness and framing controls. Landscape, portrait and front-sized exports keep separate preview caches. Wide-field DSS uses complete survey tiles and preserves celestial registration.

[本批验证 / Validation](docs/v1.30-validation.json)

## v1.29 — 2026-11-08

新增生日星空卡：太阳黄经十二宫、明确版本的值日二十八宿规则及交界日处理；完整40项白话介绍、80条可编辑祝福，中西单卡、双联与纯星图PNG导出。星图与现有插画共用投影，制卡不改动轨道时间和全局设置。支持收礼人、赠送人和赠送日期落款；背面复用软件银河星空场景与独立生日时刻，星名、插画可选，正反面PNG可一次打包ZIP。翼宿插画及其方向保持不变。巡天搜索补齐二十八宿文化全称及繁简别名；巡天视角的航天器标注统一为“巡天望远镜”和“中国空间站”。

**English:** Added birthday sky cards with tropical-zodiac and documented daily-mansion rules, cusp handling, 40 explanations and 80 editable wishes. Single, paired and plain charts export to PNG using registered artwork and real star positions without changing the simulation. Optional recipient, sender and gift-date inscriptions are supported. A matching back uses the app’s Milky Way scene at an independent birthday time, with optional labels and artwork; both PNGs can be saved together as ZIP. The Wings artwork and its orientation remain unchanged. Finder search covers all 28 cultural mansion names and common aliases; telescope views identify Xuntian and the Chinese Space Station as separate spacecraft.

[日期口径 / Rules](docs/birthday-calendar-sources.md) · [本批验证 / Validation](docs/v1.29-validation.json)

## v1.28 — 2026-11-08 · 本机版 / Local build

增加星官插画与西方星座插画独立亮度条（0–200%，默认 100%），切换体系保留各自数值，共用于主画面、巡天和照片；四象、三垣透明度仍单独控制。

**English:** Added independent Chinese asterism and Western constellation artwork brightness controls (0–200%, default 100%), saved separately and shared by the main view, finder and photos. Overview opacity remains independent.

[本批验证 / Validation](docs/v1.28-validation.json)

## v1.27 — 2026-11-08 · 本机版 / Local build

新增“NASA 全球覆盖”独立入口，从已保存或导入图中筛出全球与两极覆盖达标版本，显示覆盖比例、保留图像质量提示，未核验版本不混入。修复向日葵-9 官方文件名与内部整秒观测时间恰差一秒时被误判不符、导致最新云图下载失败的问题；保留超过一秒以及不同观测时次的拒绝检查。新增三种时间字段的正负边界回归，实测用户报告的 2026-11-08 04:00 UTC 原始文件。

**English:** Added a dedicated NASA global-coverage library view, separating verified global/polar coverage from partial or unknown coverage while retaining image-quality warnings. Fixed Himawari-9 downloads rejected at the exact one-second boundary between filename timestamps and whole-second metadata. Larger discrepancies and wrong scan times remain rejected. Added boundary regressions and checked the reported 2026-11-08 04:00 UTC source object.

[本批验证 / Validation](docs/v1.27-validation.json)

## v1.26 — 2026-11-08 · 本机版 / Local build

逐图检查全部 319 幅中国星空插画，修正弧矢箭杆朝向、猎网／尾宿／斗柄首尾及多幅细长物象的主轴。按可见主体与真实成员的整体跨度定标，消除强制包围全部星点导致的过度放大；单星保留明示的最小展示尺度。原始图像、真实星位及连线不变，增加方向与尺寸回归检查。

**English:** Reviewed all 319 Chinese sky illustrations; corrected the Bow and Arrow, net/tail/dipper directions and elongated motifs. Size now follows visible-subject and stellar spans instead of inflating narrow artwork to contain every star. Original image bytes, stellar positions and connections are retained, with new direction and scale regressions.

[审查 / Review](assets/chinese-sky/art/placement-audit.json) · [本批验证 / Validation](docs/v1.26-validation.json)

## v1.25 — 2026-11-08

修复四象／三垣总览在常用视角下不可见的问题，增加仅作用于总览的独立透明度。保留原有 39 幅图像，新增 280 幅同风格教学插画，覆盖全部 312 条星官目录，另保留 7 幅总览；真实星位和连线独立保留。月球新增 9,087 条正式地名、40 项着陆任务（39 处有坐标，中国用红星）、搜索与标注密度；将中科院 2022 公开版全月地质图重投影为三维月球图层，保留原图、图例、年代尺及导出署名。巡天选中月球时突出显示观测入口。

**English:** Restored Four Symbols / Three Enclosures overviews with independent opacity. Retained the original 39 illustrations and added 280 matching teaching artworks, covering all 312 catalog asterisms plus seven overviews without moving real stars or connections. Added 9,087 official lunar names, 40 landing records (39 located; Chinese missions use red stars), search and label density. Reprojected the CAS 2022 public geological map onto the 3D Moon, retaining the original map, legends, timescale and export credits. A contextual Moon card highlights the shared observatory in the Xuntian finder.

数值配准、完整目录、回归、四语言界面、导出、构建及本机验证见本批记录。发布准备补齐可随仓库重建的插画方案，消除测试对本机临时目录的依赖；GitHub Release 包含当前便携包与校验文件。 / See this batch’s record for registration, catalog, regression, four-language UI, export, build and local validation. Publication preparation makes the illustration brief reproducible from the repository, removing a local-output dependency; the GitHub Release provides the portable build and verification files.

[操作 / Usage](使用说明.md) · [插画 / Artwork](assets/chinese-sky/art/README.md) · [月球地质图 / Lunar geology](assets/moon/geology/README.md) · [验证 / Validation](docs/v1.25-validation.json)

## v1.24 — 2026-11-08 · 本机版 / Local build

新增月球观测工作台：独立日期与地面观测点驱动月相、天平动、方位与升落；可见光模型和真实 LOLA 三维高程共用月面方向。加入 16 个官方地名、晨昏线与月背探索、月相回放、分辨力估算、带说明的 PNG，以及保留主时钟的巡天月球追踪。原有入口整合为同一工作台，提供四语言与离线数据。

**English:** Added a lunar observatory with site/date-driven phases, libration, directions and rise/set planning, visible-light modelling and real LOLA terrain. Includes 16 verified landmarks, terminator/far-side exploration, phase playback, resolution estimates, captioned PNG export and dynamic Xuntian Moon tracking using the main clock. Shared entry points, four languages and offline assets.

默认回归、月球专项和三种构建通过；已核对真实月相、地形拾取、日期与地点、四语言窄屏、PNG 及本机巡天交接。 / Default regressions, lunar checks and all three builds passed; phases, terrain picking, site/date controls, four-language narrow layouts, PNG and local finder handoff were verified.

[操作 / Usage](使用说明.md#月球观测) · [数据 / Data](assets/moon/README.md) · [科学边界 / Science](assets/moon/SCIENCE.md) · [验证 / Validation](docs/v1.24-validation.json)

## v1.23 — 2026-11-08 · 本机版 / Local build

新增「宇宙探索馆」：超新星、中子星、脉冲星、流星与黑洞五个三维交互主题，支持参数读数、独立演示时钟、阶段拖动和带说明的示意图导出。脉冲几何与接收曲线共用计算；真实遗迹／宿主星系可直接交接巡天。明确教学模型和真实观测边界，支持四语言、窄屏、减少动态效果及离开暂停。

**English:** Added Universe explorer with five interactive 3D topics: supernovae, neutron stars, pulsars, meteors and black holes. Includes parameter readouts, independent demonstration time, timeline scrubbing and captioned image export. Pulse geometry and received profiles share one model, with finder handoff to real remnants and host galaxies. Teaching/observation boundaries, four languages, narrow layouts, reduced motion and inactive-view suspension are covered.

默认回归、宇宙模型专项和三种构建通过；实际核对五主题、参数、真实天体跳转、PNG 导出及四语言窄屏。本机应用已同步，未发布线上。 / Default regressions, cosmic model checks and all three builds passed; five topics, controls, real-target handoff, PNG export and four-language narrow layouts were checked. Local app updated; no online publication.

[操作与科学边界 / Usage](使用说明.md#宇宙探索馆) · [来源 / Sources](assets/cosmic/README.md) · [验证 / Validation](docs/v1.23-validation.json)

## v1.22 — 2026-11-08 · 本机版 / Local build

打开巡天取景默认将主镜头聚焦巡天望远镜。准星增加太阳系天体、可靠视差恒星与近处物体的实际距离，和角偏差分开，缺测明确提示。星图新增中西共用、分别控制的所选日期赤道坐标网与黄道；共享主画面、巡天照片与阳台天空，兼容旧设置和场景。

**English:** Opening the Xuntian finder now frames the telescope. Reticle readouts distinguish physical distances from angular offsets, using solar-system geometry and quality-filtered stellar parallaxes, with explicit unknown distances. Added shared equatorial-of-date and ecliptic overlays with independent switches for both sky cultures, including main view, finder/photos and balcony sky, with older-scene compatibility.

默认回归、日期坐标专项和三种构建通过；实际取景、照片开关及窄屏四语言已核对。验证范围及未运行项见记录。 / Default regressions, date-reference tests and all three builds passed; finder, photo switches and four-language narrow layouts were checked. Scope and untested environments are recorded.

[操作与边界 / Usage and scope](使用说明.md#地球星空与环境) · [本批检查记录 / Verification](docs/v1.22-validation.json)

## v1.21 — 2026-11-08 · 本机版 / Local build

新增基于清代整理资料的中国传统星官体系，含 312 条星官导航、真实成员图和共享搜索／标注。提供二十八宿主星官与 4 个常见星官的 32 幅插画，以及独立开关、默认关闭的 7 幅四象／三垣总览；保留原画风、比例与轮廓，按天区和整体方向摆放。修复暂停时切换体系后的准星名称、深空目标和照片同步，兼容旧场景与环境收藏；同步四语言、帮助和维护文档。本批为本地更新，未发布。

**English:** Added a Qing-compilation Chinese sky culture with 312 navigable asterism records, source-based member charts and shared search/annotations. Includes 32 individual illustrations and seven independently controlled Four Symbols / Three Enclosures overviews, which default off. Preserves the original art style and proportions with whole-image sky placement. Fixed paused reticle names, deep-sky targets and photo synchronization across culture changes; retained older-scene and preset compatibility. Updated all four UI languages, help and current documentation. This is a local update, not a publication.

默认回归、三种构建与本机取景／导出检查通过；实际范围与未运行项见记录。 / Default regressions, all three builds and local finder/export checks passed; see the record for scope and untested environments.

[操作与边界 / Usage and scope](使用说明.md#中国传统星官) · [本批检查记录 / Verification](docs/v1.21-validation.json)

## v1.20 — 2026-11-07 · 正式版 / Release

按现行源码重整中英文介绍、操作手册和文档导航，补齐产品范围、架构、数据格式、开发发布及验证参考；明确三种操纵、保存与离线边界，保留历版证据。帮助新增观测、飞行、地形和缓存主题，保留八步导览。便携包按文档入口收集引用，补齐素材来源与许可，增加版本、链接、锚点和格式示例检查。发布包含本批文档、帮助和便携包引用修复。

**English:** Reorganized the current overview, manual and documentation navigation; added product scope, architecture, formats, development/release and verification references. Clarified piloting, storage and offline boundaries while retaining historical evidence. Expanded optional help topics without extending the eight-step tour. Portable documentation now follows explicit entry points and local references, including missing provenance and license files, with version, link, anchor and example checks. This release includes the documentation, help and portable reference fixes.

[本批检查记录 / Verification](docs/v1.20-validation.json)

## v1.19 — 2026-11-07 · 正式版 / Release

修复巡天望远镜近看空间站时表面出现黑色雪花、闪烁的问题：根据实际航天器边界调整近裁剪面，提高深度精度，保留近处部件。取景与照片导出共用修复，不改变模型、阴影与星空画质。

**English:** Fixed black speckles and surface flicker when viewing the station through Xuntian. The near clipping plane now follows spacecraft bounds for improved depth precision while retaining nearby geometry. Preview and photo export share the fix without changing models, shadows or sky quality.

## v1.18 — 2026-11-07 · 正式版 / Release

真实地形改为默认开启，旧设置升级时迁移一次，此后保留用户手动开关。修复开启真实地形后地名、国境线、河湖线与地面轨迹一起消失：切换地形只隐藏原球面材质，保留地理叠加层及地球自转关系；各标注开关继续独立生效。

**English:** Real terrain now defaults on, with a one-time migration for older preferences and subsequent manual choices preserved. Fixed geographic labels, borders, rivers/lakes and ground tracks disappearing when real terrain is enabled. Terrain switching now hides only the original surface material, preserving Earth-fixed overlays and their independent controls.

Chrome/WebKit 实际渲染验证通过，覆盖反复切换地形及标注独立开关。 / Chrome/WebKit rendering regressions passed for repeated terrain switching and independent annotation controls.

## v1.17 — 2026-11-07 · 正式版 / Release

「地球与星空」新增默认关闭的真实地形模式，以 1× 实际高程生成山川网格；主画面、巡天、固定地面瞄准与照片共用数据，并保留现有城市高清影像。内置约 1.03 MiB 的 ETOPO 2022 全球底座，放大后按需读取 Copernicus GLO-30，采用平滑衔接与有界缓存；提供来源、年代、重试、清缓存及照片署名。关闭后释放地形运行资源，已缓存区域可离线复用。本模式不改变飞行碰撞或着陆物理。

**English:** Added an optional, default-off real terrain mode in Earth & Sky, generating true-height meshes at 1× scale. Main view, Xuntian finder, ground locks and photos share elevation data and existing HD city imagery. A roughly 1.03 MiB ETOPO 2022 global base is included; zooming loads Copernicus GLO-30 detail with smooth transitions and bounded caches. Source dates, retry/cache controls and photo credits are included. Disabling releases runtime terrain resources; cached regions remain usable offline. Flight collision and landing physics are unchanged.

默认测试与格式检查通过；Chrome/WebKit 验证山脊、高清地景贴合、照片、离线缓存和资源释放，专项回归覆盖异步切换、接缝、真实地面拾取与城市纹理共享。 / Default tests and formatting passed. Chrome/WebKit checks cover relief, HD imagery draping, photos, cached offline reuse and resource release; focused regressions cover asynchronous transitions, seams, terrain picking and shared city imagery.

[操作、数据、预算与验证 / Details](docs/v1.17-earth-elevation.md)

## v1.16 — 2026-11-06 · 正式版 / Release

新增北京、西雅图 2025 年 Sentinel-2 10 米离线地景（106 张 AVIF，5.75 MiB）和城市库，支持其它城市按需加载、离线保存、取消与删除；共享主画面、巡天与照片，连续缩放、有界缓存并保留日期和来源。星空影像改为共享的紧凑来源选择，保留原银河、DSS、Pan-STARRS 和近期 JWST，缺覆盖明确回退。深空目录补全至 12,162 个去重对象，修复大麦哲伦云等扩展天体的缺名和准星范围识别，区分目录中心与专题影像天区。

**English:** Added offline 2025 Sentinel-2 10 m terrain for Beijing and Seattle (106 AVIF tiles, 5.75 MiB), plus a city library with on-demand loading, offline downloads, cancellation and per-city deletion. Main view, finder and photos share imagery with continuous zoom, bounded caches and dated attribution. A compact shared sky selector offers the original galaxy, DSS, Pan-STARRS and recent JWST imagery with explicit coverage fallback. Expanded the shared deep-sky catalogue to 12,162 deduplicated objects, fixing missing extended-object labels and region identification while distinguishing catalogue centres from image fields.

新增默认开启的 88 星座教学插画，按真实恒星配准，主图、取景和照片共享并随深度放大淡出；图像约 0.99 MiB，保留独立自由许可。无常用名恒星改为默认关闭，旧设置迁移一次后保留手选。 / Added default-enabled teaching illustrations for all 88 constellations, registered to real stars and shared across main view, finder and photos, fading out at telescope magnifications. Artwork adds about 0.99 MiB under its independent free license. Unnamed catalogue-star labels now default off, with a one-time migration that preserves subsequent choices.

默认测试、格式检查、三种构建、Chrome/WebKit 实际渲染及城市离线下载/删除验证通过；包含此前本机 v1.15 的高清星空更新。 / Default tests, formatting, all three builds, Chrome/WebKit rendering and city download/offline/deletion checks passed. This release also includes the previously local v1.15 HD-sky update.

[操作、来源、限制与验证 / Details](docs/v1.16-city-sky.md)

## v1.15 — 2026-11-06 · 本机版 / Local build

新增共享的按需高清星空：主画面、巡天取景和拍照共用 HEALPix 分块、分级加载与有界缓存；新增 2022 年韦布「宇宙悬崖」AVIF 天区，联网使用原 JPEG 格式的 Pan-STARRS 与 DSS，显示真实观测年代、波段和来源。磁盘缓存上限 1 GB，新增常驻 GPU 纹理上限 64 MiB，关闭后释放；拍照按输出尺寸准备素材，未齐时明确注明回退。固定十字线后的拖动与按键微调继续固定新落点，只有主动选择随轨道转动才解除。

**English:** Added shared on-demand HD sky tiles for the main view, Xuntian finder and photos, with HEALPix LOD and bounded caching. A small offline AVIF pack contains Webb’s 2022 Cosmic Cliffs; Pan-STARRS and DSS retain their original JPEG tiles with observation dates, bands and credits. Disk caching is capped at 1 GB and resident additional GPU textures at 64 MiB, released on close. Photos prepare imagery for their output size and explicitly report incomplete detail. Steering a pinned reticle now pins the new point; orbital motion resumes only through the explicit release control.

修复西面纱等长名称在小取景窗居中时消失：共享标注增加上下排版、搜索与中央目标优先；强变焦定位框为名字留位，预览避开上下读数但不避开准星。类别开关、实体遮挡与照片独立标注开关仍有效。 / Fixed long target names disappearing at the center of compact finders. Shared labels gain vertical positions and selected/central-target priority; compact locators leave room for names at high zoom. Preview labels clear the readouts without a reticle exclusion zone, while category switches, physical occlusion and independent photo annotations remain effective.

默认测试、格式检查、三种构建及 Chrome/WebKit 实际渲染与交互检查通过。 / Default tests, formatting checks, all three builds and Chrome/WebKit rendering and interaction checks passed.

[操作、来源与验证 / Details](docs/v1.15-sky-detail.md)

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
