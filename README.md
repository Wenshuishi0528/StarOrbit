# 天宫 · 实时轨道模拟 / Tiangong Orbit Simulator · 中国空间站

**v0.28 · 作者 / Author: wenshuishi0528**

![中国空间站 · Tiangong Orbit Simulator v0.7](docs/hero.jpg)

## 中文简介

一个可离线运行的中国空间站三维交互与轨道模拟软件。以作者制作的 1:200 模块化空间站模型为基础，将自由舱体组合、公开轨道数据、太阳位置、地球昼夜和太阳翼自动追日整合在同一个浏览器界面中。

### 主要功能

- **自由组合**：天和、问天、梦天、神舟、天舟、巡天；各对接口可重复部署同型飞船；新增天和用尾口接入，其节点接口可继续扩展并在左栏分组显示。太阳翼独立调整，也支持实验舱联动。
- **轨道与时间**：采用公开 OEM 轨道记录，在有效期内插值；支持现实时间、自定义时间、暂停和最高 1000× 播放。
- **地面轨迹定向**：计入地球自转，让天和前端沿地面轨迹前进；背景、光照和太阳翼追日使用同一姿态基准。
- **太阳翼追日**：按各实例的单轴／双轴约束求解，考虑舱体与翼板遮挡；地影中继续连续追日，直射受光量保持为零。
- **四档地球**：1K 简易、2K 流畅、4K 标准、8K 精细；8K可开启体积云和动态演变，另有云图与极光数据模式。
- **真实星表星空**：41,411颗独立星点；可选原生16K NASA银河背景、主星名称和曝光风格。增强背景按需加载，切回普通模式释放。
- **实时轨道追踪地图**：显示当前位置、过去及未来地面轨迹，可随时开关。
- **中英文切换**：顶部右侧一键切换界面、读数、提示和舱体名称，语言选择自动保存。
- **场景分享**：导出／导入 JSON，恢复舱体组合、太阳翼、时间、镜头和环境设置；文件包含所用轨道，下载云图与极光按快照匹配。
- **交互查看**：自由旋转缩放、空间站跟随／轨道总览、沉浸显示、全屏尺寸自适应及三维画面截图。

### 使用

