# Changelog / 更新记录

## v0.74 — 2026-10-29

**中文：** 接入天和 V23、问天 V24、梦天 V25、神舟 V26、天舟 V27 新版模型；保留巡天、既有装配接口和太阳翼转轴。[模型核对](docs/v0.74-model-validation.json)。

**English:** Integrated the reviewed Tianhe V23, Wentian V24, Mengtian V25, Shenzhou V26 and Tianzhou V27 models, preserving Xuntian, assembly interfaces and solar-array pivots. [Validation](docs/v0.74-model-validation.json).

## v0.73 — 2026-10-29

**中文：** 修复地表高清分块在斜视时被再次混回低清底图，改善夜景城市清晰度；保留四块缓存、按需加载与纹理抗锯齿。[说明](docs/v0.73-details.md)。

**English:** Preserve loaded surface detail at oblique viewing angles instead of blending it back to the coarse global map. Keep the four-tile cache, on-demand loading and mip/anisotropic filtering. [Details](docs/v0.73-details.md).

## v0.72 — 2026-10-29

**中文：** 修复 NASA 云图与轨道下载的连接重试、超时衔接和错误信息丢失；区分未发布、覆盖不足与网络失败。新增有限次数的自动恢复、断网后接续及重试时间提示，保留已有数据与显示选择。新增约 126 KB 的本机轻量入口，修正 Safari 自动重试兼容性。[原因、恢复规则与验证](docs/v0.72-details.md)。

**English:** Fixed connection retries, timeout coordination and lost diagnostics in NASA cloud and orbit updates. Unpublished files, insufficient coverage and network failures are distinguished. Added bounded automatic recovery, reconnection handling and retry-time feedback while preserving existing data and display choices. Added a roughly 126 KB local entry page and fixed Safari timer compatibility. [Causes, recovery rules and validation](docs/v0.72-details.md).

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

**中文：** 新增“任务实验室”：按地点预报过境、绘制天空轨迹与导出日历；独立交会对接训练包含相对运动、推力与姿态控制、固定舰载相机和捕获判定。加入轨道时效限制、暂停隔离与四语界面，通过独立轨道对照、模型几何及浏览器流程检查。[使用与验证](docs/v0.66-flight-lab.md)。

**English:** Added the Mission Lab with site-based pass forecasts, sky tracks and calendar export, plus independent docking training with relative motion, thrust/attitude controls, a body-fixed camera and capture checks. Includes orbit-age limits, pause isolation and four languages, validated against an independent orbit implementation, model geometry and browser workflows. [Usage and validation](docs/v0.66-flight-lab.md).

**中文：** 修复东方红一号铭牌整圈红底的反光色斑与贴图金边残留，将底板材质和浮雕图案分开；金边连为外低内高的阶梯框，保留字形和面数。[说明与验证](docs/v0.66-details.md)。

**English:** Removed painted highlights and redundant border colour around the DFH-1 plaque by separating its enamel base from the relief artwork. Joined the gold rings into one continuous frame rising toward the inside; retained lettering and triangle counts. [Details and validation](docs/v0.66-details.md).

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

**中文：** 新增东方红一号实时遥测：太阳与红外参考探头生成连续调频声音，支持单路收听、10 秒实验路序和电压波形；跟随模拟轨道、姿态与自旋，暂停、跳时和倍速变化同步处理。保留历史录音与四语界面。通过探头几何、PCM 鉴频、音频状态及回归检查。[说明](docs/v0.55-details.md)。

**English:** Added live DFH-1 telemetry from reference Sun and infrared horizon probes, with continuous FM audio, individual channels, a 10-second experimental sequence and voltage traces. Playback follows simulation orbit, attitude and spin, handling pauses, seeks and speed changes. Historical audio and four-language UI remain available. Validated geometry, PCM demodulation, audio lifecycle and regressions. [Details](docs/v0.55-details.md).

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

**中文：** 新增俄语和法语界面，语言选择自动保存。时间步进可连续跨天、跨年，轨迹、小地图和事件时间轴同步延续；跳转保留播放状态。轨道区间外复用缓存的开普勒椭圆参数，计算和缓存大小不随时间跨度增长。全套自动测试、27 项浏览器检查及 subagent 审查通过。详见[更新说明](docs/v0.39-details.md)。

