# ETOPO 2022 全球地形底座

`base-surface-i16.bin.gz` 是 NOAA NCEI **ETOPO 2022 v1 Ice Surface** 的低清显示派生网格。格陵兰和南极使用冰面高度；海底测深仅在确定的海洋连通区提升到 0 m 海面。它不是照片、山体形状示意或人为生成的地形。

## 文件接口

- gzip 解压后为 **2048 × 1024、4,194,304 字节**的连续 signed int16 little-endian 数组；没有文件头、额外行列或 NoData 值。
- 单位为米，正方向向上；水平参考 WGS84 / EPSG:4326，垂直参考 EGM2008 geoid / EPSG:3855，**不是 WGS84 椭球高**。
- 按行存储，北向南、西向东。零起始 `(x, y)` 对应 `a[y * 2048 + x]`。
- 经纬度为**像元中心**：`lon = -180 + (x + 0.5) × 360 / 2048`，`lat = 90 - (y + 0.5) × 180 / 1024`。外边界为 `[-180, -90, 180, 90]`，经纬间隔均为 0.17578125°，赤道处约 19.6 km。
- 左右循环，不复制 ±180° 接缝列；南北不循环。连续取样用 `x = ((lon + 180) mod 360) × width / 360 - 0.5`、`y = (90 - lat) × height / 180 - 0.5`，横向索引循环、纵向索引限制到首末行，再做双线性插值。`lon = -180°` 和 `+180°` 必须得到同一值。
- `manifest.json` 的 `base.file` 为仓库根目录相对路径，`base.dtype` 为 `int16-le`；包含压缩/解压字节数和 SHA-256。解压后的 CPU 高程数组为 4 MiB；实际显示使用位移网格，几何内存另计，不把高程数组大小当作总显存占用。

## 海面处理与范围

先保留带海深的原始重采样网格，再在 `height <= 0 m` 的像元上做**四邻域、经度循环**洪泛。仅与清单中的太平洋、北冰洋、大西洋、印度洋、南大洋及开放边缘海种子相连的区域设为 0 m。宽度小于粗网格的海峡可能断开，因此地中海、黑海、波罗的海、普吉特海湾等有独立的真实海域种子；全部坐标和原始高度在 manifest 中列明。

**没有把所有负高度截断。** 不与这些海域连通的内陆负洼地保持原值。ETOPO 同时含测深；封闭湖海的保留值可能是湖底/海底而非当日水面，这份低清底座不推算内陆水位。约 20 km 网格也不能准确还原细小海峡、海岸、城市地势或山顶峰值，应由局部高程覆盖。单个负洼地被粗网格零高程通道误连海洋的可能性属于该显示近似的限制。

未经海面处理的 `base-raw-i16.bin.gz` 和 NOAA 返回的源样本保存在忽略版本控制的 `output/earth-elevation-source/`，**不随软件打包**；原始采样数组的 SHA-256 记录在 manifest。源数据和这些中间文件都可通过脚本重新取得。

## 来源与日期

- [NOAA NCEI ETOPO 产品页](https://www.ncei.noaa.gov/products/etopo-global-relief-model)
- [官方 ERDDAP 数据变量与坐标](https://oceanwatch.pifsc.noaa.gov/erddap/info/ETOPO_2022_v1_60s/index.html)：数据集 `ETOPO_2022_v1_60s`、变量 `z`、60 arc-second。
- [NCEI 元数据、时间范围和许可](https://www.ncei.noaa.gov/metadata/geoportal/rest/metadata/item/gov.noaa.ngdc.mgg.dem:etopo_2022/html)
- [ETOPO 2022 DOI](https://doi.org/10.25921/fd45-gt74)

**2022 是产品版本年，不是每个像元的拍摄年。** NCEI 列明产品发布日为 2022-10-01，时间覆盖为 1998-01-01 至 2022-09-01；它融合了不同时期、多种来源的地形与测深。不能把下载日期、产品发布日或 ERDDAP 文件整理日期当作统一观测日期。程序应显示“ETOPO 2022”，不要宣传为“2026 实测地形”。

## 重现

需要 Python 3、NumPy、requests：

```sh
python3 scripts/prepare-earth-elevation.py
```

数据主体只请求官方 ERDDAP 子样本 `z[4:8:10796][4:8:21596]`，返回 **2700 × 1350** 个样点，约 14.6 MB；不下载 21600 × 10800 原始全球栅格。另用三个约 243 字节的原生单像元请求核对高原、冰面和海深的数值与坐标。样点间距为 8 arc-minute，先按真实坐标进行经度循环双线性点插值，再取到目标像元中心，最后四舍五入至整数米（恰好半米时取偶数）。这项量化误差不超过 0.5 m，但不代表数据总精度；空间降采样的山峰削低、原数据误差不在该界限内。

gzip 使用固定时间戳，解压内容及输出 gzip 均有摘要；海洋连通、内陆负值保留、±180° 周期和 gzip 往返在制备时检查。重新下载时删除 `--work` 中的缓存即可，或指定新的 `--work` 路径。正式产物为表面网格和 manifest；较大的原始输入始终留在工作目录。

## 许可与署名

NOAA NCEI 在官方元数据中将 ETOPO 2022 数据以 **CC0-1.0** 全球公共领域贡献发布。本派生高程网格同样按 CC0-1.0 提供；项目程序本身的许可不变。见 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) 和上述 NCEI 许可依据。NOAA 不为这些数据提供精度保证，产品不适合航海导航。

建议保留：**NOAA National Centers for Environmental Information, ETOPO 2022; resampled by StarOrbit.**

引用：NOAA National Centers for Environmental Information. 2022: *ETOPO 2022 15 Arc-Second Global Relief Model*. NOAA National Centers for Environmental Information. https://doi.org/10.25921/fd45-gt74.

## English interface note

The bundled file is a losslessly gzipped, north-up, pixel-centered 2048 × 1024 signed little-endian int16 grid in metres above the EGM2008 geoid. Longitude wraps; latitude clamps. Ocean-connected nonpositive cells are set to sea level by the documented periodic four-neighbour flood fill. Inland depressions remain unchanged. The original bathymetric samples are retained in the preparation working directory, not in the package. ETOPO 2022 is a compiled product released in 2022, not a uniform acquisition epoch. NOAA source and this derived grid: CC0-1.0.
