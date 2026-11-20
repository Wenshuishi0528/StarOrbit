// Locations point to controls in the main workspace. A workspace opens only
// when the reader chooses its actual entry button.
const mission = { label: '当前任务', selector: '#missionSelect' };
const scope = { label: '巡天取景', selector: '#openXuntianMap' };
const lab = { label: '任务实验室', selector: '#openFlightLab' };
const data = { label: '数据与资源', selector: '#openDataResources' };
const moon = { label: '月球观测', selector: '#openLunarLab' };
const observatory = { label: '天体观测', selector: '#openPlanetaryObservatory' };
const skyImage = { label: '星空影像', selector: '#skyDetailSource' };
const clouds = { label: '打开云图库…', selector: '#updateCloudSource' };
const sceneFiles = { label: '场景分享', selector: '[data-memory-key="scene-files"] > summary' };
const music = { label: '背景音乐', selector: '#musicWidget' };
// The three main view buttons are installed together, in this order.
const ground = { label: '地表观测', selector: '.world-mode-entry > button:nth-child(1)' };
const solar = { label: '太阳系', selector: '.world-mode-entry > button:nth-child(2)' };
const stellar = { label: '星际穿梭', selector: '.world-mode-entry > button:nth-child(3)' };

export const manualLocations = {
  // 1.1 describes launch methods outside the running application.
  's1-2': [{ label: '观察方式', selector: '#viewMode' }],
  's1-3': [{ label: '窗口布局', selector: '[data-memory-key="window-layout"] > summary' }],

  's2-1': [mission],
  's2-2': [{ label: '导入航天器', selector: '#importMission' }],
  's2-3': [{ label: '时间模式', selector: '#timeMode' }],
  's2-4': [
    { label: '轨道地图', selector: '#openOrbitMap' },
    { label: '轨道事件时间轴', selector: '[data-memory-key="orbit-events"] > summary' },
  ],

  's3-1': [{ label: '完整组合', selector: '[data-preset="full"]' }],
  's3-2': [{ label: '节点前端', selector: '#TH_FORWARD' }],
  's3-3': [{ label: '选择舱体', selector: '#target' }],
  's3-4': [{ label: '显示导航球', selector: '#attitudeNavball' }],
  's3-5': [{ label: '自由飞行', selector: '#openFreeFlight' }],
  's3-6': [lab],

  's4-1': [scope],
  's4-2': [scope],
  's4-3': [scope],
  's4-4': [scope],
  's4-5': [scope],
  's4-6': [scope, skyImage],
  's4-7': [scope, data],

  's5-1': [ground],
  's5-2': [ground],
  's5-3': [
    { label: '城市高清地景库…', selector: '#openCityTerrain' },
    { label: '地形数据与缓存', selector: '#earthElevationInfo > summary' },
  ],
  's5-4': [ground],
  's5-5': [solar],

  's6-1': [skyImage],
  's6-2': [
    { label: '主画面显示星图标注', selector: '#starChartEnabled' },
    { label: '星空体系', selector: '#skyCulture' },
  ],
  's6-3': [{ label: '恒星名称与拜耳编号', selector: '#starNames' }],
  's6-4': [stellar],
  's6-5': [stellar],

  's7-1': [moon],
  's7-2': [moon],
  's7-3': [observatory],
  's7-4': [observatory],
  's7-5': [observatory],
  's7-6': [{ label: '宇宙探索馆', selector: '#openCosmicLab' }],

  's8-1': [lab],
  's8-2': [lab],
  's8-3': [lab],
  's8-4': [lab],
  's8-5': [lab],
  's8-6': [lab],

  's9-1': [
    { label: '画质模式', selector: '#earthQuality' },
    { label: '夜景数据', selector: '#nightSource' },
  ],
  's9-2': [clouds, { label: '极光来源', selector: '#auroraSource' }],
  's9-3': [
    { label: '启用地球地点标识', selector: '#geographyEnabled' },
    { label: '效果模式', selector: '#phenomenaMode' },
  ],
  's9-4': [
    { label: '体积云 · 8K', selector: '#volumeClouds' },
    { label: '自动优化性能', selector: '#adaptiveEffects' },
  ],

  's10-1': [{ label: '摄影与场景', selector: '[aria-controls="settings-sharing"]' }],
  's10-2': [sceneFiles],
  's10-3': [{ label: '生日星空卡', selector: '#openBirthdayCard' }],
  's10-4': [music],
  's10-5': [mission, music],

  's11-1': [data],
  's11-2': [{ label: '轨道数据', selector: '[data-memory-key="orbit-data"] > summary' }],
  's11-3': [clouds],
  's11-4': [data],
  's11-5': [
    sceneFiles,
    { label: '重置设置', selector: '[data-memory-key="reset-settings"] > summary' },
  ],
  // 11.6 links individual symptoms to their corresponding sections.
};