**English:** Added Russian and French with a persistent language selector. Time steps continue across days and years, with synchronized tracks, minimap and event timeline while preserving playback state. Outside sampled ephemerides, cached Kepler ellipses provide constant-cost propagation without growing stored history. See [details](docs/v0.39-details.md).

## v0.38 — 2026-10-26

- 时间步进新增 1s／1m／10m／1h 四档，默认 1m；采用两行紧凑布局，选中时长以青色突出，前后按钮同步显示 ± 时长，中间暂停／继续保持单行。
- 步进保留播放状态与倍速，实时模式转为 1× 自定义播放；到达轨道起点或终点时暂停。时长选择跨任务、跨重启保存，支持完整中英文悬停提示和键盘选择。
- 复用已有时间定位和会话记忆；运行 HTML 增加约 3.3 KB。全套测试及 32 项浏览器检查通过，桌面运行版与启动器同步至 v0.38。详见 [时间步进说明](docs/v0.38-details.md)及[验证记录](docs/v0.38-validation.json)。

**English:** Added a compact two-row 1s/1m/10m/1h selector, defaulting to 1m, with a highlighted selection, matching backward/forward labels and a single-line pause control. Steps preserve playback and speed, convert real-time playback to custom 1×, and pause at either ephemeris boundary. Preferences persist across missions and restarts; tooltips and keyboard controls support both languages. Reused existing navigation and session storage, adding about 3.3 KB to the runtime HTML. The full test suite, 32 browser checks and installed-app verification passed.

## v0.37 — 2026-10-26

- 新增公共轨道事件时间轴，显示日照／半影／全影色带、近远地点及高度、赤道升降交点；提供 3／12／24 小时范围、类别筛选、前后事件导航与紧凑折叠，收起后保留下一事件倒计时。
- 地影事件区分开始进入地影、进入全影、开始离开全影、恢复完全日照四个时刻；邻近标记合并显示，可在详情中选择。拖动与事件定位保留播放状态，支持提前 30 秒以 1× 观看；到事件暂停默认关闭，开启后在首个跨越的已选类别事件停时。
- 复用轨道和天体计算，按需分批扫描、局部细化并复用单个内存缓存；处理短暂掠影、窗口边缘、近圆轨道与任务切换取消。24 小时时段实测约 125 个事件、结果约 7 KB，运行 HTML 增加约 19 KB。
- 全套测试、74 项浏览器检查及独立 subagent 审查完成，覆盖播放状态、自动暂停、小地图回归、持久化和界面避让。见 [时间轴说明](docs/v0.37-details.md)及[验证记录](docs/v0.37-validation.json)。

**English:** Added a shared, collapsible timeline with sunlight/penumbra/umbra bands, four eclipse contacts, apsis altitudes, equator crossings, 3/12/24-hour windows, filters and event navigation. Collapsing retains the next-event countdown. Scrubbing preserves playback; watch mode starts 30 seconds earlier at 1×, and optional automatic pause stops at the first selected event crossed. Batched calculations and one transient cache handle grazing events, window edges, near-circular orbits and cancellation on mission changes. A measured 24-hour result contained about 125 events and 7 KB; runtime HTML grew by about 19 KB. The full test suite, 74 browser checks and independent subagent review passed.

## v0.36 — 2026-10-26

- 新增“地理与星图”一级组，地球地点标识与原有星图标注并列为二级菜单。
- 新增国家、首都、国境线、海域、山脉地貌、河流和湖泊标注；北京使用红色五角星，中国轮廓与海上线段采用天地图官方矢量数据。
- 小地图显示航天器当前上空的国家／地貌／海域；地理设置随任务共用，并支持本地记忆、环境收藏与场景分享。
- 通过字图缓存、批量绘制、两档线数据、空间索引及低频排版控制计算量，避让名称和信息面板。完成数据、浏览器与原有星图／小地图回归验证，见 [地理与星图](docs/v0.36-details.md)。

**English:** Added a Geography & star chart group with two second-level panels. Earth labels cover countries, capitals, boundaries, seas, landforms, rivers and lakes. Beijing uses a red five-pointed star, and China’s geometry comes directly from official Tianditu vectors. The minimap identifies the region below the spacecraft. Shared settings support persistence, presets and scenes; cached glyphs, batched lines, two geometry levels and indexed/throttled updates bound the work. Validated data, browser flows, existing star charts and minimap dragging.

## v0.35 — 2026-10-26

