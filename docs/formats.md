# 数据格式与本机接口

适用版本：本地 v1.31。作者：Wenshuishi。核对日期：2026-11-08。

月面偏好 `starorbit-lunar-v1` 增加 `landings:boolean`（默认 true）和 `placeDensity:0..1`（默认 .45）；`labels` 只控制地形地名，`feature` 兼容原精选 ID、`usgs:ID` 与 `landing:ID`。着陆目录未知经纬度使用 `null`，不得按零值定位；`carriedVehicles` 表示同次部署载具，不代表现址。`layer` 接受 `natural/elevation/geology`；`geology` 规范化为 `atlas` 模式。地质图 manifest 保存原图、版式、处理和独立许可，`globe.webp` 是从主图生成的 RGBA 经纬栅格，alpha=0 表示无数据；`registration.json` 与 `outline-fit.json` 保存配准、独立控制点与边界拟合记录。共享星图设置 `chineseSymbolOpacity:0..1` 默认 .2，仅调整四象、三垣。

本页按本地 v1.31 实现维护，说明文件交换和维护所需的本机接口。格式标识独立于软件显示版本；软件升级不代表所有文件格式同时升级。[架构说明](architecture.md)解释状态归属，[使用手册](../使用说明.md)介绍界面入口。

示例中的轨道是为说明格式生成的合成数据，不能当作任何真实航天器的轨道或观测预报。没有模型文件的配置示例只通过配置校验，不构成完整航天器交付包。实际导入还会执行文件、像素、解码、任务归属和存储检查。

星图设置新增 `equatorialGrid`、`eclipticLine` 两个布尔类别，均默认 `false`。中西体系共用，场景和环境收藏沿用现有规范化／严格校验；旧数据缺字段时保持关闭，日期取模拟时钟。

月球观测偏好使用 `starorbit-lunar-v1`，仅存白名单模式、图层、地形倍率、地名开关、目标 ID 和有界口径；不保存时间、播放状态或镜头。地点沿用 `starorbit-pass-observer-v1`；月面资产见 [terrain-manifest](../assets/moon/terrain-manifest.json)，gzip 解码为小端有符号 int16，每单位 0.5 m，相对 1737.4 km 球面。

宇宙探索馆偏好使用独立键 `starorbit-cosmic-v1`，包含白名单主题、规范化参数与 0–1 进度。播放状态与相机不序列化；不改变普通场景格式，也不作为真实观测记录导入。

生日卡输入保存在当前页面会话内，生日、收礼人、赠送人、赠送日期和祝福不写入浏览器存储。正面导出PNG，纪念卡双联2400×1500、单卡1800×2400；纯星图双联2400×1392、单卡1800×1350。背面默认独立横版2400×1500，可选竖版1800×2400或与正面同尺寸；东方／西方与银河／DSS选项独立于正面。一次保存两面时输出ZIP，内部包含文件名后缀为 `-front.png` 和 `-back.png` 的两张图；ZIP采用STORE方法、UTF-8文件名和CRC32校验。文件名包含生日、组合与可选昵称。

日期范围1901–2100，UTC偏移−12至+14小时；背面未填时间时采用生日当天20:00，并保留 `timeAssumed` 状态供界面提示，交界日的西方星座仍需实际出生时间确定。星名与插画的背面开关仅属于本次卡片设置。日期规则见[来源说明](birthday-calendar-sources.md)。

## 地表与太阳系状态

浏览器键 `starorbit-world-v1` 保存 `{site, bookmarks, navigation, settings}`；地点字段为 `name`、`latitude`、`longitude`、`height`，经纬度为度、height为海拔米数，收藏最多30条。入口恢复最后地点，缺省时读取原观察者地点再回退北京。`navigation` 包括 `mode`（grounded/free）、`speed`（slow/normal/fast）、`azimuth`、`elevation`、`eyeHeight`；`settings` 包括 `culture`、`appearance`、连线／名称／插画／坐标网／黄道布尔开关、`fov:5..100` 与 `artBrightness:0..2`。恢复时按白名单和数值范围规范化。世界时间与主 `Simulation` 共用，瞬时移动速度、按键状态和太阳系相机不写入该键。此内部偏好不是场景JSON导入格式。

