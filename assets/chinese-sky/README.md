# 中国传统星官数据与出处

本文化包采用**清代通行整理**：保留中国传统星官名称，依据《仪象考成》及续编、伊世同《中西对照恒星图表1950.0》等现代考证整理。它不是汉唐原貌复原，也不表示现代恒星已经回到清代的位置。

## 内容与组织

- 固定收录 Stellarium 提交 `3c4a720f313ada6124b86fef24131fa65900133f` 的 `chinese` 目录全部 **312 条绘图记录：300 个独立星官、12 个明确附属记录**。附属记录保留自己的稳定标识及父项，不再重复计为独立星官。
- 紫微垣、太微垣、天市垣、二十八宿及近南极星区共 **32 组**。所属关系逐条取自固定来源说明的星官清单，同名记录按明确天区限定词消歧。没有按距离或最近中心猜分组。
- 全部 3,053 个 HIP 命名对象、7 个 Gaia DR3 对象、5 个 NGC 对象及 7 个太阳系对象分别保留来源名称、别名和身份。Gaia 标识始终是字符串；星团／星系不伪装成 HIP 恒星。
- 57 个单对象星官保留成员与定位，包括以星团为对象的记录；零长自连线不应画成一段可见线，但不能因此删除整个星官。
- 中文采用来源原名，英文采用来源释名；缺乏已核实俄文、法文释名的文化对象回退来源英文，避免杜撰翻译。界面语言与星空文化分别设置。

文化对象的稳定目标为 `asterism:chinese:<源末尾编号>`；物理恒星仍采用 `hip:<整数>` 或 `gaia:<字符串>`，现代星名及其别名不会被改写为另一颗星。

## 本体、增星与不确定性

来源的绘图路径会借用父项或附属星官的恒星作为连接锚，不能直接把路径中的每颗星称为本体。`schema: 2` 将以下口径分别保存：

- `sourceMemberPaths`、`sourceLineMemberHips`／`sourceLineMemberObjectIds`：固定来源的完整原路径及成员，逐项保留，供审计。
- `primaryMemberHips`／`primaryMemberObjectIds`：有来源依据的正星／本体成员，包括有明确名称归属但未连线的对象。显示中心、范围、标签、图像锚定和成员点图均取这一组。
- `displayMemberPaths`、`lines`、`lineMemberHips`／`lineMemberObjectIds`：纠正后的实际绘图路径、真实坐标及其所及成员。仅在源正名与明确父子关系同时证明是外部连接锚时剥离；遇到断点就截断，不跨过断点补新边。`lineRadius` 只描述这些连线点，`radius` 描述完整本体。
- `memberHips`／`memberObjectIds` 另收唯一可归属的增星／增补天体；`addedMemberHips`／`addedMemberObjectIds` 与本体集合互斥。同一物理星同时拥有正星名、增星别名时，按本体计一次，原名称及 `sourceAddedMemberHips`／`sourceAddedMemberObjectIds` 仍完整保留。`allMemberRadius` 是含增补对象、相对本体中心的独立外接范围。

本包有 10 处可以由同一固定索引直接核实的父子连接锚：毕宿的 HIP 21683（附耳）；井宿的 29655（钺）；轸宿的 60189（长沙）、61174（左辖）、59199（右辖）；伐的 26311（参宿二）；坟墓的 109427（危宿二）；钩钤的 78820（房宿四）；华盖的 7078（杠九）；离宫的 113881（室宿二）。`sourceConnectionCorrections` 逐项记录源名、物理标识、真正所属记录和剥离依据，附属记录本身全部保留。

十二国另有 8 颗未连线正星，源英文名明确带有 `(In Twelve States)`：HIP 103226（越）、103616（郑）、104365（齐）、104963（楚）、105665（魏）、105881（燕）、105928（韩）、106039（晋）。它们和原来已连线的 8 颗合计 16 颗，全部进入本体点图，不编造连接。`primaryUnlinkedMemberHips`／`primaryUnlinkedMemberObjectIds` 明列本体中没有连线的点。

`primaryMemberStatus` 分开保存来源表的 `expected` 数、当前可识别的 `resolved` 数、未连线数、带问号的识别及 `evidence`。`complete` 仅表示这两个来源计数相符；`source-incomplete` 表示源表多于可识别对象；`source-count-inconsistent` 表示来源自身的计数与名称／路径不一致。翼宿的源表写 22，固定索引只识别 18 颗，其中 3 颗带问号；不补造缺少的 4 颗。华盖的源表写 7，但只识别华盖二至七，原图六条边均借杠九作锚；这里保留 6 颗本体点及完整原路径，不将杠九冒充华盖一，也不造本体边。海山则是源表写 4、名称／路径实际有 5 个本体对象，按已识别对象保留并标明冲突。其他记录同样保留来源差异，不靠数字凑齐或删减。