- 新增公共星图标注三级菜单：361 颗主要恒星、965 条已收录星名，以及仅显示牛郎星／织女星／北极星的精选三项预设；支持 88 星座名称、连线和边界分别开关。
- 标注自动避让、亮星优先，提供密度控制与中英文名称；地球、月球和航天器遮挡标注，切换任务共用资源和偏好。
- 单张字图缓存、批量绘制、静止排版复用和低频可见性更新；兼容旧开关、环境收藏和场景文件，修正三级菜单插入后的折叠状态记忆。
- 完成数据、浏览器与独立 subagent 审查，说明及验证见 [星图标注](docs/v0.35-details.md)。

**English:** Added shared sky annotations with 361 major stars, 965 catalogued names, a preset containing only Altair/Vega/Polaris, and independently controlled names, lines and boundaries for 88 constellations. Labels avoid overlap, prioritize bright stars, support Chinese/English and respect celestial-body and spacecraft occlusion. A shared glyph atlas, batched drawing and cached/throttled layout keep resource use bounded. Preserved legacy preference migration, scene/preset round trips and stable sidebar expansion. Validated data and browser behavior with independent subagent review.

## v0.34 — 2026-10-26

- 修复中国空间站舱体、端面和箱体上的条纹状自阴影；阴影偏移与覆盖范围按可见模型尺寸适配，所有航天器共用。
- 统一使用优化阴影：静止与仅移动镜头时复用阴影图，太阳方向、太阳翼和自旋变化时刷新，全影时跳过；暂停期间复用太阳翼遮挡计算，手动调整后更新读数。
- 在最高画质、阳光区、辅助照明关闭的条件下检查空间站与东方红一号；完成 GPU 条纹回归、阴影刷新与既有光照／清晰度验证。详见 [修复与验证](docs/v0.34-details.md)。

**English:** Fixed striped self-shadow artifacts on spacecraft surfaces with scale-aware shadow bias and coverage. One shared optimized implementation reuses shadow maps for static scenes and camera-only movement, refreshes for solar direction, array motion and spin, and skips unlit maps during eclipse. Paused solar-array occlusion results are reused and manual changes refresh readings. Verified at the highest quality in direct sunlight with auxiliary lighting off, plus GPU artifact, cache and existing rendering regressions.

## v0.33 — 2026-10-26

- 小地图拖动／点击定位保留播放状态：运行时松手按原倍速继续，暂停时保持暂停；现实时间拖动后从所选时刻以 1 倍速运行。
- 拖动期间由鼠标控制时刻，松手后从选中位置继续计时；指针取消或失去捕获时也正常结束拖动。
- 验证东方红一号、中国空间站的运行／暂停、倍速、实时模式和状态保存。验证记录：[小地图播放状态](docs/v0.33-validation.json)。

**English:** Minimap scrubbing and track clicks now preserve playback state and speed. Running simulations continue after release; paused simulations remain paused. Scrubbing from real time continues at 1× from the selected time. Pointer cancellation and capture loss also finish scrubbing cleanly. Verified both spacecraft, playback speeds, real-time transition and saved state.

## v0.32 — 2026-10-26

- 修复东方红一号在全影中仍被固定室内反射照亮的问题；移除模型私有展示环境，所有航天器共用辅助照明开关，关闭时同时关闭补光和展示反射。
- 精细档 HDR 合成启用最高 4× MSAA，按浮点颜色与深度格式共同支持的采样数分配；保持完整画布分辨率，并在浏览器缩放、窗口跨屏及模型查看时同步设备像素比。
- 验证四档地影表面、辅助照明、空间站切换、纯模型预览、像素比变化、GPU 边缘抗锯齿及原有大气效果。详见 [光照与清晰度修复](docs/v0.32-details.md)。

**English:** Fixed persistent studio reflections on Dongfanghong-1 during eclipse. All spacecraft now share one auxiliary-light switch that controls both ambient fill and display reflections. Enabled up to 4× MSAA for full-resolution HDR compositing using compatible color/depth sample counts, and refresh pixel density after display or browser-zoom changes, including model-only previews. Verified eclipse lighting across all four quality tiers, auxiliary lighting, mission switches, preview transitions, pixel-density changes, GPU edge coverage and atmospheric rendering.

## v0.31 — 2026-10-26

