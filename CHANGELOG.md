# Changelog / 更新记录

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
