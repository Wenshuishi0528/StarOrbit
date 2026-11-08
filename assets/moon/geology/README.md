# 中科院全月地质图：2022 公开预校样

本目录是中国科学院地球化学研究所牵头团队发布的 **1:2,500,000 全月地质图 V1，2022-06-15 公开预校样**。不是 2024 年出版图集的完整数字版，也不是元素含量栅格。原图的 `Pre-proofs` 水印、图例、年代尺和署名均保留。

## 来源与署名

Jinzhu Ji, Dijun Guo, Jianzhong Liu, Shengbo Chen, Zongcheng Ling, Xiaozhong Ding, Kunying Han, Jianping Chen, Weiming Cheng, Kai Zhu, Jingwen Liu, Juntao Wang, Jian Chen, Ziyuan Ouyang. **The 1:2,500,000-Scale Geologic Map of the Global Moon. V1.** NSSDC Space Science Article Data Repository (sadr), 2022. [DOI: 10.12176/03.99.02797](https://doi.org/10.12176/03.99.02797).

- [ScienceDB 正式数据记录](https://www.scidb.cn/en/detail?dataSetId=972277454573928448)：原页面嵌入的 JSON-LD 明确列出 `conditionsOfAccess: PUBLIC`、CC BY 4.0、V1 和原文件大小 206245173 bytes。
- [公开原图镜像与署名](https://commons.wikimedia.org/wiki/File:The_geologic_map_of_the_Moon_at_1-2.5M_scale.jpg)：下载文件的字节数与正式记录一致；SHA-256 和尺寸记录于 [manifest.json](manifest.json)。
- [研究论文](https://doi.org/10.1016/j.scib.2022.05.021)：论文版权与单独发布的数据许可是不同事项，不在此打包论文。
- [2024 年图集的中科院介绍](https://english.cas.cn/newsroom/news--archives/2024/headlines/202405/t20240511_1129400.shtml)：该图集另包括岩性、构造和分幅图；本目录不宣称覆盖全部出版内容。

## 许可与使用说明

数据记录和镜像均标注 [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)。图像可在保留适当署名、许可链接和修改说明的条件下分发；不得暗示原作者或机构为本软件背书。本目录图像仍遵循其独立许可，软件的许可不替换图像许可。

正式记录摘要还写有仅供非商业科研和科普使用的说明。我们完整记录这一额外表述，未把它改写成另一种 CC 许可；星轨本次用途为非商业科普展示。正式元数据摘录见 [source-record.json](source-record.json)。如要将地图用于商业产品，应直接向数据作者澄清其摘要与 CC BY 元数据之间的表述差异。

没有申请或下载要求订单审核的 GIS 数据，没有接受额外协议或付费。另一个地理资源数据平台的相关 GIS 产品要求审核且有再传播限制，不能把这份开放海报的许可自动扩展到那些 GIS 图层。

## 投影与加工

原文件为 29999 × 12978 的复合海报：中央全月图为 Mollweide（摩尔威德）投影，另有极区图、岩性与构造插图和说明。原文件不附地理配准栅格信息。星轨根据中央主图的椭圆图框和独立经纬网控制点建立配准，输出单独的 4K 经纬纹理供 3D 月球使用；不将海报边框和图例包球，也不按图片颜色自动推断某点的地质属性。

`poster.webp` 是保留全部布局的 8192 像素宽版本；`overview.webp` 是 2400 像素宽总览。`legend.webp` 与 `timescale.webp` 是明确标识的原图高清裁区。处理仅包括比例缩小、压缩与裁区，不删除水印、不改色、不重新绘制地质边界。图中年代边界保持 2022 年版本，不与后续研究的修订混用。

`globe.webp` 是独立的 **4096 × 2048 RGBA 经纬纹理**，左侧 -180°、中央 0°、右侧 +180°，东经为正，北上南下。Mollweide 图框拟合中心为 (15007.41055, 6439.23334) 原图像素，半轴为 (10628.48033, 5313.50386) 像素；360 个图框样本的径向残差 RMS 为 1.36 像素（358 个残差小于 5 像素的样本 RMS 为 0.89 像素）。六个未参与拟合、独立读取的经纬交点残差为 1.58–2.26 像素，读图本身的不确定度约 3 像素。它们是配准检查，不能被解释为整幅地质边界具有同等测量精度。

采用 [USGS Snyder 投影公式（Mollweide，pp. 249–252）](https://pubs.usgs.gov/pp/1395/report.pdf)：每个输出经纬像素中心正向投影到原图，再双线性采样原始 RGB。投影定义另见 [PROJ 官方文档](https://proj.org/en/stable/operations/projections/moll.html)。代码不提取地质类别，不推断缺失颜色；保留图内原有水印、地名、纹理、经纬线和年代标记。原图已经带有地形阴影，并非纯地质矢量图层。

离印刷椭圆边框不足 8 原始像素的区域（包括不可可靠分辨的极尖），设为透明无数据，三维查看器应显示中性灰色。有效像素占经纬矩形的 98.2580%；按 cos(纬度) 加权的球面有效面积为 99.7626%。不另施加任意纬度截断。极区仍可在完整原图的独立极区图中查看。本次没有把不同投影的极区小图未经配准地拼接进纹理。

独立位置检查采用 IAU/USGS 官方环形山中心：[Tycho (-43.30°, -11.22°)](https://planetarynames.wr.usgs.gov/Feature/6163)、[Copernicus (9.62°, -20.08°)](https://planetarynames.wr.usgs.gov/Feature/1296)、[Tsiolkovskiy (-20.38°, 128.97°)](https://planetarynames.wr.usgs.gov/Feature/6108)。三点重投影均位于原图相应命名环形山内部，验证了东西方向和远近月面方向。量化配准数据见 [registration.json](registration.json)。

复现：运行 `python3 scripts/prepare-lunar-geology.py --download`，或以 `--source` 指定已下载原图。脚本只接受清单固定哈希的原文件，生成前验证尺寸、大小和哈希；生成文件的尺寸、处理方式及 SHA-256 写入清单。原始大图保留在开发输出目录，不随软件打包。

仅重建三维贴图可运行 `python3 scripts/reproject-lunar-geology.py output/lunar-geology-source/igcas-geologic-map-2022-original.jpg assets/moon/geology`。需 Pillow 和 NumPy。独立验证：`python3 tests/lunar-geology-projection.py` 与 `node tests/lunar-geology.mjs`。4K 输出的经纬采样间距为 0.087890625°；地质图阅读和科普适用，不能作为工程选址、元素浓度读取或定量地质边界测量数据。

## English summary

These are attributed views of the **2022 V1 public pre-proofs** released by the IGCAS-led team, not the complete 2024 published atlas. The official record declares PUBLIC access and CC BY 4.0, while its description also specifies non-commercial research and science promotion. Both statements are preserved; this use is non-commercial education. A separate 4K globe texture is registered from the central Mollweide panel using its printed outline and independently checked graticule. Original labels and pre-proofs watermarks remain; the full poster retains all credits and legends. Polar pinches and the printed outline are transparent no-data, rendered grey. This is an educational RGB reproduction, not analytical GIS or a numerical geochemical dataset.
