# 云图来源 / Cloud sources

- **github最新已下载**：保留原 Live Cloud Maps 8192×4096 PNG/JPEG 和历史快照，上游极区镜像补齐方式不变。
- **NASA 全球云图 · 含极区**：从 SatCORPS GCC GEO+LEO V2A 最近 30 天的每日 12:00 UTC 合成图中，由新到旧寻找通过全球、北极和南极覆盖核验的一张。原生 12960×6480（约 3 km），输出无损 8192×4096 标量 PNG。

## 更新规则

每次点击「下载当前云图源」或在 NASA 模式下统一更新，都会重新计算最近 30 天的候选日期。先检查云相位覆盖，再检查光学厚度和逐像素观测时间；遇到缺测或不可访问的候选继续向前查找，不固定下载某一天，也不根据下载日期判断新旧。每日 12:00 UTC 是本模式的取样时次，不宣称找到所有逐小时产品中最新的一张。

不合格候选的检查结果保留 6 小时，避免重复下载；之后重新核验，允许上游补齐。若没有更新的合格数据，保留已有合格云图并显示检查结果和实际观测时间。未找到新图不会切换到极区缺失的产品。首次没有合格缓存则继续显示原有内置云图。2024-06-30 的旧 NASA 派生图已退出选项，浏览器打开新版时定向删除该日期缓存（含收藏）；GitHub 数据不受影响。

## 下载与缓存

使用桌面启动器开启本地服务。Python 需要 `numpy`、`Pillow`、`h5py`；其他电脑可执行 `python3 -m pip install -r scripts/cloud-requirements.txt`。

独立进程通过 HTTP Range 读取 cloud_phase、cloud_optical_depth、relative_time、lat、lon 的压缩块，最多两个下载并行，不下载约 1.3 GB 的完整 NetCDF。每个候选完整字段下载上限 220 MB；临时稀疏文件随处理结束删除，检查不在渲染线程执行。候选之间检查 16 分钟工作预算，未完成时保留缓存。服务保留当前派生 PNG、元数据及很小的检查索引；浏览器保存历史快照。统一清理云图同时清除服务派生缓存与索引。播放期间只使用纹理。

## 覆盖与显示

全球及两极观测足迹至少 99.5%，全球有效反演至少 99.5%、各极区至少 99%。极区定义为南北纬 67.5°以外。覆盖完整指通过这些质量门槛，不代表每个像素均有有效反演。无效像素透明显示，不镜像、不以随机云补齐；有效比例在面板显示。

云相位区分晴空冰雪与云层。透明度由云光学厚度采用 τ/(τ+7.7) 显示映射计算，是科学反演的可视化。观测范围取 reference_time 加逐像素 relative_time；不混拼其他日期。8K、4K 等档位继续使用原来的纹理降档和释放机制。

## GitHub 灰度显示

从 v0.21 起，对 GitHub 下载图及历史快照的增强灰度做连续透明度校正，减少弱灰背景对海洋的覆盖。此图源混合红外、沙尘及可见光显示信号，灰度不等同云量或光学厚度；修正不能恢复严格的晴空分类。原始缓存保留，NASA 数据不应用此映射。[处理依据与验证](v0.21-details.md)。

从 v0.23 起，体积云修正分支内纹理取样及低密度硬截断。GitHub 原始 Alpha 中的连块与阶梯缺口仍属于上游合成限制，不能由显示校正可靠恢复。[诊断与修正范围](v0.23-details.md)。

从 v0.24 起，对 GitHub 全图及历史快照的高反差遮罩碎片做局部连续重建；这是显示处理，不能修复大尺度分类错误。[方法与限制](v0.24-details.md)。

## Sources

- NASA 产品说明：https://www-pm.larc.nasa.gov/new/products/global-cloud-composite/index.html
- V2A 数据目录：https://satcorps.larc.nasa.gov/prod/GCC-GEO-LEO/visst-pixel-netcdf_v2a/
- The images were obtained from the NASA Langley Cloud and Radiation Research Group, https://satcorps.larc.nasa.gov
- 原图源：https://github.com/matteason/live-cloud-maps

**English:** Each refresh searches daily 12:00 UTC GCC V2A composites in a rolling 30-day window, newest first. Phase coverage is screened before downloading and validating optical-depth retrievals and pixel observation times. Failed candidates are cached for six hours and then rechecked. The previous qualified map is retained when no replacement is available. The retired June 2024 NASA record is removed without touching GitHub snapshots. Native 12960×6480 retrievals become lossless 8192×4096 textures; polar gaps are never mirrored or filled with random clouds. This daily search is not an exhaustive search of hourly products. Actual conversion metadata and hashes are recorded in `cloud-source-validation.json`.

## 本次实测

2026-10-23 执行更新：自动跳过 10 月 22 日与 21 日候选，选中 **2026-10-20 12:00 UTC** 的 V2A。全球足迹 99.9962%，北极 99.9999%，南极 99.9930%；有效反演分别为 99.8594%、99.9999%、99.9781%。本次实际选中日期由筛选产生，代码未固定这个日期。
