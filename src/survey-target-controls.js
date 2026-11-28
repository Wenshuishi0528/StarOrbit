import { t } from './i18n.js';
import { mountScopeSearch } from './xuntian-search.js';
import { createCityFinder } from './xuntian-ground-target.js';
import { onSkyCultureLoaded } from './sky-cultures.js';
import { SURVEY_FIELDS } from './survey-lab-math.js';

export function mountSurveyTargetControls(host, sim, { select, shoot, arrange, observe, back }) {
  host.className = 'survey-target-controls';
  host.innerHTML = `<div class="survey-target-entry"><label for="surveyTargetSearch"></label>
    <div class="survey-target-query"><input id="surveyTargetSearch" type="search" autocomplete="off" spellcheck="false"
      role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="surveyTargetResults"><div id="surveyTargetResults" role="listbox" hidden></div></div>
    <button type="button" data-survey="from-finder"></button></div>
    <div class="survey-target-choice"><strong data-survey="chosen"></strong><span data-survey="visibility"></span></div>
    <div class="survey-target-actions"><button type="button" data-survey="single"></button>
    <button type="button" data-survey="auto-four" class="survey-primary"></button><button type="button" data-survey="dynamic"></button><button type="button" data-survey="back-static" hidden></button></div>
    <p data-survey="target-note" role="status" aria-live="polite"></p>`;
  const control = (id) => host.querySelector(`[data-survey="${id}"]`),
    input = host.querySelector('input'),
    list = host.querySelector('[role=listbox]');
  let dynamic = null,
    busy = false,
    locked = false;
  const cities = createCityFinder(() => sim.environment.geography?.places?.() || []);
  const search = mountScopeSearch(input, list, {
    cityFinder: cities,
    cityVisible: () => null,
    solarVisible: () => null,
    preservePlaceholder: true,
    skyCulture: () => sim.environment.settings?.skyCulture || 'western',
    exampleTargets: () =>
      [SURVEY_FIELDS[0], SURVEY_FIELDS[2], SURVEY_FIELDS[6]].map((f) => ({
        ...f,
        name: t(f.name),
        type: 'preset',
        category: '推荐星野',
        identifier: 'J2000',
        direction: f.center,
      })),
    choose: select,
  });
  const offCulture = onSkyCultureLoaded(() => search.refresh());
  input.addEventListener('focus', () => {
    const geography = sim.environment.geography;
    if (geography && !geography.ready)
      geography
        .load()
        .then(() => search.refresh())
        .catch(() => {});
  });
  function note(key, params) {
    control('target-note').textContent = key ? t(key, params) : '';
  }
  function sync() {
    host.parentElement.dataset.dynamicTarget = String(!!dynamic);
    control('back-static').hidden = !dynamic;
    for (const item of ['single', 'auto-four']) {
      control(item).hidden = !!dynamic;
      control(item).disabled = busy || locked;
    }
    input.disabled = control('from-finder').disabled = busy || locked;
    control('dynamic').disabled = busy || locked;
    control('dynamic').textContent = t(
      dynamic?.body === 'Sun' ? '进入太阳观测' : dynamic ? '在取景器跟踪拍摄' : '在取景器中拍摄'
    );
  }
  function reset() {
    dynamic = null;
    note('');
    sync();
  }
  function selectMoving(target) {
    dynamic = target;
    input.value = target.name;
    control('chosen').textContent = target.name;
    control('visibility').textContent = '';
    note('此目标的位置随时间改变，可用巡天取景跟踪拍摄。');
    sync();
  }
  control('back-static').onclick = () => {
    reset();
    back();
  };
  control('from-finder').onclick = () => {
    const target = sim.xuntian?.getSurveyPointing?.();
    if (target) {
      reset();
      select(target);
    } else note('先打开巡天取景并调整指向，即可带入当前天区。');
  };
  control('single').onclick = async () => {
    if (busy) return;
    busy = true;
    sync();
    try {
      await shoot();
    } finally {
      busy = false;
      sync();
    }
  };
  control('auto-four').onclick = arrange;
  control('dynamic').onclick = async () => {
    if (busy) return;
    busy = true;
    sync();
    try {
      if (!(await (dynamic ? sim.flightLab.observeSurveyTarget(dynamic) : observe())))
        note('切换取景失败，请重试。');
    } finally {
      busy = false;
      sync();
    }
  };
  function translate() {
    host.querySelector('label').textContent = t('想拍哪里？');
    input.placeholder = t('搜索名称、编号或坐标，例如 M51、12h 30m +20°');
    control('from-finder').textContent = t('用当前取景中心');
    control('single').textContent = t('拍摄单张 PNG');
    control('auto-four').textContent = t('自动排好四格');
    control('back-static').textContent = t('返回') + ' · ' + t('巡天拍摄计划');
    if (dynamic)
      control('dynamic').textContent = t(
        dynamic.body === 'Sun' ? '进入太阳观测' : '在取景器跟踪拍摄'
      );
    search.refresh();
  }
  return {
    reset,
    selectMoving,
    setQuery(value) {
      input.value = value;
    },
    note,
    translate,
    update(field, exposure, running) {
      locked = running;
      sync();
      control('chosen').textContent = dynamic ? dynamic.name : t(field.name);
      control('visibility').textContent = dynamic
        ? ''
        : exposure.reason
          ? t(
              exposure.reason === 'sun'
                ? '本圈太阳过近，请换目标或日期。'
                : '本圈没有覆盖整个构图的曝光窗口。'
            )
          : t('单张可拍 · {time} 起 · {seconds} s', {
              time: exposure.time,
              seconds: exposure.duration,
            });
    },
    dispose() {
      offCulture();
      search.close();
    },
  };
}
