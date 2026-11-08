# 中国星空教学意象 / Chinese sky teaching art

作者与制备：Wenshuishi / StarOrbit。现有 **319 幅** OpenAI 图像生成辅助制作的图像：**312 幅星官插画**覆盖当前全部目录记录，另有 **7 幅总览插画**，即青龙、白虎、朱雀、玄武及紫微垣、太微垣、天市垣。v1.25 保留此前 39 幅图像，按同一淡金线描风格补充 280 幅。它们是现代教学创作，不是古籍原图，不定义星官边界，也不表示恒星的物理外形。

「星官插画」控制具体星官图像；「总览插画 · 四象、三垣」独立控制，默认关闭，两者可同时开启。总览在常用视角及窄视场均可显示，同一视图允许重叠；其独立透明度默认 20%，范围 0–100%，只影响七幅总览。星官插画保留自身的视场淡出规则，按视野及固定缓存预算逐步加载。主画面、巡天与照片共用类别设置，显示总开关各自独立。

完整目录采用清代整理体系，包含近南极增补区及附属星官。新增图意依据固定版本名称和英译，并注明现代设计选择；不声称它们全是同一朝代流传的古画。名为「日」「月」的固定星官只用日月意象解释名称，不指向真实太阳、月球。所有新图都检查实际透明度在暗色星空上的合成结果；细线、物象数量与人体部位不代表恒星数量。

原始 PNG 保留在源码目录。现行制备按 [rigid-placements.json](rigid-placements.json) 中的中心、主轴及角尺度调整整幅图像的天区位置和朝向，保持原画比例与轮廓，不以局部拉扯追求每颗星与画中部位重合。目录星位与来源连线保持原有数据；局部图案与星点允许存在差异。绘画部位及图意中的现代布局选择，不作为古代唯一的解剖对应。

原八幅以外的 311 幅使用原图 RGB 与透明度呈现，保留暗线、亮部及细节；原有八幅保持统一淡金色线稿的呈现方式。制备只进行等比缩放与压缩，不改动源 PNG。

天狼及其它单星星官只有真实单星作位置参考，朝向和大小属于明示的现代布局参数；新单星或极小星官采用最低 3° 展示尺度。多星星官按已识别主成员的中心和分布摆放整幅图像，图案保持等比，不虚构未识别成员。虚拟导引不属于真实恒星。四象跨越多宿，以所属天区和整体方向表达关系，不能据动物的眼、爪或羽毛反推具体星名。星官图意、图像许可和星官数据来源分别记录。

这些图像按星轨原创内容的 [CC BY-NC 4.0](../../../LICENSE) 分发；中国星官数据独立适用 [CC BY-SA 4.0](../source/CC-BY-SA-4.0.txt)，分别保留署名与条款。

制备命令：`python3 scripts/prepare-chinese-art.py`。运行使用压缩图及天球贴图网格；网格用于呈现天球投影，不代表局部变形或逐星精确对位。实际提示词、原图制备记录与现行摆放方法见 [provenance.json](provenance.json)。主画面 PNG 和巡天照片按实际使用的数据／图像附署名。

## 图意与依据 / Motifs and basis

图像中的姿态、器具样式和建筑构图均为现代创作；名称释义或文本母题不等于某张古图已得到复原。以下新增主题逐项区分传统依据与现代联想；原有八幅的图意同样保存在 provenance.json。

