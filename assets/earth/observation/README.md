# 地球观测图层 / Earth observation atlas

本地图集把遥感影像、地形和已记录矿点放在同一经纬坐标地球上。所有栅格为北上、东经向右、−180°至180°；原始数据和请求保留于开发缓存，运行资产采用 AVIF 和 gzip。制备程序为 `scripts/prepare-earth-observation.py`，逐文件尺寸与 SHA-256 见 `manifest.json`。

## NASA Terra / MODIS

内置观测期：**2026-10-24至2026-10-31，八日合成**。这是图像的数据期，与软件的场景时钟分开。

| 图层 | GIBS 产品 | 颜色含义 |
| --- | --- | --- |
| 可见光 1–4–3 | MODIS_Terra_L3_SurfaceReflectance_Bands143_8Day | R/G/B 分别为波段1/4/3 |
| 近红外 1–2–1 | MODIS_Terra_L3_SurfaceReflectance_Bands121_8Day | 近红外分配至绿色通道；植被通常绿色 |
| 短波红外 7–2–1 | MODIS_Terra_L3_SurfaceReflectance_Bands721_8Day | R/G/B 分别为短波红外/近红外/红光 |
| 白昼地表温度 | MODIS_Terra_L3_Land_Surface_Temp_8Day_Day | MOD11A2晴空地表温度 |
| 夜间地表温度 | MODIS_Terra_L3_Land_Surface_Temp_8Day_Night | MOD11A2晴空夜间地表温度 |

访问：[NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/access-basics/)。图例取[官方温度颜色表](https://gibs.earthdata.nasa.gov/colormaps/v1.3/MODIS_Land_Surface_Temp.xml)，K 转 °C 减273.15，保留官方配色。展示的是温度产品可视化，未由有损图像反推像元温度数值。两张温度图使用同一色标；它们表示地表温度，不是空气温度。

本机地图4096×2048，像元约0.08789°，赤道约9.8公里；源产品约250/500米反射率和1公里温度的分辨率不等于本机概览精度。原始反射率图中的黑色可包含水体与缺测，JPEG源图的alpha不能作为有效观测覆盖率。温度海洋及无效观测保留透明缺测，在球面显示深色底纹。不生成缺失的观测，不把不同日期云图盖在这些遥感图上。

We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).

## NOAA ETOPO 2022

与[现有地球高程](../elevation/README.md)使用相同来源，使用压平海面之前的2048×1024高程网格，保留海底负高程。高程单位米，相对EGM2008大地水准面。全球概览色标与地表模式的局部Copernicus高程细节分开；点取概览值不能作为山峰或工程测量精度。球面仍使用真实地球地形，颜色显示陆地与海底高度。

[NOAA ETOPO 2022, DOI 10.25921/fd45-gt74](https://doi.org/10.25921/fd45-gt74)，CC0-1.0。2022为产品年份，来源包含多个时期的测量。

## USGS Mineral Resources Data System

取得 **304,632条** MRDS compact记录，未排除合法坐标的记录。保留原记录编号、名称、经纬度、矿种代码、历史开发状态与资料等级；每条记录链接原始资料。矿种英文名称直接来自官方Commodity表，常见矿种提供中文。

[USGS托管图层与许可](https://www.arcgis.com/home/item.html?id=579544a8423e40bbba6c1229082554d1)；数据公共领域。快照获取日期2026-11-09。MRDS系统更新截至2011年；资料覆盖因地区而异，记录可以是矿山、矿床、勘探点或矿化显示，历史开发状态不代表现在的运营状态。图上的数量为记录数量，不能解释为储量、矿体面积、经济价值或完整资源普查。煤、油气等类别也仅是该档案中的记录。

远景按4°网格聚合，中景1°，近景0.1°；组位置取组内真实记录，点击可看组内记录，放大继续展开。普通点和聚合点分别用小／大金色符号，不按储量放大。源目录按需加载，加载后可离线查询；同次运行关闭再打开可复用，GPU几何随观测窗口关闭释放。

**Required acknowledgment:** Map services and data are available from the U.S. Geological Survey Mineral Resources Data System (MRDS), provided by the U.S. Geological Survey via https://doi.org/10.3133/ds20.

Mason, G.T. and Arndt, R.E., 1996, Mineral Resources Data System (MRDS): USGS Data Series 20. Record-quality grades follow Schweitzer, P.N., 2019, [doi:10.5066/P9DYLWMP](https://doi.org/10.5066/P9DYLWMP); grades describe record completeness rather than a mineral reserve classification.
