import {t} from './i18n.js';
const tasks=new Map();
const labels={
 'GLB model':'正在解析航天器模型…',
 'Mission cache':'正在恢复任务库…',
 'Scene setup':'正在建立场景…',
 'Weather / mission restore':'正在恢复轨道与资源记录…',
 'Environment / session restore':'正在恢复画质与观察设置…',
 'First frame':'正在绘制首帧…',
 'Cloud cache open':'正在读取云图记录…',
 'Cloud cache validation':'正在校验旧云图…',
 'Orbit cache restore':'正在恢复轨道记录…',
 'Earth day':'正在加载白天地表…','Earth night':'正在加载夜景…',
 'Earth cloud':'正在加载内置云图…','Earth ocean':'正在加载海洋纹理…'
};
export function startupStatus(task,detail){
 const loading=document.getElementById('loading');
 if(!loading||loading.classList.contains('hidden'))return;
 if(detail)tasks.set(task,detail);else tasks.delete(task);
 const text=[...tasks.values()].map(value=>t(labels[value]||value)).join(' · ');
 document.getElementById('loadText').textContent=text;
 console.info('[StarOrbit startup]',Math.round(performance.now())+' ms',task,detail||'done');
}