- 增加软件通用音乐系统，内置用户选定的六首 AAC 曲目，启动随机首曲、按列表顺序循环；切换模型、恢复场景与调整模拟时间时连续播放。
- 左下角默认圆形音符，播放时旋转、暂停时静止；悬停展开，移出整个操作范围后延迟收起，支持键盘与触屏。
- 支持批量导入、去重、移除、恢复内置曲目、拖动及按钮排序、音量、静音与进度控制；音乐库和偏好独立保存。
- 校验真实音频播放、离线使用、列表恢复、删除续播、失败回滚、多个标签页及收起交互。详见 [全局音乐与验证](docs/v0.31-details.md)。

**English:** Added shared background music with six bundled AAC tracks, a random opening track and an ordered playlist loop. Playback remains independent of spacecraft, scenes and simulation time. A rotating circular note expands on hover and collapses after leaving the complete control area, with keyboard and touch support. Added batch imports, content deduplication, removal, built-in restoration, drag/button ordering, volume, mute and seeking, with an independent persistent library. Validated actual playback, offline use, reloads, deletion handoff, failure rollback, multiple tabs and dock interactions.

## v0.30 — 2026-10-26

- 修复 NASA 云图在软件重启后未恢复的问题；公共资源持久保存，更新或失败期间继续提供上次完整云图，网页可接续后台更新。
- 新增界面导入航天器：配置 JSON、GLB 模型与轨道文件组合接入，保存后重开自动恢复；名称、比例、轴向、自旋和轨道更新源均由配置提供。
- 分离公共环境资源与任务轨道管理，在线 GP 更新按配置读取 NORAD 编号；内置任务转为数据清单。
- 相机适配模型大小，导入与场景恢复统一协调；验证模型朝向、导入回滚、刷新、场景往返及跨任务 NASA 纹理复用，并完成两位 subagent 审查。
- 使用方法与验证：[模块化任务与公共资源](docs/v0.30-details.md)。

**English:** Fixed NASA cloud restoration after restart with a persistent shared library and continued access to the last complete image during updates. Added UI import of spacecraft configuration, self-contained GLB and orbit files, with persistent missions, configurable scale/axes/spin and catalog-driven GP updates. Separated mission orbit selections from shared environmental resources. Adapted camera controls to model size and coordinated package import with scene restoration. Verified recovery, import rollback, axis mappings, reloads, scene round-trips and shared NASA textures, with two independent subagent reviews.

## v0.29 — 2026-10-26

- 任务命名统一为“星球：类别：名称”，东方红一号归类为卫星。
- 建立航天器与任务注册表，支持独立模型、轨道、姿态策略、功能开关及镜头记忆；加入东方红一号米制 GLB。
- 接入东方红一号 CelesTrak GP / SGP4 轨道，保留来源、历元与展示窗口；支持在线更新及 GP JSON 导入，缺失或越界时只显示模型。
- 校正模型 Y-up → Z-up、真实比例和姿态旋转顺序；东方红一号默认顶部天线朝轨道前进方向，可切换惯性定轴；按历史资料加入可开关的 120 转/分自旋。天宫保留地面轨迹定向与追日。
- 场景格式升级并兼容旧文件；任务轨道缓存隔离，修复切换／收藏恢复竞态和刷新时手动翼角被覆盖的问题。
- 姿态参考与控制移至下方通用模块，轴向、转速和来源由配置提供；统一相机控制修复变更参考轴后左键拖动异常。
- 全量测试、浏览器切换／刷新／文件往返、独立 Skyfield 对照与 subagent 审查完成。详见 [任务框架与验证](docs/v0.29-details.md)。

**English:** Added a spacecraft/mission registry with separate models, orbits, attitude policies, capabilities, and camera memory, plus Dong Fang Hong 1. Its CelesTrak GP elements are propagated using SGP4 with explicit epoch and display-window metadata. Corrected asset axes, real scale, and rotation order; default prograde pointing, an inertial-axis illustration, and toggleable historical 120 rpm spin remain separate from Tiangong ground-track alignment. Moved attitude controls into a shared lower-sidebar module and fixed mouse rotation after camera-up changes. Upgraded scene files with legacy compatibility and isolated orbit caches; fixed restoration races and manual-array reload persistence. Validated with the full test suite, browser switching/reloads/file round-trips, independent Skyfield references, and subagent review.

## v0.28 — 2026-10-25

