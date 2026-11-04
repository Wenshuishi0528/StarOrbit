# 中国空间站 1:200 模块化模型 / China Space Station 1:200 Modular Model — V28

作者 / Author: **wenshuishi0528**  
发布 / Published: **2026-11-04**  
来源 / Project: https://github.com/Wenshuishi0528/StarOrbit

[下载完整模型包 / Download model archive](https://github.com/Wenshuishi0528/StarOrbit/releases/tag/model-v28-20261104)

本包保存最新 V28 总装源工程及现有导出，包含天和、问天、梦天、神舟、天舟和巡天。各舱最新修改版本为天和 V23、问天 V24、梦天 V25、神舟 V26、天舟 V27、巡天 V28；V28 总装累计包含这些修改。

- `source/`：整套 Blender 工程，保留可编辑对象、材质、舱段及附件。
- `glb/station.glb`、`glb/model.json`：整套三维模型和装配元数据。
- `glb/modules/`：六个单舱 GLB。
- `print-candidates/`：现有 STL 打印候选。天和为本体；问天为本体和尾座；梦天9件、神舟4件、天舟4件、巡天5件。
- `validation/`：GLB 导出回读及巡天太阳翼取消凸筋后的验证记录。
- `manifest.json`、`SHA256SUMS-files.txt`：逐文件大小和 SHA-256 校验。

Blender 工程采用 **1单元 = 1毫米**，几何已经按1:200建模；STL导入按1:1，避免再次缩小200倍。GLB的舱体布局和运动枢轴沿用星轨模型合同。

STL目前属于数字打印候选，打印方向、支撑、配合松紧与强度仍需试打。天和、问天的其他附件保存在源工程中；本包的候选STL覆盖范围以上述清单为准。历史中间版本、开发缓存和第三方参考照片未收录。

V28 包含巡天四处内嵌斜向喷口及太阳翼中央凸筋取消；保留V27天舟、V26神舟及此前各舱精修。发布文件按本机最新源和校验记录打包，未在本次发布中改变几何。

## English

This archive preserves the latest editable V28 assembly and existing exports of Tianhe, Wentian, Mengtian, Shenzhou, Tianzhou and Xuntian/CSST. The cumulative assembly incorporates Tianhe V23, Wentian V24, Mengtian V25, Shenzhou V26, Tianzhou V27 and Xuntian V28.

Contents: the complete Blender source, assembled GLB with assembly metadata, six standalone GLBs, existing STL print candidates, validation records and per-file SHA-256 checksums. The Blender geometry is already at 1:200 scale, with one unit representing one millimetre. Import STL at 1:1.

Print-candidate coverage: Tianhe body; Wentian body and aft base; Mengtian nine parts; Shenzhou four; Tianzhou four; Xuntian five. Remaining Tianhe/Wentian accessories are in the editable source. Physical fit, support strategy and strength require print trials. This release packages the existing latest geometry without modifying it.

## 许可 / License

原创模型采用 **CC BY-NC 4.0**，署名 wenshuishi0528，非商业使用；商业授权通过 GitHub Issues 联系作者。许可全文见 `LICENSE`。

Original models: **CC BY-NC 4.0**, credit wenshuishi0528. Contact the author through GitHub Issues for commercial permission. See `LICENSE`.
