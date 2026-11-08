import { t, getLanguage, onLanguageChange } from './i18n.js';
import { birthdayCalendar } from './birthday-calendar.js';
import { BIRTHDAY_ZODIAC, BIRTHDAY_MANSIONS, BIRTHDAY_CULTURE_NOTE } from './birthday-content.js';
import { renderBirthdayCard } from './birthday-card-render.js';
import { renderBirthdayBack } from './birthday-card-back.js';
import { birthdayCardZip } from './birthday-card-export.js';
import { birthdaySkyMoment } from './birthday-sky-frame.js';
import { getXuntianTarget } from './xuntian-catalog.js';

const css = `.birthday-dialog{box-sizing:border-box;width:min(1320px,96vw);max-width:none;height:92dvh;max-height:96dvh;padding:0;border:1px solid #425264;border-radius:18px;background:#0b1422;color:#e8eff7}.birthday-dialog::backdrop{background:#030915bc;backdrop-filter:blur(5px)}.birthday-dialog[open]{display:flex;flex-direction:column}.birthday-dialog header{position:static;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 22px;border-bottom:1px solid #334354}.birthday-dialog h2{margin:0;font-size:21px}.birthday-dialog h3{margin:0 0 6px;font-size:16px;color:#e2ce9e}.birthday-dialog button,.birthday-dialog input,.birthday-dialog select,.birthday-dialog textarea{font:inherit;box-sizing:border-box;min-height:38px}.birthday-dialog button{width:auto}.birthday-dialog .birthday-body{display:grid;grid-template-columns:330px minmax(0,1fr);min-height:0;flex:1}.birthday-dialog .birthday-controls{padding:18px 20px;overflow:auto;border-right:1px solid #334354}.birthday-dialog .birthday-controls label{display:block;margin:12px 0 5px;font-size:13px;color:#bdd0e1}.birthday-dialog .birthday-controls input:not([type=checkbox]),.birthday-dialog .birthday-controls select,.birthday-dialog textarea{width:100%}.birthday-dialog input[type=date],.birthday-dialog input[type=time]{color-scheme:dark}.birthday-dialog textarea{resize:vertical;min-height:78px;line-height:1.6;padding:8px;background:#101f31;border:1px solid #3d526a;border-radius:6px;color:#e8eff7}.birthday-dialog .birthday-check{display:flex!important;align-items:center;gap:8px}.birthday-dialog .birthday-check input{min-height:auto}.birthday-dialog p{font-size:13px;line-height:1.7;color:#b4c6d7;margin:7px 0}.birthday-dialog details{margin:14px 0}.birthday-dialog summary{cursor:pointer;font-size:13px;color:#d8c493}.birthday-dialog a{color:#9fdbe4}.birthday-dialog .birthday-result{padding:12px 14px;margin:12px 0;background:#14243a;border:1px solid #35495d;border-radius:10px}.birthday-dialog .birthday-result p{white-space:pre-line}.birthday-dialog .birthday-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.birthday-dialog .birthday-primary{background:#294b60;border-color:#77a8b5;flex:1}.birthday-dialog .birthday-preview{display:flex;flex-direction:column;min-width:0;min-height:0;padding:20px;gap:12px;background:radial-gradient(ellipse at 50% 25%,#1c2a3d,#070f1b)}.birthday-dialog .birthday-image-area{display:flex;align-items:center;justify-content:center;overflow:auto;min-height:0;flex:1;border-radius:10px}.birthday-dialog .birthday-preview img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;box-shadow:0 12px 40px #0008}.birthday-dialog .birthday-placeholder{max-width:420px;text-align:center;padding:40px 20px}.birthday-dialog .birthday-placeholder strong{font-size:23px;display:block;color:#e2ce9e;margin-bottom:15px}.birthday-dialog .birthday-tabs{display:flex;gap:6px;align-self:center;padding:4px;background:#0a1423;border:1px solid #35495d;border-radius:12px}.birthday-dialog .birthday-tabs button{border:0;background:transparent;color:#aabed1;padding:8px 20px}.birthday-dialog .birthday-tabs button[aria-selected=true]{background:#294052;color:#efdbb2}.birthday-dialog [role=status]{min-height:1.7em;white-space:pre-line}.birthday-dialog [hidden]{display:none!important}.birthday-dialog button:focus-visible,.birthday-dialog input:focus-visible,.birthday-dialog select:focus-visible,.birthday-dialog textarea:focus-visible,.birthday-dialog summary:focus-visible{outline:2px solid #95dbe8;outline-offset:3px}@media(max-width:760px){.birthday-dialog{width:100vw;height:100dvh;max-height:100dvh;border-radius:0}.birthday-dialog .birthday-body{display:block;overflow:auto}.birthday-dialog .birthday-controls{overflow:visible;border-right:0}.birthday-dialog .birthday-preview{min-height:460px}.birthday-dialog .birthday-image-area{min-height:320px}.birthday-dialog .birthday-preview img{max-height:75vh}.birthday-dialog header{padding:12px 16px}}`;

