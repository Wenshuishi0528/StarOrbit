import { lazyData } from './lazy-data.js';

// 地理图集（地名、国界与河湖，约 4.3 MB）不进入启动包，首次使用时再单独加载。
const atlas = lazyData(
  () => import('../assets/geography/atlas.json', { with: { type: 'json' } }).then((m) => m.default),
  { label: '地理图集' }
);

/** 加载地理图集；并发调用共享同一次加载，失败后再次调用会重新尝试。 */
export const loadGeographyAtlas = atlas.load;
/** 已加载时返回图集；否则在后台开始加载并返回 null（供渲染循环等同步读取方使用）。 */
export const geographyAtlas = atlas.get;