地表与太阳系可导出当前画面的 PNG，包含地点／天体视图与 UTC+8 时间落款。更多坐标、高程基准与几何星历字段见[计算口径](world-explorer.md)。

## 格式与交换能力总表

| 内容 | 当前标识/形式 | 界面能力与边界 |
| --- | --- | --- |
| 生日星空卡 | PNG / 正反面ZIP | 单面预览导出或一次保存两面；生日与落款仅在页面会话内保留 |
| 完整主场景 | `format: "tiangong-scene-2"`；接受旧 `tiangong-scene-1` | JSON 导出/导入；包含主场景和轨道，天气大图通常仅引用本地记录 |
| 航天器配置 | `format: "tiangong-mission-1"` | 配置 JSON + 独立 GLB + 可选轨道一起选入；不支持任意插件执行 |
| 采样轨道 | EME2000/UTC 状态向量 JSON，或单段 OEM 文本 | 导入当前任务；8–100000 条记录；地心、km/km/s |
| GP/OMM | CelesTrak 风格 JSON 对象或单元素数组 | 已配置 NORAD/国际编号的任务；SGP4；不等同于任意 TLE 文本导入 |
| 天气/资源快照 | `format: "tiangong-weather-1"` | `meta` + `base64`；云、极光、轨道分别重新校验 |
| 太阳影像快照 | `schema: "starorbit-solar-observation"`, `version: 1` | 单波段元数据 + PNG；与天气快照不互通 |
| 独立自由飞行存档 | 内部记录 `format: 1`，内含 `session.version: 1` | 浏览器本地保存/继续；当前没有用户文件导入导出入口 |
| 对接训练记录 | `schema.name: "StarOrbit docking training record"`, `schema.version: 1`，另有 CSV | 记录导出和当前会话内回放；没有文件导入恢复训练入口 |
| 观测记录/环境收藏 | 浏览器 IndexedDB/偏好结构 | 软件内恢复；不应把内部数据库 JSON 当成承诺兼容的文件格式 |

## 通用约定

- JSON 使用 UTF-8；数字必须有限，不能用 `NaN`、`Infinity` 或数字字符串替代要求数值的字段。
- 未特别说明时，时间戳为 Unix 毫秒；ISO 时间使用 UTC。GP/OEM 中省略 `Z` 的合规时间按 UTC 解析；太阳快照要求明确 `Z`。
- `MB` 为十进制字节，`MiB` 为 1024² 字节。不同导入器的大小限制不能混用。
- 软件从允许字段重建部分结构；未知字段不表示获得执行权限，也不能依赖它们往返保留。
- 文件校验通过只表示满足当前结构约束，不证明来源真实、轨道准确或观测结果正确。导入者负责核对无对象编号的通用星历归属。

## 场景 JSON

校验入口是 `src/scene-format.js` 的 `validateScene()`；文件入口在 `src/scene-share.js`，上限 **16,000,000 bytes**。当前导出 `tiangong-scene-2`，旧版 `tiangong-scene-1` 会按中国空间站迁移且必须带有效轨道。支持旧格式不代表任何新格式都会被旧软件读取。

