# 深空目录数据说明

本目录提供完整的 M1—M110 检索与星图位置，以及 17 个补充 NGC 目标，共 127 项。范围、类型和坐标用于天图符号、名称和搜索对准；没有附带天体照片，也不把符号当成望远镜能分辨出的实体细节。

## 数据来源

- **109 个 Messier 原表目标**：NASA/GSFC HEASARC 的 [Messier Nebulae 表及字段说明](https://heasarc.gsfc.nasa.gov/W3Browse/all/messier.html)，[机器可读 TDAT 文件](https://heasarc.gsfc.nasa.gov/FTP/heasarc/dbase/dump/heasarc_messier.tdat.gz)。该表注明 equinox=2000，赤经、赤纬单位为 degree，尺寸单位为 arcmin；底本为 Hirshfeld 与 Sinnott 编的 *Sky Catalogue 2000.0*, Volume 2 (1985)。原始 TDAT 于 2026-11-06 取得；文件内部最后更新日期为 2022-02-03，解压内容 SHA-256 为 `1127c32408d74e8463e471e31debd56c3277a3667e1253f13b1187933bb7ca1c`。没有手工抄录整张坐标表。
- **M102 与 17 个补充 NGC 目标的坐标、尺寸、类型**：[Mattia Verga 与贡献者维护的 OpenNGC](https://github.com/mattiaverga/OpenNGC/tree/be3cd6c5498806a2fbb2f7e0452ef802dbb02be0)，固定版本 `be3cd6c5498806a2fbb2f7e0452ef802dbb02be0` 的 `database_files/NGC.csv`。上游逐字段来源包括 NASA/IPAC NED、CDS SIMBAD、HyperLEDA 和 HEASARC；直接读取发布者的 CSV 并转换小时制赤经，未采用搜索结果摘要凑坐标。
- **常用名称及类型交叉核对**：[NASA/Hubble 的 Messier 目录](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/)。中文为常用中文名或目录编号加中文类型；没有可靠常用名的对象保留编号。补充对象的英文名对应 OpenNGC 常用名和目录编号。
- **M102 的身份和星等**：[NASA/Hubble Messier 102 页面](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-102/)采用纺锤星系 NGC 5866，目视星等 10.7。本软件遵循这一展示约定。HEASARC 旧表把 M102 视为 M101 的重复记录，因此只有 109 行；这是真实的历史目录歧义，不是缺失第 102 行后随意补值。

## 使用约定与保留的信息

`src/deep-sky-catalog.js` 导出 `DEEP_SKY_OBJECTS`、`DEEP_SKY_TYPES`、`DEEP_SKY_COORDINATES`、`deepSkyName()` 和 `deepSkyTypeName()`。每个目标的 `ra` 与 `dec` 是 J2000 赤道坐标、单位度；`direction` 为 `[cos(dec)cos(ra), cos(dec)sin(ra), sin(dec)]`，与主星图及巡天共有的 `equatorial()` 完全一致。坐标在运行中不联网更新。

`angularSizeArcmin` 是 `[长径, 短径]`。来源只给一个直径时，重复该值形成圆形目录范围；它不是另一次短轴测量，也不包含天体实际轮廓或位置角。来源不给尺寸则保留 `null`。旧 Messier 表的中心坐标及尺寸经过取整，适合观测图和目标定位，不是精密测量目录。

Messier `mag` 使用来源的综合目视星等；原来的 `:` 或 `*` 不确定标记通过 `magnitudeUncertain` 保留。补充 NGC 表混有不同来源和定义的测光，本次全部省略其星等，避免误把中心星或核区亮度当成整目标亮度。只有独立核对的 M102 采用 NASA 的目视星等。缺失值保持 `null`，不能按 0 等显示。

有三种必须单独保留的类型：M24 为恒星云，M40 为光学双星，M73 为四星星群；它们没有被错误归入疏散星团。M1 为超新星遗迹。M16 这条 HEASARC 记录描述 NGC 6611 星团，故类型与 7′ 尺寸仍对应星团，同时允许用“鹰状星云／老鹰星云／创生之柱”搜索其所在区域。NGC 2237、NGC 6960 与 NGC 6992 是常见大星云复合体中的目录部分，补充目录不构成复合体的精确边界。

## 补充数据的归属

`src/deep-sky-supplement.js` 的 18 条数据由 OpenNGC 改编，保留 **Mattia Verga and contributors** 署名，按照 [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/) 提供。改编内容包括筛选目标、统一 J2000 度制、类型映射、中文名和别名、删除未核对的测光，以及独立补入 NASA 的 M102 星等。该数据文件的归属与许可独立于应用程序代码；上游致谢与来源列见上述固定版本。

本批没有采用仅限科研分发的 NGC2000 数据表，也没有下载或打包任何 NASA/Hubble 天体图像。

## 验证

`node tests/deep-sky-catalog.mjs` 检查 M1—M110 无漏项、编号唯一、J2000 角度和向量一致、典型目标独立坐标锚点、南天补充、特殊分类、未知值保持为空、别名映射及总数据小于 100 KB。