export function installBirthdayCard(sim) {
  const opener = document.getElementById('openBirthdayCard');
  let dialog,
    controls,
    status,
    preview,
    placeholder,
    generate,
    download,
    downloadPair,
    frontTab,
    backTab,
    backLabels,
    backArtwork,
    backTimeNote,
    date,
    name,
    sender,
    giftDate,
    time,
    zone,
    mode,
    layout,
    westernTitle,
    chineseTitle,
    westernWhy,
    chineseWhy,
    boundary,
    westernText,
    chineseText,
    westernBrightness,
    chineseBrightness,
    lines,
    explanation,
    blessing,
    westernVisit,
    chineseVisit;
  let result = null,
    pages = { front: null, back: null },
    activeSide = 'front',
    renderSequence = 0,
    imageURL = null,
    controller = null,
    generation = 0;
  const translations = new Map();
  const el = (tag, parent, text, id) => {
    const node = document.createElement(tag);
    if (text) {
      const label = document.createTextNode(t(text));
      node.append(label);
      translations.set(label, text);
    }
    if (id) node.id = id;
    parent.append(node);
    return node;
  };
  const button = (parent, text, handler, id) => {
    const b = el('button', parent, text, id);
    b.type = 'button';
    b.onclick = handler;
    return b;
  };
  const field = (parent, text, tag, id) => {
    const label = el('label', parent, text);
    label.htmlFor = id;
    return el(tag, parent, null, id);
  };
  function revoke() {
    if (imageURL) URL.revokeObjectURL(imageURL);
    imageURL = null;
  }
  function invalidate() {
    generation++;
    controller?.abort();
    controller = null;
    pages = { front: null, back: null };
    download.disabled = true;
    downloadPair.disabled = !result;
    generate.disabled = false;
    status.textContent = t('设置已改变，请生成新的预览。');
  }
  const selected = () => ({
    western: result?.zodiacIndex == null ? null : BIRTHDAY_ZODIAC[result.zodiacIndex],
    mansion: result ? BIRTHDAY_MANSIONS[result.mansionIndex] : null,
  });
  function calculate(resetText = true) {
    invalidate();
    try {
      result = birthdayCalendar({
        date: date.value,
        time: time.value,
        utcOffset: Number(zone.value),
      });
      const { western, mansion } = selected();
      westernTitle.textContent = western ? western.zh + ' · ' + western.en : t('生日位于星座交界');
      chineseTitle.textContent = mansion.zh + ' · ' + mansion.fullName;
      westernWhy.textContent = western
        ? western.description + '\n' + t('按太阳在黄道十二宫中的位置确定，采用常用生日星座口径。')
        : t('这一天太阳跨越两个黄道宫位，请在下方补充出生时间，或先制作东方单卡。');
      chineseWhy.textContent =
        mansion.themeName +
        ' · ' +
        t('第 {number} 宿', { number: mansion.orderInTheme }) +
        '\n' +
        mansion.description;
      chineseWhy.textContent +=
        '\n' +
        t('按所填日期：{basis}，值日配宿为{mansion}。', {
          basis: result.mansionBasis,
          mansion: mansion.zh,
        });
      boundary.textContent = result.needsTime
        ? t('这一天可能属于 {signs}。', {
            signs: result.zodiacCandidates.map((i) => BIRTHDAY_ZODIAC[i].zh).join(' / '),
          })
        : '';
      if (result.lunarLabel)
        boundary.textContent += (boundary.textContent ? '\n' : '') + result.lunarLabel;
      westernVisit.disabled = !western;
      chineseVisit.disabled = !mansion;
      if (resetText) {
        westernText.value = western?.blessings[0] || '';
        chineseText.value = mansion.blessings[0];
      }
      const moment = birthdaySkyMoment({
        date: date.value,
        time: time.value,
        utcOffset: Number(zone.value),
      });
      backTimeNote.textContent = t(
        moment.timeAssumed
          ? '背面取景采用生日当天 {time}（UTC{offset}）；填写出生时间后随之更新。'
          : '背面取景：生日当天 {time}（UTC{offset}）。',
        {
          time: moment.localTime,
          offset: (moment.utcOffset >= 0 ? '+' : '') + moment.utcOffset,
        }
      );
      downloadPair.disabled = false;
      status.textContent = t('日期已核对，可以生成生日星空卡。');
    } catch (error) {
      result = null;
      westernTitle.textContent = chineseTitle.textContent = '—';
      westernWhy.textContent = chineseWhy.textContent = boundary.textContent = '';
      westernVisit.disabled = chineseVisit.disabled = true;
      downloadPair.disabled = true;
      backTimeNote.textContent = '';
      status.textContent = t(error.message);
    }
  }
  function visit(culture) {
    const item = selected()[culture === 'western' ? 'western' : 'mansion'];
    const target = item && getXuntianTarget(item.targetId, getLanguage(), culture);
    if (!target || !sim.xuntian?.observeTarget(target, { annotations: true })) {
      status.textContent = t('巡天取景需选择中国空间站任务。');
      return;
    }
    dialog.close();
  }
  function changeBlessing(culture) {
    const item = selected()[culture === 'western' ? 'western' : 'mansion'];
    const input = culture === 'western' ? westernText : chineseText;
    if (!item) return;
    input.value = item.blessings[(item.blessings.indexOf(input.value) + 1) % item.blessings.length];
    invalidate();
  }
  function snapshot() {
    const { western, mansion } = selected();
    return {
      sim,
      renderer: sim.api.renderer,
      environment: sim.environment,
      language: getLanguage(),
      date: date.value,
      time: time.value,
      utcOffset: Number(zone.value),
      name: name.value.trim(),
      sender: sender.value.trim(),
      giftDate: giftDate.value,
      mode: mode.value,
      layout: layout.value,
      western,
      mansion,
      blessings: { western: westernText.value, chinese: chineseText.value },
      brightness: {
        western: Number(westernBrightness.value),
        chinese: Number(chineseBrightness.value),
      },
      showLines: lines.checked,
      showExplanation: explanation.checked,
      showBlessing: blessing.checked,
      backLabels: backLabels.checked,
      backArtwork: backArtwork.checked,
      width: mode.value === 'dual' ? 2400 : 1800,
    };
  }
  function showPage() {
    const page = pages[activeSide];
    revoke();
    preview.hidden = !page;
    placeholder.hidden = !!page;
    download.disabled = !page;
    if (page) {
      imageURL = URL.createObjectURL(page.blob);
      preview.src = imageURL;
      preview.alt = t(activeSide === 'front' ? '生日星空卡正面预览' : '生日星空卡背面预览');
      status.textContent = t('预览已生成，导出图片与此预览一致。');
    } else preview.removeAttribute('src');
  }
  async function prepare(sides) {
    if (!result || !giftDate.reportValidity()) return false;
    if (!selected().western && mode.value !== 'chinese') {
      status.textContent = t('请补充出生时间以确定西方生日星座，或选择东方单卡。');
      return false;
    }
    controller?.abort();
    const token = generation,
      sequence = ++renderSequence,
      abort = new AbortController();
    controller = abort;
    generate.disabled = true;
    downloadPair.disabled = true;
    const options = { ...snapshot(), signal: abort.signal };
    try {
      for (const side of sides) {
        if (pages[side]) continue;
        status.textContent = t(
          side === 'front' ? '正在准备星图与插画，生成高清预览…' : '正在拍摄生日天区，生成星空背面…'
        );
        const card = await (side === 'front'
          ? renderBirthdayCard(options)
          : renderBirthdayBack(options));
        if (token !== generation || sequence !== renderSequence || !dialog.open) return false;
        pages[side] = {
          blob: card.blob,
          date: options.date,
          mode: options.mode,
          name: options.name,
        };
      }
      showPage();
      return true;
    } catch (error) {
      if (token === generation && sequence === renderSequence && !abort.signal.aborted)
        status.textContent = t('生成失败，请重试；未导出不完整图像。') + ' ' + t(error.message);
      return false;
    } finally {
      if (token === generation && sequence === renderSequence) {
        controller = null;
        generate.disabled = false;
        downloadPair.disabled = !result;
        download.disabled = !pages[activeSide];
      }
    }
  }
  function activateSide(side) {
    activeSide = side;
    frontTab.setAttribute('aria-selected', String(side === 'front'));
    backTab.setAttribute('aria-selected', String(side === 'back'));
    frontTab.tabIndex = side === 'front' ? 0 : -1;
    backTab.tabIndex = side === 'back' ? 0 : -1;
    showPage();
    prepare([side]);
  }
  const render = () => prepare([activeSide]);
  function filename(page) {
    const suffix = page.name.replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 32);
    return `StarOrbit-Birthday-${page.date}-${page.mode}${suffix ? '-' + suffix : ''}`;
  }
  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function save() {
    const page = pages[activeSide];
    if (page) saveBlob(page.blob, `${filename(page)}-${activeSide}.png`);
  }
  async function savePair() {
    const token = generation;
    if (!(await prepare(['front', 'back'])) || token !== generation) return;
    const captured = { ...pages };
    downloadPair.disabled = true;
    try {
      const blob = await birthdayCardZip(
        ['front', 'back'].map((side) => ({
          name: `${filename(captured[side])}-${side}.png`,
          blob: captured[side].blob,
        }))
      );
      if (token !== generation || !dialog.open) return;
      saveBlob(blob, `${filename(captured.front)}-duplex.zip`);
      status.textContent = t('正反两面已打包，解压后可分别查看或打印。');
    } catch (error) {
      if (token === generation) status.textContent = t(error.message);
    } finally {
      if (token === generation) downloadPair.disabled = !result;
    }
  }
  function create() {
    el('style', document.head).textContent = css;
    dialog = el('dialog', document.body, null, 'birthdayCardDialog');
    dialog.className = 'birthday-dialog';
    dialog.setAttribute('aria-labelledby', 'birthdayCardTitle');
    const header = el('header', dialog);
    el('h2', header, '生日星空卡', 'birthdayCardTitle');
    button(header, '返回模拟器', () => dialog.close());
    const body = el('div', dialog);
    body.className = 'birthday-body';
    controls = el('div', body);
    controls.className = 'birthday-controls';
    el('p', controls, '用真实星图与传统意象，为一个特别的日子留念。');
    date = field(controls, '公历生日', 'input', 'birthdayDate');
    date.type = 'date';
    date.min = '1901-01-01';
    date.max = '2100-12-31';
    date.value = '2004-11-09';
    const inscription = el('details', controls);
    el('summary', inscription, '赠予落款（选填）');
    name = field(inscription, '收礼人姓名或昵称', 'input', 'birthdayName');
    name.type = 'text';
    name.maxLength = 40;
    name.autocomplete = 'off';
    sender = field(inscription, '赠送人姓名或昵称', 'input', 'birthdaySender');
    sender.type = 'text';
    sender.maxLength = 40;
    sender.autocomplete = 'off';
    giftDate = field(inscription, '赠送日期', 'input', 'birthdayGiftDate');
    giftDate.type = 'date';
    giftDate.min = '0001-01-01';
    giftDate.max = '9999-12-31';
    const results = el('div', controls);
    const west = el('section', results);
    west.className = 'birthday-result';
    el('p', west, '西方生日星座');
    westernTitle = el('h3', west);
    westernWhy = el('p', west);
    westernVisit = button(west, '在巡天中查看', () => visit('western'), 'birthdayVisitWestern');
    const china = el('section', results);
    china.className = 'birthday-result';
    el('p', china, '中国传统值日星宿');
    chineseTitle = el('h3', china);
    chineseWhy = el('p', china);
    chineseVisit = button(china, '在巡天中查看', () => visit('chinese'), 'birthdayVisitChinese');
    boundary = el('p', controls, null, 'birthdayBoundary');
    const details = el('details', controls);
    el('summary', details, '为什么对应这些星座与星宿？');
    el(
      'p',
      details,
      '西方按生日的太阳黄经确定十二宫，交界日补填出生时间即可确定。中国值日星宿是一套传统纪日规则，按所填公历日期的日支与星期配宿，午夜换日。卡片展示各自对应天区的星图与插画。'
    );
    el('p', details, BIRTHDAY_CULTURE_NOTE);
    time = field(details, '出生时间（交界日需要）', 'input', 'birthdayTime');
    time.type = 'time';
    zone = field(details, '时区（UTC 小时偏移）', 'input', 'birthdayZone');
    zone.type = 'number';
    zone.min = '-12';
    zone.max = '14';
    zone.step = '.25';
    zone.value = '8';
    el(
      'p',
      details,
      '默认 UTC+8。所填公历日期直接用于值日星宿，时区用于计算西方生日星座。生日信息仅在本机计算。'
    );
    const sources = el('p', details);
    for (const [label, href] of [
      ['十二宫与节气', 'https://www.hko.gov.hk/tc/gts/time/24solarterms.htm'],
      ['二十八宿配日', 'https://www.shidianguji.com/zh/book/SK1619/chapter/1l9llosnxblsy'],
      ['值日规则与来源', 'docs/birthday-calendar-sources.md'],
    ]) {
      const a = el('a', sources, label);
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      sources.append(document.createTextNode(' · '));
    }
    mode = field(controls, '卡片组合', 'select', 'birthdayMode');
    for (const [value, label] of [
      ['dual', '中西双联卡'],
      ['western', '西方单卡'],
      ['chinese', '东方单卡'],
    ]) {
      const option = el('option', mode, label);
      option.value = value;
    }
    layout = field(controls, '画面样式', 'select', 'birthdayLayout');
    for (const [value, label] of [
      ['card', '生日纪念卡'],
      ['sky', '纯星图'],
    ]) {
      const option = el('option', layout, label);
      option.value = value;
    }
    const words = el('details', controls);
    words.open = true;
    el('summary', words, '祝福与画面');
    westernText = field(words, '西方卡祝福语', 'textarea', 'birthdayWesternWish');
    westernText.maxLength = 120;
    button(words, '换一句', () => changeBlessing('western'));
    chineseText = field(words, '东方卡祝福语', 'textarea', 'birthdayChineseWish');
    chineseText.maxLength = 120;
    button(words, '换一句', () => changeBlessing('chinese'));
    const range = (label, id, value) => {
      const input = field(words, label, 'input', id);
      input.type = 'range';
      input.min = '0';
      input.max = '2';
      input.step = '.05';
      input.value = String(value);
      return input;
    };
    westernBrightness = range(
      '星座插画亮度',
      'birthdayWesternBrightness',
      sim.environment.settings.westernArtBrightness ?? 1
    );
    chineseBrightness = range(
      '星官插画亮度',
      'birthdayChineseBrightness',
      sim.environment.settings.chineseArtBrightness ?? 1
    );
    const check = (label, id) => {
      const row = el('label', words);
      row.className = 'birthday-check';
      const input = el('input', row, null, id);
      input.type = 'checkbox';
      input.checked = true;
      el('span', row, label);
      return input;
    };
    lines = check('显示星图连线', 'birthdayLines');
    explanation = check('显示简短介绍', 'birthdayExplanation');
    blessing = check('显示祝福语', 'birthdayBlessing');
    const backOptions = el('details', controls);
    el('summary', backOptions, '背面星空取景');
    el('p', backOptions, '使用软件内的银河与星空场景，对准对应星座或星宿；正反面共用所选组合。');
    backTimeNote = el('p', backOptions, null, 'birthdayBackTimeNote');
    const backCheck = (label, id, checked) => {
      const row = el('label', backOptions);
      row.className = 'birthday-check';
      const input = el('input', row, null, id);
      input.type = 'checkbox';
      input.checked = checked;
      el('span', row, label);
      return input;
    };
    backLabels = backCheck('背面显示星名', 'birthdayBackLabels', true);
    backArtwork = backCheck('背面叠加插画', 'birthdayBackArtwork', false);
    const actions = el('div', controls);
    actions.className = 'birthday-actions';
    generate = button(actions, '生成预览', render, 'birthdayGenerate');
    generate.className = 'birthday-primary';
    download = button(actions, '导出当前面 PNG', save, 'birthdayDownload');
    downloadPair = button(actions, '保存正反两面 ZIP', savePair, 'birthdayDownloadPair');
    download.disabled = true;
    const panel = el('section', body);
    panel.className = 'birthday-preview';
    const tabs = el('div', panel);
    tabs.className = 'birthday-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', t('贺卡正反面'));
    frontTab = button(tabs, '正面 · 祝福', () => activateSide('front'), 'birthdayFrontTab');
    backTab = button(tabs, '背面 · 星空', () => activateSide('back'), 'birthdayBackTab');
    for (const [index, tab] of [frontTab, backTab].entries()) {
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(index === 0));
      tab.tabIndex = index === 0 ? 0 : -1;
      tab.onkeydown = (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next =
          event.key === 'Home'
            ? 'front'
            : event.key === 'End'
              ? 'back'
              : activeSide === 'front'
                ? 'back'
                : 'front';
        activateSide(next);
        (next === 'front' ? frontTab : backTab).focus();
      };
    }
    const area = el('div', panel);
    area.className = 'birthday-image-area';
    placeholder = el('div', area);
    placeholder.className = 'birthday-placeholder';
    el('strong', placeholder, '把祝福写进星空');
    el('p', placeholder, '填写生日，选择中西星空，生成一张属于这个日子的纪念卡。');
    preview = el('img', area, null, 'birthdayPreview');
    preview.hidden = true;
    status = el('p', panel, null, 'birthdayStatus');
    status.setAttribute('role', 'status');
    for (const input of [date, time, zone]) input.onchange = () => calculate();
    for (const input of [
      name,
      sender,
      giftDate,
      westernText,
      chineseText,
      westernBrightness,
      chineseBrightness,
    ])
      input.oninput = invalidate;
    for (const input of [mode, layout, lines, explanation, blessing, backLabels, backArtwork])
      input.onchange = invalidate;
    dialog.addEventListener('keydown', (event) => event.stopPropagation());
    dialog.addEventListener('close', () => {
      generation++;
      controller?.abort();
      controller = null;
      generate.disabled = false;
      pages = { front: null, back: null };
      download.disabled = true;
      revoke();
      preview.removeAttribute('src');
      preview.hidden = true;
      placeholder.hidden = false;
      opener.focus({ preventScroll: true });
      sim.lastWall = performance.now();
    });
  }
  function open() {
    const firstOpen = !dialog;
    if (firstOpen) create();
    if (!dialog.open) dialog.showModal();
    calculate(firstOpen);
    render();
  }
  opener.onclick = open;
  onLanguageChange(() => {
    if (!dialog) return;
    for (const [node, key] of translations) node.nodeValue = t(key);
    calculate(false);
  });
  return { open };
}