| 字段 | 内容与约束 |
| --- | --- |
| `format` | 当前为 `tiangong-scene-2` |
| `name` / `appVersion` | 字符串；最长 60 / 30 字符。`appVersion` 是来源说明，不代替 `format` 判定兼容 |
| `mission` | 已注册任务 `id`；`pose` 的 roll/pitch/yaw 均为 −180…180°；`rotation` 为自旋/参考方式状态 |
| `assembly` | 支持装配的任务需提供组合、各实例角度和当前目标；普通卫星必须为 `null`。有效组合最多 256 实例，不能附无效端口路径 |
| `simulation` | `time` Unix ms；`speed` 为 1/10/60/300/1000；`auto` 布尔；`view` 为 `follow`/`orbit`。无太阳翼能力的任务要求 `auto:false` |
| `environment` | `quality`: simple/medium/standard/high；`exposure`: view/photo/cinematic；`cloudOpacity` 0…1、`starBrightness` 0…2；星空、月球、云和地面轨迹布尔开关及可选星图/地理/地形设置 |
| `weather` | 云模式 builtin/off/local/latest/history/satcorps；极光模式 off/local/latest/history；seed 最长 80 字符；auroraStrength 0…4；exposure 0.3…2.5；volume/motion/adaptive 布尔；两个记录引用或 `null` |
| `phenomena` | 可省略并采用默认值；提供时含 natural/enhanced 模式和 lightning/upper/airglow/meteors 布尔开关 |
| `display` | occlusion/orbitPath/sunVector/fillLight/labels/showTelemetry/showMinimap 七项布尔开关 |
| `cameras` | follow/overview 相机和 home 或 `null`；相机包含 position/target/up 三维向量、fov 10…100°、zoom 0.1…20；位置不能等于目标，up 不能为零 |
| `orbit` | 有效采样轨道或明确 `null`；恢复时绑定到 `mission.id` |

星图设置新增 `environment.skyCulture`，只接受 `western` 或 `chinese`；当前场景格式仍为 `tiangong-scene-2`。严格校验拒绝其它值；缺少字段的旧场景正规化为 `western`。它随环境偏好和收藏恢复，与界面语言、影像来源以及主画面／巡天／照片的显示总开关独立。星官导航的当前展开状态或选中项不构成新的公开文件格式。

可选高清设置中 `skyDetailSource` 为 auto/galaxy/dss/panstarrs/recent。当前兼容默认：缺省 `cloudNightVisible` 为 false；cityTerrain 为 true、cityAutoLoad 为 false、earthElevation 为 true。更完整的星图/地理字段由各设置模块正规化，不应依赖向 `environment` 任意添加键来保存私有数据。

相机向量使用各自渲染空间的坐标，follow 与 overview 的数值尺度不同；不能把它们当作通用地心位置。导入场景涉及任务和资源切换；导出前的软件状态与导入后的实时推进也可能不同。

天气引用仅含 `id/source/provider/time`，没有嵌入对应天气大图。接收端缺图时按内置云图/关闭极光等规则回退，并提示缺失；跨设备应另行导出快照和自定义模型。独立自由飞行、全部下载库、音乐库和所有观测记录不属于场景文件的完整备份范围。

有效的无轨道模型场景：[scene-dfh1-model.json](examples/scene-dfh1-model.json)。它选择内置 `dfh1`、`assembly:null`、`orbit:null`，用于核对模型查看和结构往返；不能据此计算过境。

## 航天器配置与 GLB

配置校验在 `src/mission-package.js`；导入事务在 `src/mission-library.js`。

| 字段 | 必填/默认与限制 |
| --- | --- |
| `format` | 必须 `tiangong-mission-1` |
| `id` | 2–63 位小写字母、数字、连字符，首字母为字母；不得与已注册任务重复 |
| `name` | 非空字符串，最长 120 字符；category 缺省为“卫星” |
| `planet` / `center` | 省略时规范成“地球”/`EARTH`；提供时只接受这两个值 |
| `model.file` | 独立 `.glb` 文件名，最长 160 字符，不含路径分隔符和控制字符 |
| `model.metresPerUnit` | 每源单位对应的米数，有限正数且 ≤ 1,000,000；米制为 1，毫米制为 0.001 |
| `model.forwardAxis` / `normalAxis` | 各为 ±X/±Y/±Z，必须互相垂直；分别归一到星体 +Z / +Y |
| `orbit.file` | 对应轨道文件名；`null` 或省略表示模型查看 |
| `orbit.updateSource` | `null` 或 `celestrak`；启用后必须有 `noradId` 和 `objectId` |
| `orbit.noradId` | 1…999999999 的安全整数 |
| `orbit.objectId` | 如 `1970-034A`，采用 `YYYY-NNN` 后接 1–3 位大写字母 |
| `spinRpm` | 缺省 0；0…6000 转/分；可附 http/https 的 `spinSource` 和最长 500 字符的 axes 说明 |