个别增星以某一成员的专名命名，或与另一天区的专名重名。只有能从来源连线、明确限定词及源名称继承得到唯一关系时才关联；仍有歧义的名称完整保留在搜索及来源记录中，不按相邻位置强行归属。原来源中的问号继续保留。`catalog.json` 的 `stats.unassignedNamedStars` 明列这些未唯一归属项。

上游 `edges_type` 为 `none`，二十八宿的配置还带有 `Needs confirmation` 注释。因此这里没有中国星官精确边界，也不把二十八宿画成等宽扇区或现代 IAU 星座多边形。

## 坐标与可复现生成

现有应用 41,411 行星表保持不变。缺少的 HIP 4714、40205、44637、115481 另存在文化包，坐标取 ESA《Hipparcos and Tycho Catalogues》(1997)、CDS I/239 的 `_RA.icrs`／`_DE.icrs`：其字段说明明确为已经考虑自行的 J2000 历元位置，星等采用 Johnson V。另保留 HIP2 数据作独立核对。

Gaia DR3 的 7 个对象由海德堡大学 Gaia TAP 取得，Potsdam AIP 独立响应核对。已知自行的对象线性回推至 J2000；海山二（船底座η）的该条 DR3 记录没有自行，保留 ICRS J2016 实测方向及 `epoch: 2016`，不编造自行。Gaia G 星等不冒充 Johnson V，缺少 B−V 时采用中性显示色并保留缺失标记。

Gaia 7 个对象与既有星表最近的距离均大于 116 角秒，官方 `hipparcos2_best_neighbour` 也没有匹配项，因此作为独立物理星补充，未按近邻随意合并双星。NGC 坐标取应用已有、固定提交的 OpenNGC 科学数据。

在源码根目录执行：

```sh
python3 scripts/prepare-chinese-sky.py
python3 scripts/prepare-chinese-sky.py --check
node tests/sky-cultures.mjs
```

正常生成只读随包保存的来源记录，可离线重复。明确需要重新请求来源时才使用 `--refresh-source`；输出中的 SHA-256、固定提交及每个请求地址用于核对输入。来源更新必须人工重新核对，不能仅把固定提交号换成 `master`。

## 原始记录与许可

- [固定来源索引](source/index.json)、[固定来源说明、作者及参考文献](https://raw.githubusercontent.com/Stellarium/stellarium/3c4a720f313ada6124b86fef24131fa65900133f/skycultures/chinese/description.md)。上游完整说明原文同时保留在源码仓库的 `source/description.md` 供审计，其中史料配图不作为运行包插画分发；上游原地址见 `catalog.json` 的 `source.urls`。
- [Hipparcos J2000 查询原文](source/I-239-hip_main.tsv)、[HIP2 核对原文](source/I-311-hip2.tsv)。
- [Gaia DR3 主数据](source/Gaia-DR3.csv)、[AIP 独立原始响应](source/Gaia-DR3-AIP.xml)、[官方 HIP crossmatch 原始响应](source/Gaia-HIP-crossmatch.csv)。
- [文化资料 CC BY-SA 4.0 完整许可](source/CC-BY-SA-4.0.txt)。主要贡献者为 Karrie Berglund / Digitalis Education Solutions, Inc.、Sun Shuwei（孙殳玮）和 Stellarium contributors；本包调整了数据结构、分组、显示位置、名称映射和来源审计。
- 文化数据及其改编保留 CC BY-SA 4.0，与应用原创内容的 CC BY-NC 许可分别适用。OpenNGC 资料同样保留其 CC BY-SA 4.0 与作者署名；原创教学图像有自己的创作和授权记录，不能称为古籍原图。

本工作使用 ESA Gaia 任务的数据，由 Gaia Data Processing and Analysis Consortium（DPAC）处理；DPAC 经费由参与机构及 Gaia Multilateral Agreement 的相关机构提供。本工作使用 CDS（Strasbourg, France）的 VizieR 服务，服务文献为 Ochsenbein et al. (2000), A&AS 143, 23，DOI: 10.26093/cds/vizier；Gaia DR3 数据 DOI: 10.26093/cds/vizier.1355。科学事实的来源、观测历元和文化命名的历史依据分别保留。
