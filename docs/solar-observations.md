# SDO 太阳观测数据与缓存

本模块使用 SDO 实际观测影像。模拟时间改变太阳在天空中的方向，不会生成或倒推新的黑子、日珥、耀斑。界面分别展示影像观测时间和本地获取时间；旧影像在更新失败、离线或网页导入后仍可使用。

## 四个波段

| 应用通道 | Helioviewer sourceId | 内容 |
| --- | ---: | --- |
| `hmi` | 18 | HMI continuum 强度图，观察光球和黑子；界面的“白光”是便于理解的简称 |
| `aia171` | 10 | AIA 171 Å，日冕环及日冕结构 |
| `aia304` | 13 | AIA 304 Å，色球/过渡区与日珥、暗条 |
| `aia131` | 9 | AIA 131 Å，高温活动相关结构；选中该波段不代表此时一定发生耀斑 |

AIA 使用波段对应的伪彩显示，不是肉眼自然色。HMI 黑子观测用途见 [NASA 黑子观测活动](https://science.nasa.gov/sun/track-the-solar-cycle-with-sunspots/)。AIA 304 日珥示例见 [NASA SDO first light](https://svs.gsfc.nasa.gov/10610/)；SDO/AIA 多波段与高温活动说明见 [NASA SDO 教学材料](https://ntrs.nasa.gov/api/citations/20200000290/downloads/20200000290.pdf)。

## 采用的官方接口

客户端仅向本机启动器请求固定的太阳接口。Python 服务不接受用户 URL，也不代理任意网站。

1. `getClosestImage`：用真实当前 UTC 和固定 sourceId 查找最近可用观测，取得稳定 imageId、观测日期、原图尺寸、太阳中心、半径和比例。
2. `getJP2Header`：按同一 imageId 读取 `DATE-OBS`，校验 SDO 仪器、波段、北向及中心。HMI 的 `T_OBS` 可能是 TAI，程序不把它当 UTC。
3. `takeScreenshot`：使用上一步准确图像时次、同一波段、中心 `(0,0)` 生成 1024 或 2048 方形 PNG。`watermark=false`、`events=''`、`scale=false`，不把日期或图标烧进纹理。

接口文档：[图像与几何元数据](https://api.helioviewer.org/docs/v2/api/api_groups/official_clients.html)、[JP2/FITS 头](https://api.helioviewer.org/docs/v2/api/api_groups/jpeg2000.html)、[截图参数](https://api.helioviewer.org/docs/v2/api/api_groups/screenshots.html)。官方说明截图生成会占用服务器资源，因此应用只在使用或明确更新所选波段时请求，并复用本机缓存。

`DATE-OBS` 与 `getClosestImage.date` 必须对应同一观测，不能把 HTTP `Last-Modified` 或下载时间当成观测时间。不同波段的最新可用时次可能不同，数据可能有数小时延迟。NASA 的 [SDO 数据入口](https://sdo.gsfc.nasa.gov/data/dataaccess.php) 也明确提示浏览图存在刷新节奏变化和数据中断。

## 投影元数据约定

这是太阳北极朝上的整日面平面影像，不能当作球体经纬贴图。服务只接受居中、方形、`CROTA2/HV_ROTATION/rotation` 接近零的 SDO 标准画幅。

`radiusFraction` 定义为 **日面半径 / 图像半宽**，常见值约 `0.78`；`solarCenterUV=[0.5,0.5]`。其公式为 `2 * rsun / sourceWidth`。生成图像的比例使用 `normalizedScale * sourceWidth / outputWidth`，保留来源完整画幅。Helioviewer 的 `scale` 是归一化比例；实际太阳角半径另由 `rsun * scale * scaleCorrection` 记录为 `angularRadiusArcsec`。不能把归一化比例当成真实天空角尺寸再次改变太阳大小。

观测影像含地球方向可见的太阳表面和边缘结构；它不包含背面数据。程序不会通过旋转一张照片虚构背面的黑子或日珥。

观测图统一在虚拟相机的成像步骤之后显示，保留来源的 sRGB 显示色和独立曝光补偿。它不把虚拟光圈增益再次乘进已处理的科学影像，因此无浮点渲染附件的设备也可以显示同一画质。地球、月球、近于太阳的水星/金星和航天器仍可遮挡影像。

## 跨域实测与网页版

2026-11-06 在本机用带 GitHub Pages Origin 的真实 GET，并在独立 Chrome 页面执行跨域 `fetch`：

| 来源与接口 | HTTP / CORS 实测 | 结果 |
| --- | --- | --- |
| NASA SDO `assets/img/latest/latest_1024_0171.jpg` | 200，无 `Access-Control-Allow-Origin` | 187,079 B JPEG；不直接用于网页 WebGL |
| NASA SDO `latest_1024_HMIIF.jpg` | 200，无跨域许可 | 331,074 B JPEG；文件名没有观测时间 |
| NASA SDO `hmitimes.txt` | 200，无跨域许可 | 343 B，包含 `20261106_041500`，可说明其时间与 HTTP 修改时间不同 |
| `api.helioviewer.org/v2/getClosestImage/` | 200，无跨域许可；Chrome `fetch` 失败 | 元数据可经本机固定接口取得 |
| 同站 `getJP2Header/`、`takeScreenshot/` | 200，无跨域许可 | 不能直接在 GitHub Pages 中读出影像字节 |
| ROB `api.swhv.oma.be/hv_docpage/v2/getDataSources/` | 200，`Access-Control-Allow-Origin: *`，Chrome 成功 | 但对应公开 `getClosestImage/` 路径实测 404；本版不据此承诺完整可用 |
| NOAA `json/goes/primary/xray-flares-latest.json` | 200，跨域可用 | 约 450 B，可选独立状态提示 |

本次另测 NOAA/SUVI 171 的动画 JSON 和 PNG，均允许跨域，但 SUVI 属于不同仪器，画幅和产品定义也不同，本模块没有把它静默混入四个 SDO 波段。

网页版可以导入桌面版导出的 `.json` 太阳观测快照、使用已保存影像并再次导出。网页不使用公共匿名 CORS 代理，也不把不可跨域的图片显示为“更新成功”。未来若官方允许完整的跨域 API，可在数据层更换传输方法而复用同一数据、缓存和渲染接口。

## 下载、存储和容量

- 默认 2048；可手动选择 1024。初次打开应用不下载任何波段，选用太阳观测时只按需获取当前波段。
- 同一波段的并发请求共用一个任务。成功检查后一分钟内重复点击复用结果，没有后台轮询。
- 每波段只保存最近一张可用影像；四个波段最多 4 帧、32 MiB，单张 PNG 上限 8 MiB。升级 2K 替换该波段已有 1K，而不是保留无限历史。
- 元数据请求最多 64 KiB；快照文件最多 12 MiB。输入验证版本、来源字段、编码、PNG、尺寸和可解码性。
- IndexedDB 保存 `ArrayBuffer`，避免 WebKit 持久 Blob 的 backing-file 问题。存储不可用或空间不足时保持本次会话的有效影像。
- 启动应用、创建订阅和读取界面状态不会触发太阳缓存解码；首次打开数据与资源，或使用太阳观测时才恢复本地缓存，恢复时仍逐图校验。
- 新图完成几何、字节和解码校验后才替换旧图。所选波段缺图时，不借用其它波段的图。
- 影像距真实当前时间超过六小时标为较早观测；这是应用提示阈值，不是 NASA 对科学有效期的定义。
- 实测 AIA 171：1K PNG 887,433 B，2K PNG 3,301,833 B；HMI 2K PNG 2,000,370 B。大小随太阳结构和压缩结果变化。

快照导入会标记 `origin='import'`。快照中的来源链接和观测信息可保存出处，但应用无法替第三方改写过的快照作真实性担保。

## 可选 GOES X 射线提示

成功检查太阳影像后独立读取 NOAA 小 JSON，只保留 `time_tag`、`satellite`、`current_class`。失败不影响影像。该值是带自身时间的 X 射线等级提示，不将“最近事件的最大等级”误说成当前正在发生耀斑，也不把 GOES 全日面通量定位到照片中某一块区域。[NOAA GOES X-ray Flux 说明](https://swpc-drupal.woc.noaa.gov/products/goes-x-ray-flux)

## 本地服务交付

新增 `scripts/solar_service.py`，由 `scripts/serve.py` 导入；便携包文件清单已包含它。同步运行目录后需重启本机服务，使新的 Python 接口生效；构建网页不会自动更新正在运行的旧进程。

当前桌面启动器配置的资源目录为 `中国空间站_1比200_模块化/交互预览软件`。交付时应同时更新仓库的本地构建、该目录的本地构建及 `scripts/serve.py`、`scripts/solar_service.py`；`http_download.py` 已有受限 HTTPS 下载支持，无新增大型 Python/JavaScript 依赖。

针对性检查：`node tests/solar-data.mjs`、`python3 tests/solar-service.py`、`python3 tests/solar-relay.py`。2026-11-06 另以真实官方接口完成 HMI 2K 的元数据、FITS 头、PNG 全链路下载：`imageId=193673944`，`DATE-OBS=2026-11-06T01:56:41.200Z`，`radiusFraction=0.7876930292101492`。

2026-11-06 补充实测：AIA 171、304、131 三个波段的 1K 元数据和 PNG 均下载成功，文件约 0.85–0.97 MiB。独立 GPU 检查以真实 HMI 图为基准，25／190／600 mm 光圈在 RGBA8 与 RGBA16F 下的同曝光输出一致；源图与显示日面的平均灰度仅差 0.05/255。90° 滚转与站体、月球、地球遮挡检查通过。

浏览器检查覆盖随机建议、输入草稿保留、波段切换不改构图、离开太阳时恢复普通成像，以及 390 px 窄屏。在非本机网页域名的测试环境中，更新按钮正确禁用；通过实际文件选择器导入 HMI／AIA 304 快照、从共享资源页跳转观看、导出快照与 1440 × 900 PNG 均成功。照片中的影像、伪彩、来源与两个时刻已目视核对。该检查不代表已部署 GitHub Pages。