一次文件选择应包含一个配置及其引用文件，不能有重名。配置候选 JSON ≤ 1,000,000 bytes；GLB ≤ **128,000,000 bytes**；轨道文件 ≤ **30,000,000 bytes**。GLB 必须为版本 2，头部长度和 JSON chunk 正确；网格/纹理须内含或 data URI，不允许依赖旁边的外部文件。

导入先校验，再建立临时注册、解析轨道和提交 IndexedDB；失败清理临时注册。持久存储不可用时不提交任务库。普通导入卫星具有手动姿态能力，不自动获得空间站装配、太阳翼或可解锁飞船能力。

配置示例：[mission-demo.json](examples/mission-demo.json)。它引用 `model.glb`，示例目录没有替用户提供该模型；使用者需自行准备真实 GLB。要启用轨道，把 `orbit.file` 改成自己的轨道文件名，并同选文件。

## 状态向量轨道与 OEM

`src/orbit.js` 的 `validateOrbit()` 校验采样数据；`parseOrbit()` 读取 JSON/OEM；`parseMissionOrbit()` 再检查 GP 或绑定当前任务。

采样 JSON 的核心字段：

| 字段 | 值/单位 |
| --- | --- |
| `frame` | `EME2000` |
| `timeSystem` | `UTC` |
| `units` | 精确字符串 `km, km/s` |
| `center` | 可省略；提供时只能为 `EARTH` |
| `source` / `created` | 来源说明与生成时间；建议明确写入，场景导出等后续步骤需要可用的描述字段 |
| `rows` | 每行 `[unixMs, xKm, yKm, zKm, vxKmS, vyKmS, vzKmS]` |
| `missionId` / `objectId` / `noradId` | 可选；提供时必须与绑定任务一致，不可把其他任务轨道当成当前任务数据 |

记录数为 **8–100000**，时间严格递增，相邻间隔不超过 **600000 ms**。每行恰好 7 个有限数字；位置半径在 **6471–50000 km**，速度模长不超过 **15 km/s**，时间在 JavaScript Date 可表达范围内。这是输入防错范围，不是轨道来源认证或误差保证。

OEM 只接受一个 `META_START` 数据段，头部需含 `CENTER_NAME=EARTH`、`REF_FRAME=EME2000`、`TIME_SYSTEM=UTC`；数据行为 ISO 时刻后跟六个位置/速度数值。解析器将无 `Z` 的时刻补为 UTC，并套用同一采样检查。不支持任意中心天体、参考框架或多段 OEM 自动合并。

内插采用局部 8 点拉格朗日；区间外主场景可在有效端点椭圆条件成立时示意外推。过境预报另行限制有效时间和来源，不能以主场景仍能播放来证明预测有效。东方红一号历史分支有单独资料与模型边界。

有效合成示例：[orbit-demo.json](examples/orbit-demo.json)，含 8 条间隔 60 秒、半径 7000 km 的圆轨道采样。它没有真实卫星编号；请勿在实际观测中使用。

### GP/OMM

GP 输入是一个对象或仅含一个对象的数组，必须与当前任务配置的 NORAD 编号和国际编号匹配。字段约束如下：

| 字段组 | 约束 |
| --- | --- |
| `NORAD_CAT_ID` / `OBJECT_ID` | 与任务 `noradId/objectId` 一致 |
| `EPOCH` | ISO UTC 时间，可有小数秒，可省略末尾 Z |
| `CENTER_NAME/REF_FRAME/TIME_SYSTEM/MEAN_ELEMENT_THEORY` | 可省略；若给出必须是 EARTH/TEME/UTC/SGP4 |
| `MEAN_MOTION` / `ECCENTRICITY` | 0.1…18 圈/日；0…0.99 |
| `INCLINATION` | 0…180° |
| `RA_OF_ASC_NODE/ARG_OF_PERICENTER/MEAN_ANOMALY` | 各 0…360° |
| `BSTAR/MEAN_MOTION_DOT/MEAN_MOTION_DDOT` | 各 −1…1，均需提供可解析的有限值 |

应用用 satellite.js 传播历元前后各三天，每 60 秒采样并转换为 EME2000。三天是当前显示策略，不是三天内真实误差保证。需要 TLE 时应先取得/生成受支持的 GP/OMM JSON，不能把两行文本改扩展名冒充 JSON。

