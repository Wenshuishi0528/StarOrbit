# 月球颜色与真实地形 / Lunar colour and real terrain

本目录用于星轨的月球显示和独立月球观测馆。它不是实时月面摄影，也不把绘图细节声明为地面望远镜的可分辨细节。

## 颜色底图

保留项目已有 `lroc-color-2k.jpg`（2048 × 1024），来自 [NASA SVS CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/) 的 2025 LROC 颜色图。NASA 说明该可视化拼图经过曝光、白平衡和极区缺覆盖处理；它适于渲染展示，不是可用于定量光度分析的原始反照率产品。经度 0° 位于中央，左／右边界为 −180°／+180°，北在上，东经为正。

## LOLA 高程

运行文件与精确处理记录：

- [高程清单](terrain-manifest.json)
- [半米单位 int16 小端高程，gzip 压缩](lola-720x360.i16.gz)
- [NASA 原始浮点 TIFF](https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_4.tif)
- [LOLA PDS 数据档案](https://pds-geosciences.wustl.edu/missions/lro/lola.htm)

源自 NASA SVS 4720 的 LRO/LOLA 全球 4 像素／度产品（1440 × 720，2019 春季基线）。原始浮点值的单位是相对于 **1737.4 km 球半径的千米**；不是另外那个自带 +10 km 偏移的无符号 TIFF。源 SHA-256：`330afa2556a86fd05ac6ba2f912f246600fdade35de2a0d90593d50d07b01b65`。

程序把每个 2 × 2 像元的算术均值量化为半米单位的有符号 int16，得到 720 × 360、0.5°／像素的离线全球栅格（赤道处约 15.2 km／像素）。量化误差至多 0.25 m，不包括源数据误差和平均化造成的空间平滑。当前成品高程范围为 −8327.5 至 +9789.5 m，压缩后约 470 KiB。南北极单点使用对应极区行均值；经度接缝连续采样。

月球观测馆把该数据用于实际球面位移和几何法线，未生成随机陨石坑。网格为 720 × 360 分段（516,960 个三角形），仅在首次加载或首次使用某个地形倍率时建立，缓存真实尺度和 8× 两副几何。全球栅格的分辨率不能冒充近距离着陆级地形或望远镜分辨率；许多小型环形山和山峰不能被这个简化模型分辨。以 DEM 最低高程对应半径再减 0.2 km 网格余量构造保守内切球，阻挡穿过月体内部的太阳光；以局部直线地平线切割有限日面圆盘估算部分可见比例。8× 模式的内切球同步采用夸大后的最低高程。此版本未计算山体投影阴影或逐地形射线地平线；内切球以外的晨昏线附近亮点并不保证具备真实局部地形可见性。

## 显示口径

- **地面观测**：同一太阳／月球／观测点时刻决定月相、站心方向和天球北朝上；地形固定为 1×。滚轮／双指改变视场放大，不移动实际地面观察点。月球在地平线下时，理论视盘可供分析，但不表示当地可观测。
- **三维图鉴**：自由绕月查看，暗面具有明确标示的辅助照明，便于辨认背面地形；可使用 8× 垂直夸张。它不代表从选定地面位置看到的月球。原始高程读数和伪彩始终表示真实数据值，不随夸张倍率改变。
- **高程伪彩**：蓝 → 青 → 灰绿 → 褐 → 浅黄，对应 −10 至 +10 km；0 表示 1737.4 km 参考球面，不是月球海平面或液态水。地形颜色不是自然月面色彩。
- **月食**：以有限太阳圆盘和地球球体计算每个面片位置的直接日光遮蔽，包括几何本影／半影。不模拟地球大气折射造成的红月亮、地球照或实时云层。显示的照明几何不等同真实相机亮度或大气透明度。
- **地名**：地名中心按真实月面经纬度布置并隐藏背向观察者的名称；不推断陨石坑边界。标签没有对每条视线求解局部山体遮挡。

## 复现与署名

在源码工作区运行 `node scripts/prepare-lunar-terrain.mjs --download`，或使用已缓存的原始 TIFF：`node scripts/prepare-lunar-terrain.mjs --source output/lunar-source/ldem_4.tif`。生成脚本核对源尺寸、有限值、单位范围及固定源 SHA，再记录成品 SHA。原始 4 MB TIFF 是处理缓存，不放入运行包；离线再生需要保留该缓存。运行包已内置颜色和高程，无需启动时联网获取。

Credit: **NASA's Scientific Visualization Studio / Ernie Wright; LRO / LROC / LOLA**. [NASA 影像和媒体使用指南](https://www.nasa.gov/nasa-brand-center/images-and-media/)适用；原始机构和数据作者的权利不重新标为星轨软件许可证，不暗示 NASA 认可本产品。

English: The existing LROC visualization mosaic and a real, downsampled LOLA elevation raster are embedded for offline viewing. The DEM is 0.5 degrees per pixel, quantized to signed half-metres relative to 1737.4 km. Observe mode uses date/observer geometry at physical relief; atlas mode allows labelled fill light and 8× vertical exaggeration. False colours are elevations, not photographic colours. No invented craters, live imagery, terrain-cast shadows, earthshine or refracted eclipse red light are claimed.

## 月面目录与地质图

- [全量正式地名与着陆任务](places/README.md)：IAU/USGS 9,087 条已批准地名，40 项月面着陆任务，明确位置精度和未知坐标。
- [中科院全月地质图](geology/README.md)：2022 年 1∶250 万公开预校样，原投影完整查看、高清图例和年代尺；其 CC BY 4.0 许可独立于软件许可。
