# 天宫 · 实时轨道模拟 / Tiangong Orbit Simulator

**v0.7 · 作者 / Author: wenshuishi0528**

![Tiangong Orbit Simulator v0.7](docs/preview.png)

## 中文简介

一个可离线运行的中国空间站三维交互与轨道模拟软件。以作者制作的 1:200 模块化空间站模型为基础，将自由舱体组合、公开轨道数据、太阳位置、地球昼夜和太阳翼自动追日整合在同一个浏览器界面中。

### 主要功能

- **自由组合**：天和、问天、梦天、神舟、天舟、巡天；各对接口可重复部署同型飞船，独立调整太阳翼，也支持实验舱联动。
- **轨道与时间**：采用公开 OEM 轨道记录，在有效期内插值；支持现实时间、自定义时间、暂停和最高 1000× 播放。
- **太阳翼追日**：按各实例的单轴／双轴约束求解，考虑舱体与翼板遮挡；地影中继续连续追日，直射受光量保持为零。
- **三档地球**：1K 简易、2K 中等、8K 高清；中高档提供云层、大气与夜间灯光。
- **真实星表星空**：最多 41,411 颗恒星，可选主星名称、示意银河和曝光风格。
- **实时轨道追踪地图**：显示当前位置、过去及未来地面轨迹，可随时开关。
- **中英文切换**：顶部右侧一键切换界面、读数、提示和舱体名称，语言选择自动保存。
- **交互查看**：自由旋转缩放、空间站跟随／轨道总览、沉浸显示及三维画面截图。

### 使用

下载仓库 ZIP 并解压，直接用新版 Chrome、Edge 或 Safari 打开 **[天宫空间站交互预览.html](天宫空间站交互预览.html)**。该文件内嵌模型、贴图、星表、计算库和轨道快照，约 30 MB，无需安装依赖或联网。

顶部显示软件版本和作者。完整操作见 **[使用说明](使用说明.md)**。

内置轨道快照覆盖 **2026-10-19 00:00 至 2026-10-26 00:00 UTC**；超出有效期不会外推“实时位置”。使用 **更新轨道数据.command**（macOS）或 `python3 scripts/update-orbit.py` 更新，也可在界面导入支持格式的数据。

本软件使用模拟姿态与计算太阳翼角度，不是空间站姿态或发电遥测。云图为静态合成素材，银河为艺术示意。

## English overview

![English interface](docs/preview-en.png)

An offline-capable interactive 3D viewer and orbital simulation of China's Tiangong space station. Built around the author's modular 1:200 models, it combines configurable spacecraft assemblies, published orbital ephemerides, solar geometry, Earth's day/night cycle, and automatic solar-array tracking in one browser interface.

### Features

- **Configurable assemblies:** Tianhe, Wentian, Mengtian, Shenzhou, Tianzhou, and Xuntian. Deploy multiple copies of the same spacecraft, control arrays individually, or link laboratory-module rotations.
- **Orbit and time controls:** interpolate published OEM records within their validity interval; use real time, a custom date, pause, or playback up to 1000×.
- **Solar-array tracking:** solve single- and dual-axis pointing with sampled body/array occlusion. Tracking continues through eclipse while direct solar input remains zero.
- **Three Earth quality levels:** 1K simple, 2K medium, and 8K high; medium/high modes include clouds, atmosphere, and night lights.
- **Catalogue-based stars:** up to 41,411 stars, optional bright-star labels, an artistic Milky Way, and exposure styles.
- **Toggleable orbit minimap:** current sub-satellite position with past and future ground tracks, synchronized with simulation time.
- **Chinese / English UI:** switch at the top right; labels, readouts, messages, and module names update without resetting the simulation. Your language choice is remembered.
- **Interactive viewing:** orbit/pan/zoom, station-follow and orbit-overview views, immersive display, and 3D screenshot export.

### Getting started

Download and extract the repository ZIP, then open **[天宫空间站交互预览.html](天宫空间站交互预览.html)** in a recent Chrome, Edge, or Safari. This approximately 30 MB file embeds the model, textures, catalogue, libraries, and orbit snapshot. No installation or runtime network connection is needed.

The bundled orbit snapshot is valid from **2026-10-19 00:00 to 2026-10-26 00:00 UTC**. Positions are not extrapolated beyond that interval. Refresh it with **更新轨道数据.command** on macOS or `python3 scripts/update-orbit.py`, or import supported data in the interface.

Station attitude and array pointing are simulated rather than telemetry. Clouds are a static composite; the optional Milky Way is an artistic visualization.

## 开发 / Development

Node.js 18+ is required to build; Python 3 is used by the orbit-data scripts.

```sh
npm ci
npm test
npm run build
```

- `src/`: application, orbit/solar calculations, Earth/stars, and minimap.
- `assets/`: required model, prepared textures, catalogue, and orbital records.
- `build.mjs`: build the self-contained HTML; version and author come from `package.json`.
- `scripts/update-orbit.py`: refresh and validate the published orbital data, then rebuild.
- `scripts/prepare-environment.py`: optional texture/catalogue preparation; requires Pillow and the original attributed source textures in `assets/earth/source/`. Prepared assets are already included for normal builds.

## 素材与署名 / Credits

- Earth textures: [Solar System Scope / INOVE](https://www.solarsystemscope.com/textures/), **CC BY 4.0**; resized and compressed for the three quality levels.
- Star catalogue: [d3-celestial / XHIP](https://github.com/ofrohn/d3-celestial), **BSD 3-Clause** notice retained in `assets/D3-CELESTIAL-LICENSE.txt`.
- Starfield styling and artistic Milky Way: adapted from [StarSky Studio](https://github.com/Wenshuishi0528/StarSkyStudio), **CC BY 4.0**.
- Orbit source: [China Manned Space Engineering Office / BACC](https://en.cmse.gov.cn/news/202107/t20210722_48418.html).
- Three.js, Astronomy Engine, and three-mesh-bvh: **MIT**; notices are embedded in the standalone HTML.

Full asset notes: **[素材与迁移说明.md](素材与迁移说明.md)**. Third-party materials retain their respective licenses. Original project code and model are currently unlicensed for redistribution.
