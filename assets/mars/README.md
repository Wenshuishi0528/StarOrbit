# 火星科学地图与地点目录

所有发布纹理采用等距圆柱经纬网：左端 −180°、中心 0°、右端 +180°东经；第一行北极、最后一行南极；纬度为**行星中心纬度**。像素代表格心。XYZ 为本体固定系：X=0°E、Y=90°E、Z=北极。所有科学底图均从公开任务/测绘数据处理，没有使用生成图像。

`manifest.json` 给出发布资源 SHA-256、尺寸、单位、原始下载请求及原始文件哈希。原始大数据和处理工具缓存在 `output/mars-source`、`output/mars-tools`，不进入发布资源。

## 图层

- **visible.jpg**：Viking MDIM 2.1 可见光镶嵌，经 USGS 配准至 MOLA 控制网，再由 NASA Ames 使用 MDIM 1.0 色彩着色。是历史任务镶嵌与着色产品，不是当日云尘或原始真彩照片。NASA/USGS/NASA Ames。资料：[ASU MDIM](https://mars.asu.edu/data/mdim_color/)。这里实际采用官方 WMS 的 `MDIM21_color` 图层。
- **day-ir.webp**：Mars Odyssey / THEMIS 日间热红外全球镶嵌 v12，ASU 2014，原始约100 m/像素。这里是2K降采样图。日间亮暗兼受温度、坡向与表面性质影响。
- **night-ir.webp**：THEMIS 夜间控制镶嵌，USGS 2018，原数据 NASA/JPL/ASU，原始约100 m/像素；实际覆盖约65°S—65°N。透明缺测像素保留。夜间亮区通常对应夜间保温更强的表面，但不能将灰度直接当作温度或唯一成分判断。
- 两张热红外纹理都是已处理的历史镶嵌强度图，不附带绝对温度定标。资料：[ASU 日间](https://mars.asu.edu/data/thm_dir/)、[ASU 夜间](https://mars.asu.edu/data/themis_nightir/)。实际发布版本以 USGS WMS 元数据为准，不能把早期 ASU v1/v2 日期混用于较新 USGS 图层。
- **geology.png**：Tanaka et al. (2014)，*Geologic Map of Mars*，USGS SIM 3292，原比例尺1:20,000,000。读取 USGS 官方 ArcGIS 的1311个地质多边形，在火星半径3396190 m的原生 Robinson 投影中反投影，再栅格化成2K等距经纬图。保留官方44类地质单元颜色；`geology-legend.json` 提供完整颜色/英文单元释义。没有将图版、图例或文字直接贴到球面。
- **elevation.jpg** 与 **mola-height.i16.gz**：MGS MOLA MEGDR v2，NASA/GSFC。原始4像素/度，1440×720，MSB signed int16，单位m。将0—360°经度重排为−180—180°，2×2均值后四舍五入至1 m，发布720×360 little-endian int16 gzip。高程相对 **GMM3 火星参考等位面（areoid）**，不是相对平均半径/参考椭球。全覆盖，无缺测值。色彩图例由manifest提供；最高峰会受到0.5°降采样影响。

## 官方来源

- [USGS Planetary WMS capabilities](https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/mars/mars_simp_cyl.map&SERVICE=WMS&REQUEST=GetCapabilities)：MDIM21_color、THEMIS、THEMIS_night；GetMap 使用 WMS1.1.1 的 SRS=EPSG:4326 经/纬顺序，范围−180,−90,180,90。这是该行星服务的经纬坐标接口；没有把火星坐标变换成地球WGS84地面位置。
- [USGS SIM 3292](https://pubs.usgs.gov/sim/3292/)，[官方交互地图 DOI](https://doi.org/10.5066/P9PBKSGE)，[官方GIS图层](https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Tanaka_et_al_2014_Mars_Global_Map_Features/FeatureServer/3)。处理始终在原生火星球体上进行，避免地球与火星基准面混用。
- [MOLA MEGDR PDS目录](https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg004/)，[原始产品标签](https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg004/megt90n000cb.lbl)。原产品2003-04-03、版本2.0，主要观测期1999—2001年；PDS2026重新打包不意味着新的观测。

NASA/USGS科学数据按其公开资料使用政策发布；保留任务、团队、论文和数据产品署名。ASU/JPL为THEMIS科学数据原提供方。本目录的处理结果不代表这些机构为本软件背书。

## 地名、着陆点与计算

`src/mars-catalog.js`：34个精选主要地貌，名称及中心坐标直接提取 [IAU/USGS 官方地名库](https://planetarynames.wr.usgs.gov/Page/MARS/target) 2026-11-08快照；中文为显示译名。地貌中心不是山顶或着陆点。另有10个有成功科学回传的着陆任务地点：维京1/2、探路者/旅居者、勇气、机遇、凤凰、好奇、洞察、毅力/机智、天问1/祝融。地点是历史着陆位置，不随火星车行驶移动。苏联早期短暂回传/失败任务和未确认准确位置不在本精选目录内。

早期任务坐标采用 [NASA PDS/ODE 文献汇总](https://ode.rsl.wustl.edu/mercury2/pagehelp/Content/Missions_Instruments/Landing_Sites.htm) 的行星中心纬度，避免旧文献行星面纬度混用。洞察、毅力、祝融使用目录逐条附带的任务论文/机构来源。祝融的中国标记字段为 `country: 'CN'`、`countryCN: true`。着陆日期以UTC存储：祝融UTC 2021-05-14，对应北京时间2021-05-15。

`planetary-observation-math.js` 复用 Astronomy Engine 与 `solarWorldBodyAxes`；观测范围1900—2100。地点为地球大地纬度/东经度/海拔m，距离km，视直径同时给度和角秒。行星本体方向在光子离开发射时刻求解，画面朝向与中央经线一致；方位、高度是接收时刻地球观测者的天空方向。相位和日照来自太阳—行星—观测者几何。大气折射仅标准近似，地形地平线/天气不包含在本模块。火星采用球面地形可视化，地图纬度为行星中心纬度。JPL Horizons基准对照已在测试中保留（西经转东经、行星面纬度转行星中心纬度）。

## 重建

安装 Python `requests numpy Pillow pyproj rasterio pyshp`，运行：

```
python3 scripts/prepare-mars-data.py
python3 scripts/prepare-mars-catalog.py
node tests/planetary-observation-math.mjs
node tests/planetary-observation-data.mjs
```

缓存会复用；要更新源数据需显式移走对应缓存，并复核manifest中的哈希、日期、投影和覆盖范围。