| 主题 | 中文图意 / English interpretation | 依据类别 |
| --- | --- | --- |
| 紫微垣 | 以环抱的宫墙与殿阁表现紫微垣的帝宫主题，是现代教学意象。<br>A modern palace-precinct motif for the imperial theme of the Purple Forbidden Enclosure. | 名称取义 |
| 太微垣 | 以开敞朝廷与门阙表现太微垣的朝会主题，不作某座古宫的复原。<br>A modern ceremonial-court motif for the Supreme Palace Enclosure, not a reconstruction of a specific palace. | 名称取义 |
| 天市垣 | 以古代市集表现天市垣的市场主题，摊位位置不对应真实星界。<br>A modern marketplace motif for the Heavenly Market Enclosure; stalls do not define celestial boundaries. | 名称取义 |
| 角宿 | 以龙首双角表现角宿的龙角意象，不逐颗指定星与角尖。<br>A modern horned-dragon-head motif for Jiao, without assigning each star to a horn tip. | 传统母题 |
| 亢宿 | 以修长龙颈表现亢宿的宽泛颈部意象，不作精确解剖图。<br>A modern dragon-neck motif for Kang, not a precise anatomical star map. | 传统母题 |
| 氐宿 | 以青龙身躯表现氐宿的东方天区意象，不把“根”画成树根或基座。<br>A modern dragon-body motif for Di in the eastern sky, not literal tree roots or a pedestal. | 传统母题 |
| 房宿 | 依“房”的屋宇含义绘中式房屋，建筑形体是现代教学选择。<br>A modern Chinese room motif inspired by Fang’s architectural meaning. | 名称取义 |
| 心宿 | 以心形龙纹饰呼应心宿之名与青龙心部意象，不代表恒星的外形。<br>A modern heart-shaped dragon ornament for Xin’s heart motif, not the physical shape of its stars. | 传统母题 |
| 尾宿 | 以回旋龙尾表现尾宿的尾部意象，真实九颗正星由软件另行绘制。<br>A modern curling dragon-tail motif for Wei; its nine real primary stars are drawn separately. | 传统母题 |
| 箕宿 | 依“箕”的簸箕含义绘竹编器物，不把编织纹当作星官连线。<br>A modern bamboo winnowing basket for Ji; its weave is not a constellation diagram. | 名称取义 |
| 斗宿 | 以古代量斗呼应斗宿之名，区别于已有的北斗插画。<br>A modern measuring dipper for the southern Dipper mansion, distinct from the Northern Dipper artwork. | 名称取义 |
| 牛宿 | 以一头传统耕牛呼应牛宿之名，不与河鼓二的牛郎混同。<br>A modern working-ox motif for Niu, distinct from the Cowherd associated with Altair. | 名称取义 |
| 女宿 | 以古代女子形象呼应女宿之名，不把女宿等同于织女星。<br>A modern female figure for the Girl mansion, distinct from the Weaver Girl star. | 现代名称联想 |
| 虚宿 | 以龟蛇玄武表现虚宿所属的北方天区，是区域象征而非二星古图。<br>A modern tortoise-and-snake motif for Xu’s northern region, not an ancient drawing of its two stars. | 现代天区联想 |
| 危宿 | 依“危”的高屋顶意象绘屋脊与檐线，不画危险悬崖。<br>A modern raised-rooftop motif for Wei, rather than a dangerous cliff. | 名称取义 |
| 室宿 | 以中式屋宇表现室宿的营室主题，不凭英文惯译臆造军营。<br>A modern Chinese hall for the Encampment mansion, without inventing a military camp from its English label. | 名称取义 |
| 壁宿 | 依“壁”的墙垣含义绘宫苑墙壁，不作为真实宿界。<br>A modern palace-wall motif for the Wall mansion, not an actual mansion boundary. | 名称取义 |
| 奎宿 | 以白虎舒展的步态表现奎宿的西方天区意象，不画魁星神像。<br>A modern striding White Tiger motif for Kui’s western region, not the deity Kuixing. | 现代天区联想 |
| 娄宿 | 用绳索的系结收拢呼应娄的曳聚含义，绳结样式是现代象征。<br>A modern gathered-cord motif for Lou’s sense of binding or gathering. | 现代名称联想 |
| 胃宿 | 据“胃为天仓”的传统解释绘古代粮仓，建筑样式不作古图复原。<br>A modern granary motif following the traditional celestial-granary reading of Wei. | 文本母题 |
| 昴宿 | 以白虎头部的细密毛束呼应昴的旄头意象，姿态为现代创作。<br>A modern tufted White Tiger head evokes Mao’s hairy-head motif; the pose is contemporary. | 现代名称联想 |
| 毕宿 | 依“毕”的网具含义绘长柄猎网，本体与附耳成员仍分别显示。<br>A modern long-handled hunting net for Bi; its primary stars and the subsidiary Whisper remain separate. | 名称取义 |
| 觜宿 | 据“觜觿为虎首”的传统说法绘白虎头像，现用英文星名仍独立保留。<br>A modern tiger head follows the traditional Tiger’s Head reading of Zi; the conventional English catalogue label is retained. | 文本母题 |
| 参宿 | 据“参为白虎”的传统说法绘完整白虎，不把七颗正星改成三颗。<br>A modern White Tiger follows the traditional Shen motif, without reducing its seven primary stars to three. | 文本母题 |
| 井宿 | 依“井”的井栏含义绘古代水井，不把附属钺星画进井栏。<br>A modern traditional well for Jing, without adding its subsidiary Battle Axe to the primary figure. | 名称取义 |
| 鬼宿 | 以安静祭祀器物表现鬼宿的祭祀联想，是现代意象而非恐怖鬼怪。<br>A restrained modern ancestral-ritual motif for Ghosts, rather than horror imagery. | 现代名称联想 |
| 柳宿 | 依“柳”的植物含义绘垂柳枝，枝叶不充当额外星点。<br>A modern willow branch for Liu, without turning its leaves into extra stars. | 名称取义 |
| 星宿 | 依朱雀颈部的传统解释绘鸟首长颈，不把星宿画成五角星图标。<br>A modern bird-head-and-neck motif follows Star’s Vermilion Bird association, not a generic star icon. | 传统母题 |
| 张宿 | 依“张”的张网含义绘展开细网，网线不是恒星连线。<br>A modern extended net for Zhang; its threads are not stellar connection lines. | 名称取义 |
| 翼宿 | 以展开鸟翼表现翼宿的羽翼意象，不以羽毛数补造未识别成员。<br>A modern pair of bird wings for Yi, without inventing missing stars through feather counts. | 传统母题 |
| 轸宿 | 依“轸”的车舆含义绘古代双轮车，附属星官仍独立保留。<br>A modern ancient-Chinese chariot motif for Zhen, with subsidiary asterisms kept separate. | 名称取义 |