## 天气与资源快照

`Weather.exportRecord()` 生成：

```json
{
  "format": "tiangong-weather-1",
  "meta": { "kind": "orbit", "missionId": "dfh1" },
  "base64": "原始数据文件字节的标准 Base64"
}
```

以上仅展示包络，Base64 占位文字不是有效样例。完整可校验示例是 [weather-orbit-demo.json](examples/weather-orbit-demo.json)，其中载荷与合成轨道示例相同。

文件上限 **96 MiB**；kind 为 cloud/cloud-preview/aurora/orbit。导入时重新解码和校验，meta 内声称的“已验证”不可信：

| kind | 解码载荷与主要校验 |
| --- | --- |
| `orbit` | JSON 状态向量轨道；绑定当前任务，快照 meta.missionId 提供时也须一致 |
| `aurora` | NOAA 风格 JSON：`Forecast Time`、`Observation Time` 可解析；1000–70000 个 `[lon,lat,intensity]`，经度 −180…360、纬度 −90…90、强度 0…100 |
| `cloud` / `cloud-preview` | PNG/JPEG 字节；重新检查像素、解码、有效覆盖与图源质量，保留允许的来源/覆盖/通道/许可元数据。图片文件校验上限 64 MiB，不能用一张普通照片冒充合格全球云图 |

云图灰度、透明度通道和覆盖范围会影响验收与渲染，手工构造一段有 PNG 签名的字节并不能通过真实导入。请使用软件导出的快照交换，保留元数据。导入记录被收藏，并按类型应用；轨道更新必须作用于捕获的任务。处于场景恢复或任务切换时拒绝导入。

## 太阳观测快照

`SolarObservations.exportSnapshot()` 与 `importSnapshot()` 在 `src/solar-data.js`。包络：

```text
schema: "starorbit-solar-observation"
version: 1
metadata: 单波段来源、观测时间与图像几何
image: { mime: "image/png", base64: PNG 字节的标准 Base64 }
```

| metadata 字段 | 必要约束 |
| --- | --- |
| `channel` | hmi/aia171/aia304/aia131 |
| `width/height` | 均为 1024 或均为 2048 |
| `imageId` / `id` | imageId 为 1–12 位数字字符串；id 为 `sdo:<channel>:<imageId>:<width>` |
| `provider` | `SDO / Helioviewer` |
| `sourceUrl` | `https://api.helioviewer.org/v2/takeScreenshot/`，不含用户凭据，最长 2000 字符 |
| `observedAt` / `fetchedAt` | 2010–2100 年范围的合法 UTC ISO 时间，要求 Z；前者表示真实影像时刻，后者表示取得时刻 |
| `radiusFraction` | 0.5…0.98 |
| `solarCenterUV` / `solarNorthUp` | UV 坐标各 0.499…0.501，导入规范化成 [0.5,0.5]；northUp 必须 true |
| 可选角尺度 | imageScaleArcsec 0.1…5；angularRadiusArcsec 850…1050；不合法可选值不会成为有效几何 |

快照文件上限 **12 MiB**，PNG 上限 **8 MiB**。检查签名、IHDR 尺寸与元数据一致，并通过浏览器实际解码；不接受仅把 JPEG 标成 PNG。当前波段正在更新或对象已关闭时拒绝覆盖。网页可导入快照，但直接更新 SDO 需要本机服务。

此格式依赖真实 PNG，文档不提供伪造小图充当太阳观测。有效例子应由软件对已有记录点击“导出太阳快照”生成；来源、波段、几何与观察时刻要原样保留。导出前缺少记录会明确失败。

## 独立自由飞行与训练记录

### 自由飞行本地存档

`src/free-flight-store.js` 使用 localStorage 键 `starorbit-free-flight-v1:<id>`，写入时增加 `savedAt`。格式是内部恢复契约，当前界面没有 JSON 文件上传/下载功能；普通主场景 JSON 不能替代它。