- 新增“天气与奇观”：云内闪电、红色精灵与蓝色喷流、夜侧气辉开关、流星；支持自然和观赏增强模式。
- 云内闪电受实际显示云层约束，支持普通云与体积云；高空闪光与雷暴关联，流星和闪光遵循地球遮挡与大气透射。
- 限制事件数量、倍速播放节奏和资源用量；支持暂停、时间跳转、设置记忆、环境预设、场景分享与恢复默认。
- 说明与参考资料：[天气与奇观](docs/weather-phenomena.md)。事件为程序模拟，不代表实时雷电或流星观测。

**English:** Added in-cloud lightning, sprites and blue jets, a night-airglow toggle, and meteors, with Natural and Enhanced modes. Cloud lighting follows the displayed coverage, including volumetric clouds; upper-atmosphere events respect Earth occlusion and atmospheric transmission. Bounded event pools and time scaling keep effects lightweight. Settings integrate with persistence, presets, scene sharing and factory reset. Events are illustrative simulations, not live observations.

## v0.27 — 2026-10-24

- 启动图标改用三舱构型手绘版，校准天和、问天、梦天及太阳翼位置；方形舱段采用直角箱体与侧面阴影。
- 更新图标绘制源文件、1024 px 原图及本机 macOS 启动器，提供完整尺寸的图标资源。

**English:** Replaced the launcher icon with the illustrated three-module configuration, correcting module and solar-array placement and using angular box sections with shaded side faces. Updated the drawing source, 1024 px artwork and local macOS launcher with a complete icon-size set.

## v0.26 — 2026-10-24

- 新增可折叠的“场景分享”，通过 JSON 导出／导入完整舱体组合、太阳翼角度与联动、模拟时间、镜头及环境显示设置。
- 文件自带轨道数据，导入后暂停在分享时刻；云图与极光匹配本地同一快照，缺失时提示并使用内置云图／关闭极光。
- 导入前校验格式、舱体层级、轨道、时间、镜头和数值范围；中英文界面同步支持。
- 已验证多层组合与重复飞船往返恢复、文件导入／导出、刷新记忆、缺失天气快照和无效输入处理。

**English:** Added collapsible Scene sharing with JSON export/import for assemblies, solar arrays, time, cameras, environment and display settings. Files embed orbit data and restore to a paused shared time. Downloaded clouds and aurora match exact local snapshots, with explicit fallback when missing. Validates scene structure, hierarchy, orbit, time, cameras and value ranges before applying. Bilingual interface included. Verified recursive/repeated assemblies, file round-trips, reload persistence, missing-weather fallback and invalid input rejection.

## v0.25 — 2026-10-24

- 左侧六个设置模块支持独立展开／收起，点击标题或右侧箭头即可切换；收起仅保留标题，不改变功能开关与控件数值。
- 自动记忆各模块状态，恢复出厂设置时重置；支持中英文、键盘和窄屏操作。
- 已检查折叠独立性、刷新恢复、控件值保留及完整软件加载。

**English:** Added independent collapsible sections to all six sidebar modules. Click a heading or its chevron to toggle; collapsing preserves controls and active features. Section states persist across visits and reset with factory settings. Supports both languages, keyboard navigation and narrow screens.

## v0.24 — 2026-10-23

- GitHub 云图增加全图自适应遮罩断层处理，减轻碎片和阶梯边缘；历史 PNG／JPEG 同步适用，原始下载缓存保留。大尺度上游误分类仍不能由该处理恢复。
- 云图在独立 Worker 中一次性处理，复用单通道纹理并限制并发；普通云、体积云、云影使用同一遮罩。
- 轨道数据框增加开关和关闭按钮，记忆显示状态；右上视角按钮改为点击展开，选择视角、点击外部或按 Esc 收起，支持中英文。

**English:** Added source-wide adaptive mask reconstruction for GitHub cloud snapshots, reducing fragmentation without changing archived PNG/JPEG data. Large-scale source misclassification remains unresolved. One-shot worker processing uses a single-channel texture shared by clouds and shadows, with serialized loads. Added a persistent orbit-readout toggle and a click-to-open camera menu with outside-click/Escape dismissal and bilingual labels.

[处理依据与验证 / Method and validation](docs/v0.24-details.md)

## v0.23 — 2026-10-23

- 修正体积云分支取样时的纹理梯度，减少不稳定的细节选择；移除低密度硬截断，保留连续的弱云过渡。
- 对比原始 Alpha、普通云与体积云，确认 GitHub 图源自身包含灰色连块和阶梯缺口；本次未恢复上游云分类，也未以模糊或随机云掩盖缺失数据。
- 原始缓存和其他图源保留，不新增纹理或渲染通道。自动测试及生产着色器 GPU 场景检查通过。

