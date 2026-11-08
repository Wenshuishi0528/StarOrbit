# Lunar place catalogue / 月面地名与着陆地点目录

Snapshot / 核验日期：**2026-11-08**。

## 完整地名

`gazetteer.json` 是 [IAU/USGS Gazetteer 的 Moon 全量查询](https://planetarynames.wr.usgs.gov/SearchResults?Target=16_Moon)的离线紧凑快照。查询页面虽有分页控件，服务端 HTML 包含全部 9,202 行。本目录仅保留 **9,087 条 Approved 正式命名**，包括 **7,064 条 SF（Satellite Feature，字母附属地名，如 Tycho A）**及 **2,023 条其他正式地名**；不包含 70 条 Dropped 和 45 条 Not Approved。它不是精选列表，18 类已批准命名地形全部保留。

原始 UTF-8 CSV 压缩快照保存在 `gazetteer-source.csv.gz`，包含原表全部行及全部字段；`gazetteer-source.json` 记录取得时间、原始 HTML 与 CSV 的 SHA-256。原名、特征 ID、中心经纬度、尺寸及特征类型码均来自官方表。运行时数组列顺序写在 `gazetteer.json.meta.columns`。

经度东正、范围 −180°…180°，纬度北正。USGS 对月球采用球体定义，球体上的 planetographic/planetocentric 纬度一致，见[官方坐标说明](https://planetarynames.wr.usgs.gov/Page/Website)。保留源数据小数精度，不另造精度。直径仅为目录尺寸，不代表圆形边界。只对原有 16 个精选地名补充四语通行名，其他专名保持 IAU 原拼写，不批量机器翻译为虚构中文地名。

## 着陆任务

`landings.json` 包含 **40 次尝试软着陆且抵达月面的任务**：24 次正常软着陆、4 次异常软着陆（Luna 23、SLIM、IM-1、IM-2）、12 次失败接触/撞击。共有 **39 个可标绘位置**；Surveyor 4 最终位置未知，保留目录条目但不在计划目标区画假落点。`soft-partial` 描述着陆姿态或硬件异常，不是对整个任务科学成果的评级；SLIM 的精准着陆验证获得成功。

范围涵盖苏联全部 8 次存活着陆、美国 5 次 Surveyor 和 6 次 Apollo、嫦娥三/四/五/六号、Chandrayaan-3、SLIM、IM-1、Blue Ghost 1、IM-2，以及月面接触的失败软着陆任务。排除 Ranger/Luna 2 等有意撞击探测、轨道器退役撞击、火箭级、Apollo 上升级撞击、发射/巡航阶段失败及尚未着陆的计划。Peregrine 未抵达月面，不伪造月面坐标。

基础坐标来自 [NASA NSSDCA 人工物体位置表](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html)，该表标注最后更新 2025-08-13，并收录 2025-06-05 HAKUTO-R Mission 2 失败接触。其完整原页压缩快照为 `landing-source.html.gz`，摘要校验在输出 JSON 中。标为 `lro-imaged` 的地点来自 LROC 定位；`approximate` 为近似/历史估计，`unknown` 不标绘。NASA 坐标采用 DE421 mean-Earth/polar-axis 框架，原始 0…360° 东经只做等价范围归一化。

**重要差异：** Luna 9 的历史公布位置未被 LRO 确认，真实位置可能偏离至少 10 km；Luna 5、15 有彼此差别很大的文献估计；Luna 18 为未确认候选位置。每条均带 `note`，不能显示成精确定位。Surveyor 2 的 NASA 任务页关键日期给出 9 月 23 日、人工物体表给出 9 月 22 日，采用任务页并保留差异说明。所有 `date` 使用 UTC：SLIM 为 2024-01-19，嫦娥六号为 2024-06-01，与日本/中国本地日期不同。

`carriedVehicles` 表示共同着陆/部署任务（如玉兔、玉兔二号、Lunokhod、Pragyan、LEV），并非巡视器当前或最终位置。一个着陆点不拆成多个看似不同的精确落点。目录精度不等同于当前底图、地形和姿态模型的导航精度；这套标注不用于米级导航。

### 任务状态交叉核实

- 中国：[嫦娥三号 CNSA](https://www.cnsa.gov.cn/n6758968/n6758972/c6798565/content.html)、[嫦娥四号 CNSA](https://www.cnsa.gov.cn/n6758823/n6758844/n6760026/n6760027/c6805178/content.html)、[嫦娥五号 CNSA](https://www.cnsa.gov.cn/n6759533/c6810683/content.html)、[嫦娥六号 CNSA](https://www.cnsa.gov.cn/n6758823/n6758844/n10518102/n10518147/c10565180/content.html)。统一保留 NSSDCA/LROC 底图框架中的坐标；不把不同控制网的末位数字拼接或平均。
- 印度：[ISRO Chandrayaan-3](https://www.isro.gov.in/Chandrayaan3.html)。预选 landing site 参数不是实际落点，标注使用 LROC 的实际位置。
- 日本：[JAXA SLIM 2024-01-25 结果](https://www.jaxa.jp/press/2024/01/20240125-1_j.html)。保留成功验证精准着陆与末态异常两项事实。
- 商业任务：[Firefly Blue Ghost 1](https://fireflyspace.com/missions/blue-ghost-mission-1/)、[Intuitive Machines IM-2](https://www.intuitivemachines.com/im-2)、[NASA IM-2 结束报告](https://www.nasa.gov/news-release/nasa-receives-some-data-before-intuitive-machines-ends-lunar-mission/)。IM-1/IM-2 不混同正常竖立着陆。

### 2026 更新边界

核验当天以下一手来源仍将相关任务列为未来计划，**不纳入已着陆标记**：

- [NASA IM-3](https://www.nasa.gov/event/clps-flight-intuitive-machines-im-3/)：Early 2027。
- [Blue Origin MK1](https://www.blueorigin.com/blue-moon/mark-1)：Upcoming Missions。
- [JPL Griffin-1，2026-10-12](https://www.jpl.nasa.gov/images/pia26708-voyager-technologies-griffin-1-completes-environmental-testing-at-nasa-jpl/)：完成环境试验，发射仍属计划。
- [CNSA，2026-09-20](https://www.cnsa.gov.cn/n6758968/n6758973/c10774483/content.html)：嫦娥七号等待下一窗口。
- [Firefly Blue Ghost 2](https://fireflyspace.com/missions/blue-ghost-mission-2/)：未来月背任务。

这些记录是 2026-11-08 的核验边界，不是自动更新的任务追踪服务。

## Rebuild / 更新与重建

在项目根目录运行：

```sh
python3 scripts/prepare-lunar-places.py
node tests/lunar-places.mjs
```

默认完全离线，以压缩源快照和人工审核的 `landing-inventory.json` 重建。抓取官方最新地名使用 `--refresh`；更新 NASA 落点源表使用 `--refresh-landings`。新增着陆任务需审核一手着陆确认、实际位置、UTC 日期、任务类型并加入 inventory，更新 `reviewedAt`，然后检查输出数量与说明。程序不把源表所有 `Impact` 自动归为着陆，也不会仅因计划发射日期已过而添加落点。

USGS/NASA 数据及页面保留其原始归属；本目录仅整理事实数据。软件自己的许可不替代来源页面的标识或许可。
