# 宇宙探索馆：科学内容与模型 / Cosmic explorer: science and models

本模块把五类主题组织为独立教学演示：超新星、中子星、脉冲星、流星、黑洞。它不在真实星空中插入虚构天体，不把画面颜色当成真实波段或照片，也不随主场景日期预报爆发或流星雨。

These five interactive subjects are educational models. They do not add fictitious objects to the observing sky or predict events from the main simulation date. Procedural colours are not measured spectral bands or photographs.

## 主题与观测联系

| 主题 | 科学口径 | 连接的既有目标 |
| --- | --- | --- |
| 超新星 | 爆发事件与扩张遗迹分开；演示核心坍缩支路，另说明 Ia 型白矮星热核支路 | M1 蟹状星云、NGC 6960 西面纱星云，均为遗迹 |
| 中子星 | 致密恒星遗骸；质量与半径决定平均密度，不把均匀球当成内部物态方程 | M1 所属天区；不把中心中子星当成可分辨圆面 |
| 脉冲星 | 以旋转磁化中子星、双辐射束扫过观察者为教学例子；曲线来自几何，不是接收数据 | M1 所属天区；不把目录星云中心冒充精确脉冲星身份 |
| 流星 | 流星体是物体、流星是大气发光现象、陨石是落地残余；辐射点属于透视方向 | 无固定深空目标；不伪造恒星间“流星带” |
| 黑洞 | 视界、影子、外部发光物质分开；弯曲的盘像不代表第二个实体盘 | M87 与 NGC 5128 宿主星系；不是视界图像 |

巡天入口复用 `deep-sky:m1`、`deep-sky:ngc6960`、`deep-sky:m87`、`deep-sky:ngc5128`，不新增或改写目录坐标。实际影像覆盖、地球遮挡、星图语言与体系继续使用已有观测管线。M87 的超大质量黑洞只是实际天区示例，和面板中 3–100 太阳质量的不旋转黑洞参数演示不是同一个对象。

## 数学定义与限制

- 常量：IAU 2015 标称太阳引力参数 `GM☉ = 1.3271244 × 10²⁰ m³ s⁻²`，光速 `c = 299792458 m s⁻¹`，引力常数近似 `G = 6.6743 × 10⁻¹¹ m³ kg⁻¹ s⁻²`。质量换算使用标称 `GM☉/G`，并非太阳质量的无限精确测量。
- 黑洞：不旋转、无电荷情形的 Schwarzschild 视界半径 `r_s = 2GM/c²`；每标称太阳质量约 2.95325 km。显示的盘面、亮度不对称与弯曲光路属于视觉解释，不求解广义相对论光线传播、吸积磁流体或辐射转移。
- 中子星：平均密度 `ρ̄ = 3M/(4πR³)`，紧致度 `2GM/(Rc²)`，牛顿近似表面引力 `g_N = GM/R²`。1–2.2 太阳质量、10–14 km 半径可独立调整，是探索范围，不保证每组值对应某种物态方程下的稳定星。
- 脉冲星：磁轴倾角 `α`、观察倾角 `ζ` 与转动相位 `φ` 决定 `cos γ = cos α cos ζ + sin α sin ζ cos φ`。双极束使用夹角绝对余弦，信号是角宽 10° 的平滑高斯包络；它未拟合真实脉冲轮廓、星际传播或相对论光弯曲。动画慢放与显示的物理周期分开。
- 超新星：前身星、核心坍缩、外层抛射、遗迹四个阶段按教学需要分段。阶段间时间、半径、粒子尺度与亮度均为视觉映射，不代表一个真实超新星的光变曲线，不假定所有爆发都留下中子星。
- 流星：在当地平面中，用速度 `v` 与相对水平面的角度 `θ` 演示从 120 km 到 40 km 的直线路径；模型路径 `L = 80/sin θ km`，几何经过时间 `L/v`。速度和角度范围分别为 11–72 km/s、10–80°，是常见入射条件的教学示例，非所有流星的严格上下界。亮度采用 `sin(πp)^1.5` 包络。没有空气阻力减速、质量烧蚀、破碎或流星雨母体轨道计算；路径时间不是实际流星持续时间预报。

## 一手科学与常数依据

资料核对日期：2026-11-08。界面文案为原创概述，以下外部来源供用户继续阅读；离线运行不请求这些网页。

- [NASA / Hubble：恒星爆发](https://science.nasa.gov/mission/hubble/science/science-behind-the-discoveries/hubble-stellar-explosions/)：核心坍缩与 Ia 型支路。
- [Chandra：超新星与遗迹](https://chandra.si.edu/xray_sources/supernovas.html)：事件、抛射物、遗迹与致密残骸。
- [NASA / Hubble：M1 蟹状星云](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-1/)：1054 年记录、遗迹与中心脉冲星。
- [NASA：恒星种类](https://science.nasa.gov/universe/stars/types/) 与 [MPIfR：中子星](https://www.mpifr-bonn.mpg.de/research/fundamental/neutronstars)：致密残骸与典型尺度。
- [NASA / Hubble：脉冲星](https://science.nasa.gov/mission/hubble/science/science-behind-the-discoveries/hubble-pulsars/) 与 [NASA / HEASARC：脉冲星导论](https://heasarc.gsfc.nasa.gov/docs/objects/pulsars/pulsarstext.html)：灯塔几何与多波段观测。
- [NASA：流星与陨石](https://science.nasa.gov/solar-system/meteors-meteorites/facts/)、[NASA：流星常见问题](https://www.nasa.gov/blogs/watch-the-skies/2026/03/26/its-fireball-season-answering-your-meteor-questions/) 与 [NASA / JPL：小天体定义](https://www.jpl.nasa.gov/asteroid-watch/fast-facts/)：术语、共同来源与大气现象。
- [Swinburne COSMOS：辐射点](https://astronomy.swin.edu.au/cosmos/R/Radiant)：近似平行轨迹的透视关系。
- [NASA：黑洞结构](https://science.nasa.gov/universe/black-holes/anatomy/)：视界、盘面、影子与光弯曲。
- [NASA / Hubble：M87](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-87/) 与 [NASA：半人马座 A](https://science.nasa.gov/photojournal/ngc-5128-centaurus-a/)：真实宿主星系联系。
- [IAU 2015 Resolution B3：标称换算常量](https://www.iau.org/common/Uploaded%20files/IAUGA2015-Resolution-B3-recommended-nominal-conversion.pdf)：太阳标称引力参数。

本模块没有下载或重新分发上述机构的照片、影片、徽标或网页正文。程序生成画面及原创讲解遵循项目原有原创内容许可；已有天体目录、影像和星官插画继续保留各自来源与许可。
