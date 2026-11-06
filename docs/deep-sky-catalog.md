# 共享深空目录 / Shared deep-sky catalogue

主画面标注、巡天标注、名称搜索和准星识别共用 `DEEP_SKY_OBJECTS`。当前有 **12,162 个不重复显示项**：完整 M1—M110、OpenNGC 中有有效坐标的星系/星系组合、星团、星协、星云与遗迹，以及明确注明性质的 JWST 影像天区。默认仍是精选目标；只有选择全部目录才显示更广目录。恒星仍用独立的 Hipparcos/Tycho 数据，不能把星云照片中的无名光点随意认成一颗有名字的恒星。

## 数据与可复现来源

- **109 条原始 Messier 记录**来自 NASA/GSFC HEASARC [Messier 表](https://heasarc.gsfc.nasa.gov/W3Browse/all/messier.html)及[机器可读 TDAT](https://heasarc.gsfc.nasa.gov/FTP/heasarc/dbase/dump/heasarc_messier.tdat.gz)。坐标为 J2000 度、角尺寸为角分；底本是 *Sky Catalogue 2000.0*, Volume 2 (1985)。TDAT 内部更新日为 2022-02-03；解压内容 SHA-256 为 `1127c32408d74e8463e471e31debd56c3277a3667e1253f13b1187933bb7ca1c`。
- **M102** 遵循 [NASA/Hubble](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-102/)采用 NGC5866，V=10.7。这是历史目录歧义的明确展示约定。其余原有 Messier 名称、取整坐标与星等保留；可对应的 OpenNGC 位置角和别名补入同一记录。
- **OpenNGC 扩展**取发布者 [Mattia Verga and contributors](https://github.com/mattiaverga/OpenNGC/tree/be3cd6c5498806a2fbb2f7e0452ef802dbb02be0)，固定提交 `be3cd6c5498806a2fbb2f7e0452ef802dbb02be0`；2026-11-06 核查它仍是上游 HEAD。输入是 `database_files/NGC.csv` 与 `addendum.csv`，SHA-256 分别为 `54abea0b57b0a103831bfc7a8e3a99a23acfbf4bb581fcf3d8af539cbb826c84`、`c93f983dda6780b76b7b2e9271a856a892627710148a982ee98101a54c642fdd`。发布者依据 NED、HyperLEDA、CDS SIMBAD、HEASARC 等资料整理，各字段来源保存在其原始表中。
- 筛选规则完全固定：保留具有坐标的 `G/GPair/GTrpl/GGroup/OCl/GCl/Cl+N/*Ass/PN/HII/Neb/EmN/RfN/SNR/DrkN`，不导入 `Dup/NonEx/Other/*/**/Nova`。这是深空目录，不把恒星、未知分类、重复及不存在条目混入。原来的 M40 光学双星、M73 星群仍保留其 Messier 身份。12,159 条有效输入先按原有 Messier/精选项的编号及别名合并，再加入影像天区。NGC2244 等重复编号仍能搜索到其主条目；原有 M51、M76 的组合别名约定保持不变。
- [OpenNGC 字段说明](https://github.com/mattiaverga/OpenNGC/blob/be3cd6c5498806a2fbb2f7e0452ef802dbb02be0/NGC_guide.txt)明确规定：RA/Dec 是 J2000；长短径单位为角分；PA 从北向东计量；`V-Mag` 是总 V 星等，中央恒星亮度另有 `Cstar V-Mag` 列。本软件仅导入总 V 列，不把中央恒星亮度当作整个星云亮度，也不以这些不同口径的总星等冒充表面亮度。

新增紧凑源数据为 **602,375 bytes**，没有图像。所有目录源码合计小于 750 KB；不再为每条记录展开成冗长的 JS 对象字面量。源 CSV 是构建输入，不打包第二份。

```sh
python3 scripts/prepare-deep-sky-catalog.py /path/to/pinned/csvs
```

脚本检查两个原始文件的 SHA-256，再重建 `src/deep-sky-openngc-data.js`。运行软件不需要 Python，也不需要联网查目录。

## 大目标、常用名称与影像天区

- **大麦哲伦云 LMC** 是 OpenNGC addendum 的 ESO056-115：RA 80.893750°、Dec −69.756111°，目录尺寸 646′×550′、PA=170°；常用主标识为 LMC，原编号仍是别名。截图中 RA 81.75°、Dec −69.69° 距目录中心约 0.304°，在该目录区域内。
- **小麦哲伦云 SMC** 是同一目录的 NGC292：RA 13.186583°、Dec −72.828611°，299.92′×179.89′、PA=45°。SMC 是别名，不另造一个重叠对象。[ESA/Hubble 的对象说明](https://esahubble.org/images/heic0603d/)也将 SMC 与 NGC292 列为同一对象。该页面的图片中心不是整个星系的目录中心，本软件不混用二者。
- 补充精选包括马头、蜘蛛、气泡、心脏与灵魂星云、南环状星云、蝴蝶星云、毕星团、后发座星团、斯蒂芬五重星系等。名称主要由 OpenNGC 常用名翻译，另核对 [NASA 心脏与灵魂星云](https://science.nasa.gov/photojournal/heart-and-soul/)、[NASA 猫爪星云](https://science.nasa.gov/asset/webb/cats-paw-nebula-nircam-image/)、[ING 雷神头盔](https://astro.ing.iac.es/outreach/?format=IMG&id=1831)。NGC6334 在固定上游中误标为 SNR，本软件依 NASA 的恒星形成区说明改为星云，未改其目录坐标。
- **NGC3324 与“宇宙悬崖”不是同一个中心。** NGC3324 条目保留 OpenNGC 的星团/星云中心与 4.8′ 目录直径。另有 `JWST-CARINA-2022`，类型是“影像天区”，以 [ESA/Webb weic2205a](https://esawebb.org/images/weic2205a/)对应的真实 TAN/ICRS AVM 四角为足迹。其中心严格等于现有高清资源 manifest 的 RA 159.21303687393092°、Dec −58.62016558917656°，并链接 provider `jwst-carina-2022`。搜索“NGC3324”找目录对象；搜索“宇宙悬崖/Cosmic Cliffs”及资源按钮找影像天区。画面范围是图像覆盖，不是假称整幅红外照片都是一颗星团。

影像四角用 `assets/sky-detail/manifest.json` 的参考维度、参考像素、比例、旋转与 10K 栅格边界转换；遵循 [PyAVM 的 WCS 转换](https://github.com/astrofrog/pyavm/blob/main/pyavm/avm.py)及 FITS CDELT/CROTA→TAN 约定，和已有图片重投影保持一致。区域判断用球面四边形，不把外接圆角误当作有图像覆盖。

## 范围识别与遮挡

坐标使用 `[cos(dec)cos(ra), cos(dec)sin(ra), sin(dec)]`，与共有 `equatorial()` 相同。目录角尺寸不是精确的照片分割轮廓，也不能据此判断某个点属于该星系的哪颗恒星。

- 有长短径和 PA：在中心切平面按真实位置角检查目录椭圆。
- 没有 PA：仅识别短径对应的内切圆，不编造椭圆方向。只有一个公开直径时使用该圆形近似；缺少尺寸保持 `null`，只有中心匹配，不随意扩大。
- 准星位于扩展范围但离开中心：使用“位于 ×× 天区”。若真实目录恒星精确落在准星附近，恒星仍是首要识别，星云/星系作为 `region` 上下文，不把恒星改名为星云。
- 放大使中心移出视野后，可在可见光线上显示一个最相关的区域提示；没有虚构的中心符号，不设置准星避让区。图层/目录范围开关、地球、太阳系天体及空间站遮挡继续生效。中心被遮挡但该区域的另一条视线可见时，按实际可见视线判断。

## 许可与验证

`deep-sky-openngc-data.js`、`deep-sky-openngc.js` 中 OpenNGC 事实与名称改编，以及原有 `deep-sky-supplement.js`，保留 **Mattia Verga and contributors** 署名并按 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 提供；它们的数据许可独立于应用代码。改编包括筛选、去重、度制转换、中文常用名、少数有出处的分类纠正。JWST 影像天区坐标源为 ESA/Webb AVM，不新增下载照片。

定向测试为 `tests/deep-sky-catalog.mjs`、`tests/xuntian-catalog.mjs`、`tests/xuntian-crosshair.mjs`、`tests/xuntian-labels.mjs` 与 `tests/star-chart-layers.mjs`，覆盖全集编号、已知坐标、重复别名、未知数据、LMC/SMC 方向和范围、JWST 足迹、偏中心近拍、恒星优先、类别/实体遮挡、主图与取景共用布局，以及数据体积。