| 字段 | 内容 |
| --- | --- |
| `format/id/savedAt` | 外层格式 1、飞行 ID、保存 Unix ms |
| `seed` | 开始时的 `t`、惯性 position km、velocity km/s |
| `assembly` | 当时组合槽位和实际翼角；用于重建可飞船定义 |
| `session` | `version:1`、epoch ms、meanMotion rad/s、elapsed s、definitions、ships、dockingLimits |
| `selectedId/display/view/cameraTarget` | 当前驾驶对象、显示偏好及镜头 |
| `checkpoint` | 可恢复的 session 和 selectedId，或空 |

`restoreFreeFlight()` 校验 epoch/时间、定义与飞船兼容、状态 docked/departing/free/collision、位置/速度/单位四元数、RCS/SAS、接触阈值和检查点。近站 position 为 m、velocity 为 m/s、angularVelocity 为 rad/s；RCS 界面参数中的 angularAcceleration/maxAngularRate 则用度。外层 `seed` 与内部 session 的参考历元/平均运动必须一致。

早期单一角阻尼偏好会迁移到飞船 SAS 偏好；不等于所有未来存档版本都可读取。保存失败时可有当前会话内副本，不能保证刷新后恢复。完整迁移需要保留原浏览器数据，勿手工改 key 或覆盖未知结构。

### 对接训练 JSON/CSV

`DockingRecorder.exportJSON()` 输出 `schema/scenario/sampling/summary/samples/events`。schema 携带 name、version、modelVersion、model、frames、units、conventions；读取结果时应先保留这些说明，再解释数值。

记录默认每 **0.2 s** 采样，最多 **7200** 样本、**2000** 事件；有界环形缓冲可能丢弃更早记录，summary 记录 droppedSamples/droppedEvents。内部构造器可配置容量，不应将默认采样间隔当作每帧动力学步长。

位置/速度使用 RTN 的 m、m/s；四元数 `[x,y,z,w]`；姿态角为度、角速度 rad/s；轴向接近速度是 `−vT`，与全距离变化率分开。schema 解释的限速统计与严格接触判定也不同。

CSV 以 `# format`、模型、场景、坐标、单位和摘要元数据行开头，再有字段表头；不能只按固定列号读入而丢失单位。文本采用转义与公式防护。会话内回放使用冻结副本，退出回放返回实时训练状态；当前没有 JSON/CSV 文件导入恢复训练的入口。

## 本机 HTTP 接口

这是应用与本机服务之间的实现接口，不是公共云服务 API。默认 `http://127.0.0.1:8771`，只绑定回环地址。维护时以 `scripts/serve.py` 及对应服务的验证逻辑为准；`file://` 或纯静态网页版不能因存在同名路由说明就获得本机处理能力。

| 方法与路径 | 输入 | 返回/作用 |
| --- | --- | --- |
| GET `/api/status` | 无 | `{"app":"tiangong-earth-viewer"}`；仅识别应用，不证明运行版本 |
| GET `/api/orbit` | 无 | 固定中国载人航天官方来源正文；客户端再解析 |
| GET `/api/orbit/dfh1` | 可选 `norad` | 默认编号 4382 的 GP JSON |
| GET `/api/orbit/gp` | 必须 `norad`，1…999999999 数字 | 固定 CelesTrak GP JSON；不是任意 URL 代理 |
| GET `/api/cloud/versions` | `month`；可选 `date`、`force=1` | 官方目录及已保存/已检查状态 |
| GET `/api/cloud/library` | 无 | `items` 本机云图库元数据 |
| GET `/api/cloud/library/image` | `name`、`sha256`；可选 `preview=1` | 已保存且通过标识检查的 PNG |
| GET `/api/cloud/gmgsi/latest`、`/api/cloud/himawari/latest` | 无 | 对应来源最新可用时次元数据 |
| GET `/api/cloud/history/query` | `date`、`hour` | 历史可用时次 |
| POST `/api/cloud/history/download` | 查询参数 date/hour，可选 provider/requestId/revision | 启动已支持来源下载任务；参数由服务逐项验证 |
| GET `/api/cloud/history/status` | 无 | 当前端口任务状态 |
| GET `/api/cloud/history/image` | `id`、`sha256` | 完成任务的 PNG |
| POST `/api/cloud/history/cancel` | 查询参数 `id` | `cancelled` 布尔 |
| GET `/api/cloud/satcorps/status`、`/api/cloud/satcorps/image` | image 可带 sha256 | 旧流程兼容状态和已保存 PNG |
| POST `/api/cloud/satcorps/update` | 无 | 返回错误状态和不可重试说明，引导到版本列表；不应再调用它做逐日回查 |
| POST `/api/cloud/legacy-cancel`、`/api/cloud/satcorps/clear` | 无 | 旧任务取消或清理；运行下载时清理可能拒绝 |
| GET `/api/solar/metadata` | `channel`；`resolution=1024/2048`，默认 2048 | 太阳几何/来源元数据及取图 token |
| GET `/api/solar/image` | 仅一个 `token` | 固定服务生成的 PNG；不接受自选上游 URL |
| POST `/api/balcony/orientation` | 同源请求头 `X-StarOrbit-Motion: 1` | 用户主动开启的 NDJSON 方向流；关闭连接结束流 |

