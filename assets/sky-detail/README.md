# 局部高清星空 / Local sky detail

本目录只收录实际制作的局部显示瓦片及出处，不包含原始科学数据或整套巡天镜像。既有 JPEG 保持原格式；新增 Carina 瓦片由无损压缩 TIFF 制作成 AVIF。所有图像都是历史观测，不能解释为当前时刻的实时天空。

## 内置近期目标

- **JWST 宇宙悬崖 / Cosmic Cliffs, NGC 3324**：实际曝光 **2022-06-03**，2022-07-12 发布。NASA 的 [同图数据说明](https://science.nasa.gov/asset/webb/cosmic-cliffs-in-the-carina-nebula-nircam-image/) 列明曝光日期、NIRCam 仪器及 proposal 2731。
- 来源：[ESA/Webb weic2205a](https://esawebb.org/images/weic2205a/)，[10K LZW TIFF](https://esawebb.org/media/archives/images/publicationtiff10k/weic2205a.tif)，10000 × 5791，66,222,732 bytes。原片仅作构建输入，不随应用分发。
- 署名必须完整显示：**NASA, ESA, CSA, and STScI**。[ESA/Webb 使用规则](https://esawebb.org/copyright/)：CC BY 4.0；展示与导出图片需附可见署名及对应来源链接，不表示 ESA/Webb 对软件背书。
- F090W、F187N、F200W、F335M、F444W、F470N 是近红外观测波段，本图保留官方可见颜色映射，不冒充人眼真彩或可用于测光的原始科学数据。
- 覆盖约 **7.29 × 4.22 角分**。完整 AVM 指向来自图像嵌入元数据，坐标框架 ICRS/J2000、TAN 投影，参考方向 RA 159.21261854583°、Dec −58.62001801087°。依据 AVM 的参考尺寸、参考像素、比例和旋转重投影，不使用图片中心与旋转角的人工猜测。
- 512² HEALPix NESTED 瓦片，order 6–13；order 13 的平均采样约 0.0503 角秒/像素，10K 输入约 0.0437 角秒/像素。图像越过真实源足迹的部分为透明，不伪造额外范围。`manifest.json` 逐层列出实际非空瓦片及每文件 SHA-256。
- 制作变化：StarOrbit 依天球坐标重投影、降采样、分块与 AVIF 编码。使用 Lanczos 源金字塔和双线性重采样，AVIF RGB quality 90 / 4:4:4；透明足迹独立无损编码并逐块读回核验。

## 联网巡天来源

联网瓦片仅按当前视场请求并有限缓存，不把 `unclonable` 镜像进行批量克隆，也不把其公开可浏览等同于无条件再分发。

| 来源 | 观测年代与覆盖 | 级数与格式 | 出处与署名 |
| --- | --- | --- | --- |
| Pan-STARRS DR1 i/r/g | 官方 HiPS 时间范围 2009-06-13 至 2015-02-09，约 76.39% 全天 | order 0–11，512² JPEG | [MAST/STScI 镜像元数据](https://stpubdata.s3.us-east-1.amazonaws.com/mast/skybackgrounds/PanSTARRS/properties)，PS1 Science Consortium；HiPS: CNRS/Université de Strasbourg, ODbL-1.0 |
| DSS2 Color | 较早摄影巡天，约 1975–1999，用于更广覆盖的后备 | order 0–9，512² JPEG | [MAST/STScI 镜像元数据](https://stpubdata.s3.us-east-1.amazonaws.com/mast/skybackgrounds/DSSColor/properties)，Digitized Sky Survey / STScI；按原始图像版权与使用条件 |

2026-11-06 实际连通检查：Pan-STARRS M31 方向 order 3/8/11 的 JPEG 均返回 200、512²、`Access-Control-Allow-Origin: *`，体积分别 165339、141203、24405 bytes，并检查了可见的星系和尘埃带。DSS 多个 order 9 瓦片也实际成功。新图片的发布日期、服务同步时间和本次下载时间均不代替观测日期。

未将不可稳定访问的 CDS Euclid/JWST 服务宣布为可用来源。精选 JWST 区域由上面的许可清晰且坐标完备的原片制作，在没有网络时也能显示；其它区域的联网源失败时保留已有星空。

## 复现

以下为构建工具依赖，不加入应用运行时：Python 3.9+、Pillow 11.3+（启用 AVIF）、numpy、astropy、astropy-healpix、pyavm。推荐在临时虚拟环境安装，输入与依赖留在忽略的 `output/` 中。

```sh
python3 -m venv output/sky-detail-venv
output/sky-detail-venv/bin/pip install 'Pillow>=11.3' numpy astropy astropy-healpix pyavm
curl --fail --location 'https://esawebb.org/media/archives/images/publicationtiff10k/weic2205a.tif' --output output/weic2205a-10k.tif
output/sky-detail-venv/bin/python scripts/prepare-sky-detail.py --source output/weic2205a-10k.tif
```

`manifest.json` 保存原片 SHA-256、尺寸、来源 URL、精确 AVM 数值、压缩参数和每块文件哈希，便于确认使用同一输入。转换脚本将 15 MiB 设为交付上限。JPEG/PNG 风格 HiPS 的图像 UV 是 `u = HEALPix dy`、`v = HEALPix dx`；左上是子块 0，左下是 1，右上是 2，右下是 3，纹理 `flipY=false`。AVM/FITS 纵轴向上，源图片纵轴向下，重投影时显式转换。

默认软件安装和运行不执行此脚本，也不会为 AVIF 编码另行下载库。
