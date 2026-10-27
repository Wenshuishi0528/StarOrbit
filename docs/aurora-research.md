# 极光原理、轨道实拍与实现依据

研究日期：2026-10-27。目标：从近地轨道看见具有高度、薄幕、细丝和扩散范围的极光，同时控制网页端计算量。

## 1. 发光原理

太阳风与地球磁层交换能量，使磁层粒子受到加速。电子沿磁场进入高层大气，与氧原子、氮分子等碰撞，激发态退激时发出光。不同粒子能量、大气成分与碰撞猝灭条件共同决定颜色及高度。极光结构随粒子沉降区域变化；可见的飘动不是把一团气体像烟雾一样吹动。

来源：[NOAA Aurora Tutorial](https://www.spaceweather.gov/content/aurora-tutorial)、[NASA Auroras](https://science.nasa.gov/sun/auroras/)。

## 2. 为什么会有薄幕、细丝和广域淡光

离散极光常呈弧带，内部包含沿磁场方向延伸的射线。多条弧带会卷曲、分叉或呈褶皱。薄幕在沿弧方向延伸很长，在高度方向展开；从不同位置看，投影会变成细弧、幕墙或较宽的纱状区域。较弱的扩散极光可以占据更广的范围。

明亮的弧段、细丝和薄雾状背景应有层次。把亮弧强制连成整圈会产生灯条感；让各向同性块状噪声主导整个区域则会产生斑驳布料感。

来源：[NASA / David P. Stern，Polar Aurora](https://pwg.gsfc.nasa.gov/Education/bh2_6.html)、[NOAA 形态介绍](https://www.spaceweather.gov/content/aurora-tutorial)。后一句是对本项目试做效果的判断。

## 3. 颜色应沿高度连续分布

NASA 的教学资料给出绿色氧发光约 100–200 km、高处红色氧发光约 200 km 以上、底缘氮发光可呈粉紫色。加拿大航天局的介绍把常见绿光列为约 100–300 km、高处红光约 300–400 km。范围随条件变化，适合用有重叠的连续高度分布，而不是三张固定颜色的水平面。

实现目标是绿色主体、较高处弱红光，以及只在部分底缘出现的少量粉紫色。红光和粉色不应成为每一条幕上等强、等宽的三色条纹。

来源：[NASA 颜色和高度](https://science.nasa.gov/sun/auroras/)、[Canadian Space Agency](https://www.asc-csa.gc.ca/eng/astronomy/northern-lights/colours-of-northern-lights.asp)。

## 4. 轨道实拍对照

以下为已实际查看的 NASA 影像。照片用于形态研究，不随软件打包。图像来源署名：NASA / Earth Science and Remote Sensing Unit, NASA Johnson Space Center；详细摄影信息以各原始页面为准。

### 2011：ISS 南极光延时序列

[原始视频与说明](https://svs.gsfc.nasa.gov/30179)。照片拍摄于 2011-09-17；对照了视频约 0、5、10、15 秒画面。远处亮弧有竖向细丝，上方淡红；近处出现展开的透明绿色结构。相机随 ISS 移动产生明显视差，延时视频中的移动速度不能直接当作实时流速。

![ISS 2011 南极光](https://svs.gsfc.nasa.gov/vis/a030000/a030100/a030179/iss029_aurora_20110917_print.jpg)

### 2015：Scott Kelly 拍摄的晨侧极光

[原始页面](https://www.nasa.gov/image-article/morning-aurora-from-space-station/)。用于观察倾斜视角下的宽发光区域、沿高度延伸的结构，以及下方可见的城市和云层。

![NASA ISS045-E-48728](https://www.nasa.gov/wp-content/uploads/2023/03/iss045e048728.jpg)

### 2016：空间站延时影片中的近侧幕状结构

[原始页面](https://www.nasa.gov/image-article/stunning-aurora-from-space/)。用于观察近处具有宽度的薄幕、底部较亮的弧和上方逐渐消散的细丝。页面发布日期为 2016-04-19。

![NASA 2016 轨道极光](https://www.nasa.gov/wp-content/uploads/2023/03/aurora_from_space.png)

### 2017：ISS053-E-23965，加拿大上空

[影像说明](https://science.nasa.gov/earth/earth-observatory/cruising-past-the-aurora-borealis-147984/)、[摄影记录](https://eol.jsc.nasa.gov/SearchPhotos/photo.pl?frame=23965&mission=ISS053&roll=E)。拍摄于 2017-09-15，航天器约 400 km 高。近处能看见断续且弯曲的底缘和向上延伸的透明细丝，底缘局部带粉紫色。这张图最适合约束“不是水平灯条”的目标。

![NASA ISS053-E-23965](https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/147000/147984/iss053e023965.jpg/jcr:content/renditions/cq5dam.web.1280.1280.jpeg)

### 2020：空间站下方的南极光

[原始页面](https://www.nasa.gov/image-article/aurora-australis-glows-beneath-international-space-station/)。用于对照较弱、较宽的近侧发光与远侧较集中的亮区，避免所有视角都画成高亮环。

![NASA ISS062-E-145242](https://www.nasa.gov/wp-content/uploads/2023/03/iss062e145242.jpg)

## 5. 软件中的体积近似

v0.58 使用“水平发光分布 × 连续高度剖面”，沿视线累积一段真实厚度内的发光。这样，绕到不同角度可见不同的重叠关系；局部卷曲、宽淡光与向高处展开的结构共同形成体积层次。高度、密度与流动由程序生成，NOAA 提供水平覆盖与强度。

- 发光分布先在小纹理中生成：局部旋卷、断续副弧和宽弱光。高度变化与分布相关，顶部横向展开并逐渐归零。
- 颜色使用连续高度剖面：绿色主体、较弱的高处红光、局部粉紫底缘。不同高度重叠，避免三色硬分层。
- 只积分 90–360 km 球壳的可见部分，跳过中间空区，并在地表处截断。
- 形态每 250 ms 至多更新一次；暂停跳时立即刷新，同一时间与种子重现同一结果。静止镜头复用已积分的画面。
- 4K 保留原效果。8K 限制极光分辨率与采样数，不改变地球纹理或星空分辨率。

计算组织参考 [Lawlor 与 Genetti，Interactive volume rendering aurora on the GPU（2011）](https://dspace.zcu.cz/items/0bd963cb-b034-4899-8f0c-515ccd7c92e0) 的摘要：以二维电子通量分布和高度能量沉积函数构造发光体积。本项目实现和性能数字见 [v0.58 说明](v0.58-details.md)。