**English:** Stabilized texture gradients in volume-cloud sampling and removed the low-density cutoff. Raw-alpha, shell and volume comparisons traced large grey blocks to the GitHub source itself. This update does not reconstruct upstream cloud classification or hide missing information with blur or synthetic clouds. Original caches and other sources are retained; no extra textures or render passes. Automated tests and production-shader GPU checks passed.

[诊断、修正范围与参考 / Diagnosis, scope and references](docs/v0.23-details.md)

## v0.22 — 2026-10-23

- 8K 太阳十字星芒改为仅在视线掠过大气边缘时渐入，白昼关闭；光晕随光谱消光与遮挡连续减弱。
- 改善晨昏太阳高亮的颜色保留，显现从亮白、金橙到暗红的变化；补充地球／月球遮挡范围，避免局部显示处理污染遮挡物。
- 复用现有 HDR 缓冲；自动测试、GPU 太阳／遮挡检查及单个 subagent 审查完成。

**English:** In 8K mode, solar starbursts now fade in only for atmosphere-grazing views. Local hue-preserving highlight mapping reveals spectral twilight colours while retaining daylight white. Earth/Moon masks protect occulting surfaces; glare fades with transmitted sunlight. Reuses the existing HDR buffer. Automated tests, GPU solar/occlusion checks and one subagent review completed.

[实现、验证与参考 / Implementation, validation and references](docs/v0.22-details.md)

## v0.21 — 2026-10-23

- 修正 GitHub 云图灰底过度遮挡海洋：针对上游增强灰度加入连续透明度校正，普通云、体积云、云影与夜光遮蔽一致使用。
- 已下载的 PNG/JPEG 历史快照自动应用；保留原始缓存，NASA 科学云图与内置云图沿用各自处理。未增加纹理或渲染通道。
- 自动测试与生产着色器 GPU 检查通过；本项是显示校正，不能从合成灰度恢复严格的晴空／薄云分类。

**English:** Reduced the GitHub source's grey veil with a continuous, provider-specific opacity transfer shared by cloud shells, volume clouds, shadows and night-light attenuation. Existing PNG/JPEG snapshots benefit without changing their cached pixels; NASA and bundled maps retain their own processing. No new textures or render passes. Automated and production-shader GPU checks passed. This display correction does not recover a scientific clear-sky classification.

[图源含义、处理与验证 / Source interpretation, processing and validation](docs/v0.21-details.md)

## v0.20 — 2026-10-23

- 8K 大气改用六波长光谱转换，修正白昼低层紫边，保留晨昏金橙过渡和夜侧弱气辉。
- 增加随大气光程变色的太阳圆面与光晕，处理地球、月球遮挡，并随云层遮蔽减弱；空间站直射光同步变化。
- 复用现有 HDR 缓冲，仅新增 6 KiB 散射表；自动测试、生产着色器 GPU 场景检查及单个 subagent 审查完成。

**English:** Six-sample spectral transport fixes the daytime purple bias while retaining golden twilight and faint night airglow. Added an atmosphere-aware solar disk and glare with Earth/Moon occultation and cloud visibility, plus matching station sunlight. Reuses the HDR buffer with one extra 6 KiB lookup. Automated/GPU checks and one subagent review completed.

[实现、验证范围与参考资料 / Implementation, validation and references](docs/v0.20-details.md)

## v0.19 — 2026-10-23

- 修正 8K 白昼大气低层偏暖：加入轻量多次散射，按 RGB 透射合成后统一映射颜色；晨昏暖色随太阳、地球与视线关系变化。
- 增加独立的夜侧弱气辉；修正云顶及体积云的前方大气路径，减少掠视时额外消光。
- 新增查找表仅 6 KiB；HDR 缓冲跟随窗口、低档释放、失败自动降级，晴空像素跳过云散射。
- 自动测试、浏览器 GPU 场景检查与单个 subagent 审查通过；轨道和自由组合算法保持不变。

**English:** Corrected the warm daytime limb with compact multiple scattering and linear RGB compositing. Added faint independent night airglow and cloud-height-aware aerial perspective. The extra lookup uses 6 KiB; HDR follows the viewport, releases at lower tiers and falls back on failure. Automated/GPU checks and one subagent review passed.

[实现、验证范围与参考资料 / Implementation, validation and references](docs/v0.19-details.md)

