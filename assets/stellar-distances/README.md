# 恒星距离参考 / Stellar distance reference

准星恒星距离来自 van Leeuwen (2007), *Validation of the new Hipparcos reduction*, A&A 474, 653–664，CDS/VizieR **I/311/hip2**（Hipparcos new reduction）。

- [原始目录说明](https://cdsarc.cds.unistra.fr/viz-bin/cat/I/311)
- [论文 DOI](https://doi.org/10.1051/0004-6361:20078357)
- [VizieR 数据使用与版权说明](https://cds.unistra.fr/vizier-org/licences_vizier.html)
- [下载的原始三列 TSV](source/I-311-hip2.tsv)
- [运行时距离目录](catalog.json)

原始响应含 117,955 行，仅抽取本软件已有的 41,415 个物理 HIP 身份；要求视差、形式误差均为正，误差/视差 ≤ 0.10，保留 **19,286** 项。没有可靠视差的恒星、Gaia/Tycho 专属对象和未收录距离的深空天体显示“距离：暂无可靠数据”。不以颜色、星等、角尺寸或绘图球半径猜测距离。

运行时保存 HIP、视差及形式误差（毫角秒），使用 `1000/parallaxMas` 得到秒差距，再按每秒差距 3.2615637771674336 光年换算；显示约三位有效数字。它是按高信噪比视差得到的近似太阳系参考距离，不是距离后验分布，不随模拟年份外推，不声明已校正双星及所有系统误差。空间站和地表落点使用光学入口到实际命中位置的斜距；太阳系天体使用当前模拟时刻光学入口到模型天体中心的距离。

数据归原目录作者/ESA 所有，CDS/VizieR 为分发服务；保留作者、目录、论文、查询 URL 和源 SHA-256（见 catalog.json）。数据不重新标为本软件 CC-BY-NC 或插画许可证。原始表明确链接以上 VizieR 权利说明，但未声明特定 SPDX 许可证；本记录不擅自赋予其 CC 许可证。

离线复现：在源码仓库运行 `python3 scripts/prepare-stellar-distances.py`。脚本严格检查原表行数，并重新匹配当前物理 HIP 目录；不更改星体坐标与名称。