从 **[v0.28 发布页](https://github.com/Wenshuishi0528/Tiangong-Orbit-Simulator-China-Space-Station/releases/tag/v0.28)** 下载便携包并解压，用新版 Chrome、Edge 或 Safari 打开 **天宫空间站交互预览.html**。约 211 MB 的 HTML 内嵌模型、贴图、星表、计算库和轨道快照，可离线运行。仓库 ZIP 提供源码；可运行便携包位于发布页。

macOS 便携包内附带地球与空间站图标的启动应用，支持 Intel 和 Apple Silicon，双击即可启动后台服务。

顶部显示软件版本和作者。完整操作见 **[使用说明](使用说明.md)**。

内置轨道快照覆盖 **2026-10-19 00:00 至 2026-10-26 00:00 UTC**；超出有效期不会外推“实时位置”。使用 **更新轨道数据.command**（macOS）或 `python3 scripts/update-orbit.py` 更新，也可在界面导入支持格式的数据。

本软件使用模拟姿态与计算太阳翼角度，不是空间站姿态或发电遥测。云图可选内置、下载快照或地理约束生成；体积与运动为示意。普通银河为艺术算法，增强银河来自NASA星表可视化。

## English overview

![English interface](docs/preview-en.png)

An offline-capable interactive 3D viewer and orbital simulation of China's Tiangong space station. Built around the author's modular 1:200 models, it combines configurable spacecraft assemblies, published orbital ephemerides, solar geometry, Earth's day/night cycle, and automatic solar-array tracking in one browser interface.

### Features

- **Configurable assemblies:** Tianhe, Wentian, Mengtian, Shenzhou, Tianzhou, and Xuntian. Deploy multiple copies of any module. Added Tianhe cores connect through their aft ports and expose four node ports for recursive expansion, grouped in the sidebar. Control arrays individually or link laboratory-module rotations.
- **Orbit and time controls:** interpolate published OEM records within their validity interval; use real time, a custom date, pause, or playback up to 1000×.
- **Ground-track aligned attitude:** account for Earth rotation so Tianhe's front follows the ground track; the background, lighting, and solar tracking share the same attitude frame.
- **Solar-array tracking:** solve single- and dual-axis pointing with sampled body/array occlusion. Tracking continues through eclipse while direct solar input remains zero.
- **Four Earth quality levels:** 1K simple, 2K smooth, 4K standard, and 8K fine. Optional 8K ray-marched volumetric clouds, illustrative cloud evolution, improved atmosphere, twilight, cloud shadows, and aurora.
- **Catalogue-based stars:** 41,411 independent stars, optional native 16K NASA Milky Way, bright-star labels, and exposure styles. The enhanced background loads on demand and is released in standard mode.
- **Toggleable orbit minimap:** current sub-satellite position with past and future ground tracks, synchronized with simulation time.
- **Chinese / English UI:** switch at the top right; labels, readouts, messages, and module names update without resetting the simulation. Your language choice is remembered.
- **Scene sharing:** export/import compact JSON files with assemblies, solar arrays, time, cameras, environment settings and embedded orbit data. Downloaded weather matches exact local snapshots.
- **Interactive viewing:** orbit/pan/zoom, station-follow and orbit-overview views, immersive display with adaptive fullscreen sizing, and 3D screenshot export.

### Getting started

Download the portable package from the **[v0.28 release](https://github.com/Wenshuishi0528/Tiangong-Orbit-Simulator-China-Space-Station/releases/tag/v0.28)**, extract it, and open **天宫空间站交互预览.html** in a recent Chrome, Edge, or Safari. The approximately 211 MB HTML embeds the model, textures, catalogue, libraries, and orbit snapshot for offline use. Repository ZIPs contain the source; the runnable portable package is provided on the release page.

On macOS, the portable package includes a launcher app with its own Earth/station icon. It supports Intel and Apple Silicon and starts the local server in the background.

The bundled orbit snapshot is valid from **2026-10-19 00:00 to 2026-10-26 00:00 UTC**. Positions are not extrapolated beyond that interval. Refresh it with **更新轨道数据.command** on macOS or `python3 scripts/update-orbit.py`, or import supported data in the interface.

Station attitude and array pointing are simulated rather than telemetry. Clouds offer bundled, downloaded and geographically constrained modes; cloud volume and motion are illustrative. The enhanced Milky Way uses NASA catalogue visualization; the standard background is artistic.

## 开发 / Development

Node.js 18+ is required to build; Python 3 is used by the orbit-data scripts.

```sh
npm ci
npm test
npm run build
```

构建后在项目根目录生成独立 HTML。Generated standalone HTML is written to the project root; it is distributed as a release asset because it exceeds GitHub’s 100 MB per-file limit.

- `src/`: application, orbit/solar calculations, Earth/stars, and minimap.
- `assets/`: required model, prepared textures, catalogue, and orbital records.
- `build.mjs`: build the self-contained HTML; version and author come from `package.json`.
- `scripts/update-orbit.py`: refresh and validate the published orbital data, then rebuild.
- `scripts/prepare-environment.py`: optional texture/catalogue preparation; requires Pillow and the original attributed source textures in `assets/earth/source/`. Prepared assets are already included for normal builds.

## 素材与署名 / Credits

- Earth textures: [Solar System Scope / INOVE](https://www.solarsystemscope.com/textures/), **CC BY 4.0**; resized and compressed for the four quality levels.
- Star catalogue: [d3-celestial / XHIP](https://github.com/ofrohn/d3-celestial), **BSD 3-Clause** notice retained in `assets/D3-CELESTIAL-LICENSE.txt`.
- Starfield styling and artistic Milky Way: adapted from [StarSky Studio](https://github.com/Wenshuishi0528/StarSkyStudio), **CC BY 4.0**.
- Orbit source: [China Manned Space Engineering Office / BACC](https://en.cmse.gov.cn/news/202107/t20210722_48418.html).
- Three.js, Astronomy Engine, and three-mesh-bvh: **MIT**; notices are embedded in the standalone HTML.

Full asset notes: **[素材与迁移说明.md](素材与迁移说明.md)**. Third-party materials retain their respective licenses. Original project code and model are currently unlicensed for redistribution.


### Earth & weather update / 地球与天气增强

- 1K / 2K / 4K / 8K，8K可选体积云与连续演变；大气边缘、晨昏、夜景、云影和海面反光升级。
- 云图与极光独立选择最新数据、已保存历史、本地生成或关闭。极光使用 NOAA OVATION 预测网格；程序生成的光幕与云层立体形态是示意。
- 一键检查云图、极光和轨道；失败保留旧数据。历史缓存支持收藏、容量限制、删除与导入导出。云图未提供观测时刻时明确显示未知。
- 摄影模式、固定曝光、4K宽PNG截图和环境视角收藏；保留原有自由组合、全屏适配、轨道与太阳能板计算。
- 双击 `启动实时地球.command` 可开启本地服务及固定来源的官方轨道中继。直接打开HTML仍能离线运行；云图/极光可按需联网更新，持久缓存能力取决于浏览器。

Four quality tiers with optional 8K ray-marched clouds and illustrative continuous weather evolution. Improved atmospheric limb, twilight, ocean glint and cloud shadows. Clouds and aurora offer downloaded, saved-history, procedural and off modes. NOAA OVATION supplies forecast coverage, not observed auroral curtains. One update button checks each source independently; failures retain existing data. Favorite/export/import snapshots, manage the cache budget, use photo mode and 4K-wide captures, and save reproducible environment presets. Existing orbital physics, solar tracking, fullscreen sizing and recursive assembly remain intact. Run `python3 scripts/serve.py --open` for the local viewer and official-orbit relay, or open the offline HTML directly. Historical coverage is limited to snapshots actually available in the local library.

Clouds: [Live Cloud Maps](https://github.com/matteason/live-cloud-maps) — **Contains modified EUMETSAT data**. Aurora: [NOAA SWPC OVATION](https://www.swpc.noaa.gov/products/aurora-30-minute-forecast). Procedural weather, cloud height and curtain motion are illustrative.
Settings memory / 设置记忆：银河默认开启。组合、太阳翼控制、时间、视角、显示、环境和语言设置会在同一浏览器及地址下自动恢复。恢复出厂设置重置偏好和组合，保留下载快照与收藏。

The Milky Way is enabled by default. Assembly, solar controls, time, cameras, display, environment and language preferences are remembered in the same browser and origin. Factory reset restores preferences and assembly while retaining downloaded snapshots and favorites. Native browser fullscreen still requires a click.

Native 16K sky / 原生16K星空：[NASA SVS Deep Star Maps 2020](https://svs.gsfc.nasa.gov/4851/). Credit: NASA/Goddard Space Flight Center Scientific Visualization Studio; Ernie Wright; Gaia DR2: ESA/Gaia/DPAC. Native 16384×8192 source, no upscale or added blur. Device limits are shown explicitly when 8K/4K fallback is needed. The 356.5 MB source EXR and development dependencies are not needed to run the standalone app.

小地图支持拖动站点或点击轨迹跳转到对应有效时刻，并自动暂停；不把空间站放到任意无效轨道位置。The minimap supports dragging the station or clicking the track to seek and pause at a valid orbital time.

### Close-range Earth clarity / 近距离地球清晰度

8K 档新增原生 21600×10800 NASA 地表的按需分块细节，最多四块常驻显存，离线可用。普通云层使用单层覆盖以避免叠层重影；大气与地表不再重复雾化，8K 像素比上限固定为 2。

The 8K tier adds on-demand native 21,600×10,800 Earth detail, with at most four decoded tiles resident and offline support. A single ordinary cloud layer avoids duplicated silhouettes; atmospheric haze is no longer added twice, and the 8K pixel-ratio cap is independent of starfield settings.

Source: [NASA Earth Observatory — Blue Marble Next Generation](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography/), July 2004 composite with topography. Details and SHA-256 hashes: `assets/earth/detail/manifest.json`.


### Ocean, night lights and twilight / 海洋、夜景与晨昏

8K 档修正深海颜色，并加入 NASA Black Marble 2016 的城市夜光细节：500 米灰度源数据降采样至约 1 公里，按当前视野加载最多四块夜景切片，与最多四块地表切片共用单路解码。晨昏大气在地影边界分段积分，使用连续半影和轻微抖动消除条带。望月按钮可再次点击返回；顶部也提供「返回空间站」。单文件 HTML 约 211 MB。

The 8K tier corrects deep-ocean reflectance and adds NASA Black Marble 2016 city lights, downsampled from 500 m sources to approximately 1 km. At most four night tiles and four daytime tiles are resident, with one shared decode queue. Atmosphere integration splits at the Earth-shadow boundary, with continuous penumbra and sub-code-value dithering. Look at Moon toggles back to the saved station view; a permanent Back to station action is also available. Standalone HTML: approximately 211 MB.

Night-light source: [NASA Earth Observatory — Black Marble 2016](https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/), Suomi NPP / VIIRS historical composite. The light map represents city-light distribution, not individual buildings or current imagery. Tile and source hashes: `assets/earth/night-detail/manifest.json`.