## v0.18 — 2026-10-23

- 优化 8K 大气边缘、晨昏过渡与云层受光，改善球体轮廓并减少内存占用。
- 新增 NASA 8K 全球云图：每次更新筛选最近 30 天每日 12:00 UTC 的合成图，核验全球及南北极覆盖；不合格则继续查找，无新图则保留合格缓存。
- 保留「github最新已下载」图源；移除旧的 2024 年 NASA 云图，支持历史快照、统一更新与缓存清理。
- 本次自动选中 2026-10-20 云图；已验证 8K 加载、缓存迁移、图源隔离与重复更新，自动测试及构建通过。

**English:** Improved 8K atmosphere, twilight, cloud lighting and memory use. Added coverage-validated NASA 8K composites with a rolling 30-day daily search and cache fallback. Retired the 2024 NASA map while preserving GitHub downloads. Tests, build and browser cache checks passed.

[修改详情与参考资料 / Details and references](docs/v0.18-details.md) · [云图处理与更新规则 / Cloud processing](docs/cloud-sources.md)

## v0.17

- 优先下载无损 PNG 云层遮罩，兼容 JPEG 历史快照；保留 8K 源尺寸及快照通道信息。
- 保留厚云内部浓淡与体积密度差别；修正重复选择画质后云图绑定退回内置图的问题。
- Prefer lossless PNG cloud masks while retaining legacy JPEG history; preserve native 8K size and mask-channel metadata.
- Preserve bright-cloud shading and density variation; keep downloaded cloud textures bound when reselecting a quality tier.

- 新增带封面图标的 macOS 启动应用，支持 Intel / Apple Silicon；本地服务后台运行并复用现有实例。
- Added a macOS launcher with a custom Earth/station icon, Intel / Apple Silicon support, and a persistent background server.

## v0.16

### 中文

- 增强 8K 地表和真实城市夜光，按需加载本地切片；修正海洋颜色和晨昏条带。
- 增加按模拟时间计算的月球、月相与光照；支持望月后返回原空间站视角。
- 新增原生 16K 银河背景、四档地球、动态与体积云、云图和极光来源选择、统一更新和历史缓存管理。
- 记忆组合、时间、显示和环境设置；提供恢复出厂设置与环境收藏。
- 小地图支持点击轨迹、拖动站点来跳转到有效轨道时间。
- 保留递归核心舱组合、太阳翼追日、地面轨迹定向、中英文与全屏适配。
- 单文件运行体积约 211 MB；便携包提供于 GitHub Releases。

### English

- Improved 8K Earth and real city lights with on-demand offline tiles; corrected ocean reflectance and twilight banding.
- Added time-based lunar position, apparent size, phase, and illumination, with return to the saved station view.
- Added native 16K Milky Way, four Earth tiers, dynamic and volumetric clouds, cloud/aurora sources, unified updates, and history-cache management.
- Remember assembly, time, display, and environment settings; restore factory defaults and save environment presets.
- Seek a valid orbital time by clicking the minimap track or dragging the station marker.
- Retained recursive Tianhe assembly, solar tracking, ground-track attitude, bilingual UI, and fullscreen adaptation.
- Standalone runtime: approximately 211 MB. The portable package is distributed through GitHub Releases.

## v0.10

- 修正空间站相对地面轨迹斜着移动的朝向问题，并包含全屏与窗口尺寸适配。
- 支持通过后端对接口递归添加天和核心舱；新增核心舱的节点接口可继续连接其他舱段，并显示在左侧列表。
- Corrected ground-track-relative attitude and fullscreen/window resizing. Added recursive Tianhe assembly through aft ports, with further attachments available on each new core.

## v0.7

- 建立可离线运行的三维空间站软件：支持重复部署同型飞船、自由组合、单轴/双轴太阳翼控制和联动。
- 接入公开轨道记录、现实/自定义时间、地球昼夜和自动追日；太阳翼在地影内继续转动。
- 提供三档地球、星表星空、可开关轨道小地图、截图、中英文界面、版本与作者信息。
- Established the offline viewer with repeatable spacecraft instances, free assembly, solar-array control, published orbital records, time controls, eclipse-aware solar tracking, Earth quality tiers, catalogue stars, a minimap and bilingual UI.

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

素材处理、署名、授权与精度说明见 [素材与迁移说明](素材与迁移说明.md)。以上历史条目依据已有版本提交与项目记录整理；本轮只补充更新日志。
