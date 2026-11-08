import { restoreControlFocus } from './display-controls.js';
import { t, onLanguageChange } from './i18n.js';
import { WEB_BUILD } from './runtime-assets.js';
const KEY = 'tiangong-help-v1',
  $ = (id) => document.getElementById(id),
  clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const topics = [
  {
    title: '星际穿梭',
    group: '观测与操纵',
    text: '在世界视图选择星际穿梭，搜索恒星后前往；H/N 前后、J/L 左右、K/I 升降，空格停止。选择中西星图并从侧面观察空间结构，可保存航点和拍照。返回太阳附近或进入太阳系继续探索。',
    target: '.world-entry',
  },
  {
    title: '天体观测',
    group: '观测与操纵',
    text: '从工具列打开天体观测，切换火星、地球、太阳或月球。火星支持真实地形、红外与地质图、着陆点和地球望远镜视角；地球可选点进入地表。展开对比观察比较图层或日期，查找天文事件，拍照保存画面与来源。太阳系中可查看主要卫星系统。',
    target: '#openPlanetaryObservatory',
  },
  {
    title: '地表与太阳系',
    group: '观测与操纵',
    text: '从观察方式下方进入地表或太阳系。搜索地点或输入坐标，默认贴地漫游；自由升降可输入海拔。点击画面后用 H/N 前后、J/L 左右、K/I 升降，W/S 低头抬头、A/D 转向，持续按住逐渐加速。地面与太阳系共享时间；可切换中西星空、银河或 DSS，收藏地点并拍照。',
    target: '.world-entry',
  },
  {
    title: '观察模型',
    text: '左键拖动旋转，右键拖动平移，滚轮缩放。可以直接试一试，说明会保持打开。',
    target: '#stage',
  },
  {
    title: '切换航天器',
    text: '在这里选择中国空间站或东方红一号。切换后，模型和轨道会一起更新。',
    target: '#missionSelect',
  },
  {
    title: '控制时间',
    text: '选择 1s／1m／10m／1h，再点击前进或后退。暂停与倍速在同一面板中，拖动小地图和时间轴也能定位时刻。',
    target: '.time-step-row',
  },
  {
    title: '选择整体画质',
    group: '选择画质',
    text: '推荐选择最高画质“精细 · 8K”，查看更清晰的地球与光影。如果操作不够流畅，可切回“标准 · 4K”。在箭头指向的下拉框中选择即可。',
    target: '#earthQuality',
  },
  {
    title: '选择星空画质',
    group: '选择画质',
    text: '星空显示默认选择“观赏增强 · 16K 银河”，呈现更细致的银河背景。在箭头指向的下拉框中，也可以切换为“4K · 星表观赏”或摄影风格。',
    target: '#skyExposure',
  },
  {
    title: '探索地球与星空',
    text: '在「星图标注」切换中西体系，用中国星官导航查看成员图并定位。「星官插画亮度」和「星座插画亮度」各自保存，默认100%；总览透明度独立调节。「星官插画」与适合广角的「总览插画」分别控制；图像保留原画，按天区和整体方向摆放。类别共享，主画面、取景和照片的显示开关各自独立。地球地点标识在同栏。赤道坐标网与黄道随模拟日期更新，中西体系共用。',
    target: '#settings-annotations',
  },
  {
    title: '播放音乐',
    text: '点击播放按钮开始音乐。打开播放列表可以选曲、导入音乐、删除和调整顺序。',
    target: '#musicExpanded',
    music: true,
  },
  {
    title: '隐藏航天器名称',
    text: '取消勾选“显示航天器名称”，即可隐藏模型旁的名称，让画面更简洁。需要查看名称时，再次勾选即可。',
    target: '#craftLabelsControl',
  },
  {
    title: '数据与更新',
    group: '数据与保存',
    text: WEB_BUILD
      ? '网页版默认使用内置轨道和云图。可导入轨道文件与云图快照；数据区间外继续椭圆轨道演算。'
      : '桌面版支持内置数据、在线更新和文件导入。轨道区间外继续椭圆轨道演算，数据栏显示当前计算模式。',
    target: '#openDataResources',
  },
  {
    title: '生日星空卡',
    group: '数据与保存',
    text: '输入生日，制作十二星座与二十八宿纪念卡。正面可编辑祝福、赠予落款和插画；背面独立选择东方或西方天区，以及银河或 DSS 光学背景。插画、连线、星名、坐标网分别控制，可调亮度、缩放、平移与旋转。横版、竖版或与正面同尺寸，单面导出 PNG，双面保存 ZIP。未填出生时间时采用当天20:00；DSS影像首次加载需联网。',
    target: '#openBirthdayCard',
  },
  {
    title: '保存与分享',
    group: '数据与保存',
    text: '设置、导入模型和音乐保存在当前浏览器中。清除网站数据会删除这些内容；使用“场景分享”导出场景文件。桌面版与网页版的本地数据分别保存。',
    target: '#exportScene',
  },
  {
    title: '巡天取景与太阳观测',
    text: '打开「巡天取景」，搜索天体或城市并拍照；太阳观测提供带观测日期的 SDO 实拍。改变模拟时间不会生成其它日期的太阳影像。打开取景会将主镜头聚焦巡天；十字线下可查看已知目标的实际距离。',
    target: '#openXuntianMap',
    group: '观测与操纵',
  },
  {
    title: '主页面近轨操纵',
    text: '在「航天器姿态」打开导航球，点击球面取得操纵焦点。W/S、A/D、Q/E 转向；R 切换 RCS，H/N、J/L、I/K 平移，T 切换 SAS。镜头目标与驾驶对象分别选择。',
    target: '#attitudeNavball',
    group: '观测与操纵',
  },
  {
    title: '自由飞行与对接',
    text: '从当前空间站组合选择神舟或天舟开始独立飞行，可保存后继续。任务实验室的交会对接训练使用独立教学场景；普通场景导出不包含自由飞行存档。',
    target: '#openFreeFlight',
    group: '观测与操纵',
  },
  {
    title: '城市影像与真实地形',
    text: '从城市库查看或下载影像，已内置北京和西雅图。真实地形默认开启，以实际海拔显示山川；影像与高程各有分辨率和年代，地形显示不增加着陆或碰撞模型。',
    target: '#openCityTerrain',
    group: '地球与星空数据',
  },
  {
    title: '高清星空与星座',
    text: '放大天区后按需加载所选星空影像，主画面、巡天和照片共用。内置宇宙悬崖来自 2022 年 JWST 红外观测；联网图源在覆盖之外会回退。星座插画和星名可在「地理与星图」分别开关。',
    target: '#skyDetailSource',
    group: '地球与星空数据',
  },
  {
    title: '缓存与离线保存',
    text: '在「数据与资源」查看来源、日期与缓存。城市的完整离线下载不自动淘汰，天空与高程采用有上限的缓存；清除网站数据会影响本地保存。场景文件不包含用户模型、音乐和下载缓存。',
    target: '#openDataResources',
    group: '数据与保存',
  },
  {
    title: '宇宙探索馆',
    text: '从工具列打开宇宙探索馆，旋转查看黑洞、中子星、脉冲星、超新星和流星，调整参数或拖动演示进度。图像是教学示意；可保存带说明的示意图，或定位真实遗迹和宿主星系。演示时间独立于主场景。',
    target: '#openCosmicLab',
    group: '观测与操纵',
  },
  {
    title: '月球观测',
    text: '从月球设置、巡天月球专属卡片或任务实验室进入。按地点和独立时间观察月相、天平动与升落；三维月面支持完整正式地名搜索、着陆点与独立密度控制，中国任务用红星。顶部月面图层可切换中科院地质分区，在三维球上旋转查看；展开原图可对照图例与年代尺。高程为伪彩、图鉴有辅助照明；导出包含当前标注，巡天交接使用主场景时间。',
    target: '#openLunarLab',
    group: '观测与操纵',
  },
];
const TOUR_LENGTH = 8;
export function installHelp(music) {
  const panel = $('helpPanel'),
    welcome = $('welcomeDialog'),
    spotlight = $('helpSpotlight');
  let step = null,
    touring = false,
    marked = null,
    restore = [],
    returnFocus = null,
    frame = 0;
  const remember = () => {
    try {
      localStorage.setItem(KEY, 'seen');
    } catch {}
  };
  const beginMusic = () => {
    if (music.settings.autoplay && music.audio.paused) music.play();
  };
  // Layout work is event-driven and coalesced: no animation-loop measurements.
  const schedule = () => {
    if (panel.hidden || step === null || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      place();
    });
  };
  const observer = new ResizeObserver(schedule);
  const clearTarget = () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
    frame = 0;
    marked?.classList.remove('tour-highlight');
    marked = null;
    spotlight.toggleAttribute('hidden', true);
    for (const fn of restore.reverse()) fn();
    restore = [];
  };
  function target() {
    clearTarget();
    const topic = topics[step];
    if (topic.music) {
      const expanded = music.dock.expanded;
      music.dock.guided = true;
      music.dock.expand();
      restore.push(() => {
        music.dock.guided = false;
        if (!expanded) music.dock.collapse();
      });
    }
    let el = document.querySelector(topic.target);
    if (!el) return;
    if (el.closest('#toolbarActions')?.hidden) el = $('toolsToggle');
    const content = el.closest('.settings-content');
    if (content?.hidden) {
      content.hidden = false;
      const button = document.querySelector(`[aria-controls="${content.id}"]`);
      button?.setAttribute('aria-expanded', 'true');
      restore.push(() => {
        content.hidden = true;
        button?.setAttribute('aria-expanded', 'false');
      });
    }
    for (let parent = el.parentElement; parent; parent = parent.parentElement)
      if (parent.tagName === 'DETAILS' && !parent.open) {
        const detail = parent;
        detail.open = true;
        restore.push(() => (detail.open = false));
      }
    const aside = el.closest('aside');
    if (aside) {
      const scroll = aside.scrollTop;
      restore.push(() => (aside.scrollTop = scroll));
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
    marked = el;
    el.classList.add('tour-highlight');
    observer.observe(el);
    observer.observe(panel);
    for (const section of document.querySelectorAll('aside > section')) observer.observe(section);
    place();
  }
  function place() {
    if (!marked || panel.hidden) return;
    const w = innerWidth,
      h = innerHeight,
      raw = marked.getBoundingClientRect(),
      aside = marked.closest('aside'),
      clip = aside?.getBoundingClientRect();
    let left = Math.max(8, raw.left, clip?.left ?? 0),
      right = Math.min(w - 8, raw.right, clip?.right ?? w),
      top = Math.max(8, raw.top, clip?.top ?? 0),
      bottom = Math.min(h - 8, raw.bottom, clip?.bottom ?? h);
    if (marked.id === 'stage') {
      const cx = (left + right) / 2,
        cy = (top + bottom) / 2,
        rw = Math.min(240, (right - left) * 0.6),
        rh = Math.min(140, (bottom - top) * 0.5);
      left = cx - rw / 2;
      right = cx + rw / 2;
      top = cy - rh / 2;
      bottom = cy + rh / 2;
    }
    if (right <= left || bottom <= top) {
      spotlight.toggleAttribute('hidden', true);
      return;
    }
    const r = { left: left - 4, right: right + 4, top: top - 4, bottom: bottom + 4 },
      pw = panel.offsetWidth,
      ph = panel.offsetHeight,
      gap = 28,
      cx = (left + right) / 2,
      cy = (top + bottom) / 2;
    const candidates = [
      { x: r.right + gap, y: cy - ph / 2 },
      { x: r.left - gap - pw, y: cy - ph / 2 },
      { x: cx - pw / 2, y: r.top - gap - ph },
      { x: cx - pw / 2, y: r.bottom + gap },
    ];
    const overlap = (p) =>
      Math.max(0, Math.min(p.x + pw, r.right) - Math.max(p.x, r.left)) *
      Math.max(0, Math.min(p.y + ph, r.bottom) - Math.max(p.y, r.top));
    const positions = candidates.map((p) => ({
      x: clamp(p.x, 12, w - pw - 12),
      y: clamp(p.y, 80, h - ph - 12),
    }));
    const position = positions.reduce((best, p) => (overlap(p) < overlap(best) ? p : best));
    panel.style.left = position.x + 'px';
    panel.style.top = position.y + 'px';
    spotlight.toggleAttribute('hidden', false);
    spotlight.setAttribute('viewBox', `0 0 ${w} ${h}`);
    $('helpShade').setAttribute(
      'd',
      `M0 0H${w}V${h}H0Z M${r.left} ${r.top}H${r.right}V${r.bottom}H${r.left}Z`
    );
    const ring = $('helpRing');
    for (const [k, v] of Object.entries({
      x: r.left,
      y: r.top,
      width: r.right - r.left,
      height: r.bottom - r.top,
    }))
      ring.setAttribute(k, v);
    const p = {
      left: position.x,
      right: position.x + pw,
      top: position.y,
      bottom: position.y + ph,
    };
    let a, b;
    if (p.left >= r.right) {
      a = [p.left, clamp(cy, p.top + 20, p.bottom - 20)];
      b = [r.right + 7, cy];
    } else if (p.right <= r.left) {
      a = [p.right, clamp(cy, p.top + 20, p.bottom - 20)];
      b = [r.left - 7, cy];
    } else if (p.bottom <= r.top) {
      a = [clamp(cx, p.left + 20, p.right - 20), p.bottom];
      b = [cx, r.top - 7];
    } else {
      a = [clamp(cx, p.left + 20, p.right - 20), p.top];
      b = [cx, r.bottom + 7];
    }
    $('helpArrow').setAttribute('d', `M${a.join(' ')} L${b.join(' ')}`);
  }
  function render() {
    const selected = step !== null;
    panel.classList.toggle('guiding', selected);
    panel.style.left = panel.style.top = '';
    $('helpProgress').textContent = touring ? `${step + 1} / ${TOUR_LENGTH}` : t('使用指南');
    $('helpTitle').textContent = t(selected ? topics[step].title : '帮助与操作说明');
    $('tourActions').hidden = !selected;
    $('replayTour').hidden = selected;
    $('helpDirectory').hidden = !selected;
    $('tourPrevious').disabled = step === 0;
    $('tourNext').textContent = t(
      step === (touring ? TOUR_LENGTH : topics.length) - 1
        ? touring
          ? '完成导览'
          : '完成介绍'
        : '下一个'
    );
    const contents = $('helpContents');
    contents.replaceChildren();
    if (selected) {
      const p = document.createElement('p');
      p.textContent = t(topics[step].text);
      contents.append(p);
      return;
    }
    const groups = new Map();
    topics.forEach((topic, i) => {
      let container = contents;
      if (topic.group) {
        if (!groups.has(topic.group)) {
          const group = document.createElement('details'),
            summary = document.createElement('summary');
          group.className = 'help-topic-group';
          summary.textContent = t(topic.group);
          group.append(summary);
          contents.append(group);
          groups.set(topic.group, group);
        }
        container = groups.get(topic.group);
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'help-topic';
      button.dataset.topic = String(i);
      const label = document.createElement('span'),
        arrow = document.createElement('span');
      label.textContent = t(topic.title);
      arrow.textContent = '↗';
      arrow.setAttribute('aria-hidden', 'true');
      button.append(label, arrow);
      button.onclick = () => select(i, false);
      container.append(button);
    });
  }
  function select(index, tour) {
    step = index;
    touring = tour;
    render();
    target();
    panel.focus({ preventScroll: true });
  }
  function close() {
    clearTarget();
    panel.hidden = true;
    document.body.classList.remove('help-active');
    $('helpToggle').setAttribute('aria-expanded', 'false');
    step = null;
    touring = false;
    restoreControlFocus(returnFocus);
  }
  function open(tour = false) {
    returnFocus = document.activeElement;
    panel.hidden = false;
    document.body.classList.add('help-active');
    $('helpToggle').setAttribute('aria-expanded', 'true');
    if (tour) select(0, true);
    else {
      step = null;
      touring = false;
      render();
      panel.focus({ preventScroll: true });
    }
  }
  function dismiss() {
    remember();
    welcome.close();
    beginMusic();
  }
  $('helpToggle').onclick = () => (panel.hidden ? open() : close());
  $('closeHelp').onclick = close;
  $('helpDirectory').onclick = () => {
    clearTarget();
    step = null;
    touring = false;
    render();
    panel.focus({ preventScroll: true });
  };
  $('replayTour').onclick = () => select(0, true);
  $('tourPrevious').onclick = () => {
    if (step !== null && step > 0) select(step - 1, touring);
  };
  $('tourNext').onclick = () => {
    if (step === null) return;
    if (step === (touring ? TOUR_LENGTH : topics.length) - 1) {
      remember();
      close();
    } else select(step + 1, touring);
  };
  $('startTour').onclick = () => {
    dismiss();
    open(true);
    returnFocus = $('helpToggle');
  };
  $('skipTour').onclick = () => {
    dismiss();
    $('helpToggle').focus();
  };
  welcome.addEventListener('cancel', remember);
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && !panel.hidden) {
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
      }
    },
    true
  );
  window.addEventListener('resize', schedule);
  document.addEventListener('scroll', schedule, true);
  document.addEventListener('click', schedule);
  document.addEventListener('toggle', schedule, true);
  onLanguageChange(() => {
    if (!panel.hidden) {
      render();
      schedule();
    }
  });
  let seen = false;
  try {
    seen = localStorage.getItem(KEY) === 'seen';
  } catch {}
  if (
    !seen &&
    !$('flightLab')?.open &&
    !$('freeFlightLauncher')?.open &&
    !document.body.classList.contains('xt-scope-open')
  )
    welcome.showModal();
}