日期格式由云图服务验证，通常为 `YYYY-MM-DD`，时次/来源还需满足各图源的规则；不是所有来源都支持所有月份。调用端应显示来源、观测时刻和结果状态，不能把“目录查询成功”显示成“画面已更新”。

错误可能是 JSON `error` 字符串、结构化 `{code,message,retryable}`，或 HTTP HTML 错误页。客户端必须同时看 HTTP 状态和内容：400 参数无效，403 来源/请求头不符，404 无接口或没有匹配资源，409 任务冲突，502 上游失败，503 可选依赖缺失。POST 和云图路由限制 Origin；太阳路由还限制 Host/Sec-Fetch-Site，设备流要求显式同源请求头。不要以构造外部页面或关闭这些检查来调用本机接口。

## 示例检查与源码依据

在源码根目录执行 `npm run test:docs`，检查示例和文档约定。以下为可独立复核的最小结构校验，不运行浏览器或产生构建：

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';
import { validateMissionPackage } from './src/mission-package.js';
import { validateOrbit } from './src/orbit.js';
import { bindOrbit } from './src/missions.js';
import { validateScene } from './src/scene-format.js';
const read = name => JSON.parse(fs.readFileSync('docs/examples/' + name, 'utf8'));
validateMissionPackage(read('mission-demo.json'));
validateOrbit(read('orbit-demo.json'));
validateScene(read('scene-dfh1-model.json'));
const snapshot = read('weather-orbit-demo.json');
if (snapshot.format !== 'tiangong-weather-1' || snapshot.meta.kind !== 'orbit') throw Error('包络无效');
bindOrbit(validateOrbit(JSON.parse(Buffer.from(snapshot.base64, 'base64').toString('utf8'))), snapshot.meta.missionId);
console.log('示例结构校验完成；不代表完整浏览器导入验收');
JS
```

维护者需在修改验证器、默认值、schema 或兼容规则后同步更新本页和例子，再按[验证指南](verification.md)执行实际文件往返。固定公开实现参考：[场景验证器](https://github.com/Wenshuishi0528/StarOrbit/blob/5ed3d96b52db26f5e9500430eec3a67a32d14f35/src/scene-format.js)、[航天器验证器](https://github.com/Wenshuishi0528/StarOrbit/blob/5ed3d96b52db26f5e9500430eec3a67a32d14f35/src/mission-package.js)、[轨道解析](https://github.com/Wenshuishi0528/StarOrbit/blob/5ed3d96b52db26f5e9500430eec3a67a32d14f35/src/orbit.js)、[天气导入](https://github.com/Wenshuishi0528/StarOrbit/blob/5ed3d96b52db26f5e9500430eec3a67a32d14f35/src/weather.js)、[太阳快照](https://github.com/Wenshuishi0528/StarOrbit/blob/5ed3d96b52db26f5e9500430eec3a67a32d14f35/src/solar-data.js)、[本机路由](https://github.com/Wenshuishi0528/StarOrbit/blob/5ed3d96b52db26f5e9500430eec3a67a32d14f35/scripts/serve.py)。