出处与可支持的范围：

- [固定版本 Stellarium 中国体系](../README.md)：采用的目录、名称和天区组织。
- [香港太空馆：中国星区、星官及星名英译表](https://hk.space.museum/tc/web/spm/resources/teachers-corner/constellations-and-myths/glossary-of-chinese-star-regions-asterisms-and-star-names.html)。
- [British Library / IDP: The regions of the sky](https://idp.bl.uk/discover/learning/chinese-astronomy/articles/the-chinese-sky/the-regions-of-the-sky/)。
- [教育部《重编国语辞典修订本》：觜](https://dict.revised.moe.edu.tw/dictView.jsp?ID=9648&la=0&powerMode=0)。
- [央视新闻：天空有条星星做的龙（CRI完整转载）](https://news.cri.cn/20240213/f752cab7-7662-5af7-e9d8-898b7a75d277.html)。
- [台北天文馆期刊34期：每月一星](https://www-ws.gov.taipei/001/Upload/public/Attachment/9930172074.pdf)。
- [台北天文馆《台北星空》62期](https://www-ws.gov.taipei/001/Upload/439/relfile/21708/3425257/c761259d-686e-4286-b1fd-6ce3a330a490.pdf)。
- [台北天文馆《台北星空》92期：谜样星宿](https://www-ws.gov.taipei/Download.ashx?icon=.pdf&n=bm85MnA0MS00Nee%2FvOWuv3MucGRm&u=LzAwMS9VcGxvYWQvNDM5L2NrZmlsZS9kYTM5NDBjMC01MWEzLTQwZjUtODZjMC1hNGZlZjI2ZmYzYWYucGRm)。

逐图 `basis.evidenceIds` 与出处所支持的具体范围见 [provenance.json](provenance.json)。图像使用 CC BY-NC 4.0，文献与星官目录仍按各自原许可管理。

完整补图方案与名称意象见 [expansion-brief.json](expansion-brief.json)，可维护的逐图主题见 [subjects.txt](subjects.txt)。它们随源码与分发资料保存，构建和测试不依赖本机临时输出目录。
