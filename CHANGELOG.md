# Changelog / 更新记录

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
