# 天气与奇观 / Weather & phenomena — v0.28

四个独立开关：云内闪电、高空闪光、夜侧气辉、流星。默认自然模式，可切换观赏增强。两档均是程序模拟，未接入雷电定位或流星实测数据。

- 云内闪电：地理与季节先验筛选候选区，再按当前云图/本地生成云约束。云亮度不能证明存在雷暴，事件频率是视觉参数，不是气象预报。局部白蓝色脉冲在普通云/体积云内部增亮，白天降低对比，不生成全屏闪光。
- 高空闪光：少量雷暴伴随约50–90 km的红色精灵，或15–49 km的蓝色喷流。形态简化，观赏档提高频率、适度延长可见时间；不是所有事件都会同时出现。
- 气辉：复用原有约87–92 km的弱发光层与约240 km的红色层。独立于极光和太阳散射，夜侧渐显，日侧抑制；普通画质也保留高层气辉。
- 流星：在约85–115 km高度形成短迹，以约45 km/s横向、25 km/s下降速度演示。不是宇宙背景中的屏幕贴纸；有地球遮挡和大气透射。当前模拟偶发流星，不模拟真实流星雨辐射点。

## 时间、资源和保存

- 暂停冻结事件；跳转时间清理旧事件。瞬时效果的展示速度最高为2倍，避免在300/1000倍轨道播放时压成频闪；这不改变轨道、太阳、云图时间或太阳翼计算。
- 上限4个瞬时事件，流星保留可用槽位；4张复用的小平面，无额外动态灯光、阴影贴图、屏幕泛光或外部纹理。云照明复用现有云着色器，体积云每像素只计算一次闪电区域。
- 每个云图/模板/海洋纹理只生成一次512×256的CPU采样缓存；切换纹理后替换，不逐帧读取GPU。瞬时效果全关后停止调度，气辉全关后跳过积分。
- 随机种子沿用云图与极光设置；同设置/时间起点可复现，但高倍速的事件展示经过限速，并非逐毫秒历史回放。
- 记忆、环境预设、场景导入导出、恢复出厂设置均包含新选项；旧场景文件使用自然模式默认值。

## 参考资料

- [NASA — Studying Storms from Space Station](https://www.nasa.gov/missions/station/iss-research/studying-storms-from-space-station/)
- [NOAA — Lightning Types](https://www.nssl.noaa.gov/education/svrwx101/lightning/types/)
- [ESA — Elves seen from space](https://www.esa.int/ESA_Multimedia/Videos/2021/01/Elves_seen_from_space)
- [NASA — Airglow Over Germany](https://apod.nasa.gov/apod/ap120905.html)
- [NASA — Aurora from the Space Shuttle](https://science.nasa.gov/earth/earth-observatory/aurora-from-the-space-shuttle-1094/)
- [NASA — Meteors and Meteorites](https://science.nasa.gov/solar-system/meteors-meteorites/)

## English

Natural and Enhanced modes provide illustrative in-cloud lightning, sprites/blue jets, night airglow and meteors. Event placement follows cloud coverage and broad geographic priors; it is not a lightning retrieval. Upper flashes and meteor trails are Earth-fixed 3D geometry with planetary occlusion and atmospheric attenuation. Existing emission-layer integration supplies airglow without duplicating the atmosphere. Four pooled event slots, cached small masks, no new textures or shadow passes, and a two-times presentation-speed cap bound the cost. Pause, seeking, persistence, environment presets and scene files include these controls.

## 本次验证

- 数值回归：轨道、姿态、装配、云图、大气、太阳、月球、场景分享与新增事件调度检查通过。
- 浏览器：普通云/体积云闪电增亮及背面遮挡、高空闪光和流星着色器、暂停/1000倍速/跳时、气辉关闭与高层红色气辉检查通过；本地云CPU/GPU抽样最大差约0.00087。
- 完整页面：v0.28、8K画质、设置保存、场景导入导出、中英文界面正常。当前电脑短时60帧采样中，关闭效果与开启效果/1000倍轨道播放的帧间隔中位数均约16.7 ms；该结果仅代表本次场景，不是所有设备和视角的性能保证。
- 一位subagent独立审查并复核修复：本地云一致性、普通画质高层气辉、流星槽位和斜视姿态基。
