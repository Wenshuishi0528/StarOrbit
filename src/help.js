import { placeGuide, readingBounds } from './help-placement.js';
import { restoreControlFocus } from './display-controls.js';
import { getLanguage, onLanguageChange, t } from './i18n.js';
import { helpTourPages, loadHelpContent, loadedHelpContent } from './help-content.js';
import { manualLocations } from './help-locations.js';
import { findHelpAnswers, suggestedQuestions } from './help-questions.js';
import { runHelpExample, restoreHelpExample, hasHelpExample } from './help-examples.js';

const WELCOME_KEY = 'tiangong-help-v1';
const READING_KEY = 'starorbit-help-reading-v1';
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function button(label, click, className) {
  const el = node('button', label, className);
  el.type = 'button';
  el.onclick = click;
  return el;
}

function readProgress() {
  try {
    return JSON.parse(localStorage.getItem(READING_KEY)) || {};
  } catch {
    return {};
  }
}

export function installHelp(music) {
  const panel = $('helpPanel'),
    contents = $('helpContents'),
    welcome = $('welcomeDialog');
  const spotlight = $('helpSpotlight'),
    progress = readProgress();
  // 导览页随启动包提供；详细手册在首次打开帮助时才按当前语言载入。
  let data = loadedHelpContent(getLanguage()) || {
    tourPages: helpTourPages(getLanguage()),
    manualChapters: [],
  };
  let sections = data.manualChapters.flatMap((ch) => ch.sections);
  let view = 'home',
    tourOrigin = null,
    manualOrigin = null,
    location = null,
    directoryFocus = '',
    search = '',
    searchIndex;
  let tourId = validTour(progress.tour)?.id || data.tourPages[0].id;
  // 各语言小节 ID 相同；手册载入后再校验上次阅读位置。
  let sectionId = validSection(progress.section)?.id || sections[0]?.id || progress.section;
  let lastMode = ['tour', 'manual'].includes(progress.mode) ? progress.mode : '';
  let visitedTour = !!progress.visitedTour || lastMode === 'tour';
  let visitedManual = !!progress.visitedManual || lastMode === 'manual';
  let manualOffset = Number.isFinite(progress.offset) ? Math.max(0, progress.offset) : 0;
  let marked = null,
    returnFocus = null,
    restore = [],
    frame = 0,
    selector = '';
  let busyExample = false,
    statusMessage = '',
    practiceOpen = false,
    loadTicket = 0,
    opening = null;
  const openChapters = new Set();
  const workspacePanels = 'dialog, .world-explorer, .planet-observatory, #xuntianScope';
  const openWorkspaces = () =>
    Array.from(document.querySelectorAll(workspacePanels)).filter((el) =>
      el.tagName === 'DIALOG' ? el.open : !el.hidden
    );
  let previouslyOpen = new Set();
  const dirScroll = { tourIndex: 0, manualIndex: 0 };

  function validTour(id) {
    return data.tourPages.find((page) => page.id === id);
  }
  function validSection(id) {
    return sections.find((s) => s.id === id);
  }
  function chapterOf(id) {
    return data.manualChapters.find((ch) => ch.sections.some((s) => s.id === id));
  }
  function saveProgress() {
    if (!lastMode) return;
    try {
      localStorage.setItem(
        READING_KEY,
        JSON.stringify({
          tour: tourId,
          section: sectionId,
          mode: lastMode,
          offset: manualOffset,
          visitedTour,
          visitedManual,
        })
      );
    } catch {}
  }
  function rememberPosition() {
    if (view === 'manual') manualOffset = contents.scrollTop;
    if (view === 'manualIndex' || view === 'tourIndex') dirScroll[view] = contents.scrollTop;
    saveProgress();
  }

  function clearTarget() {
    observer.disconnect();
    cancelAnimationFrame(frame);
    frame = 0;
    panel.style.maxHeight = '';
    marked?.classList.remove('tour-highlight');
    marked = null;
    spotlight.toggleAttribute('hidden', true);
    for (const fn of restore.reverse()) fn();
    restore = [];
  }
  // Hidden collapsible sections and menus can be revealed without running their commands.
  const revealable = '.settings-content, #toolbarActions, #viewActions, #musicExpanded';
  function availableLocation(entry) {
    const el = document.querySelector(entry.selector);
    if (!el || el.matches(':disabled') || el.closest('[inert], [aria-disabled="true"]'))
      return null;
    for (let part = el; part && part !== document.body; part = part.parentElement) {
      if (!part.matches(revealable) && (part.hidden || getComputedStyle(part).display === 'none'))
        return null;
    }
    return el;
  }
  function revealLocationMenus(el) {
    for (const [menuId, toggleId] of [
      ['toolbarActions', 'toolsToggle'],
      ['viewActions', 'viewMenuToggle'],
    ]) {
      const menu = $(menuId),
        toggle = $(toggleId);
      if (menu.contains(el) && menu.hidden) {
        toggle.click();
        restore.push(() => {
          if (!menu.hidden && toggle.getAttribute('aria-expanded') === 'true') toggle.click();
        });
      }
    }
    const toolbar = el.closest('#toolbarActions');
    if (toolbar && toolbar.scrollHeight > toolbar.clientHeight) {
      const previous = toolbar.scrollTop;
      el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      restore.push(() => {
        toolbar.scrollTop = previous;
      });
    }
  }
  function findTarget() {
    if (!selector) return null;
    const el = document.querySelector(selector);
    if (view === 'location') return availableLocation(location);
    if (el?.hidden && el.id === 'openXuntianMap') return $('missionSelect');
    if (el?.closest('#toolbarActions')?.hidden) return $('toolsToggle');
    return el;
  }
  function schedule() {
    if (
      panel.hidden ||
      panel.hasAttribute('data-visiting') ||
      (view !== 'tour' && view !== 'location') ||
      frame
    )
      return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (panel.hasAttribute('data-visiting')) return;
      for (const control of contents.querySelectorAll('[data-help-port]')) {
        control.disabled = !document.querySelector(control.dataset.helpPort);
      }
      if (view === 'location' && !findTarget()) {
        returnToSection();
        return;
      }
      if (findTarget() !== marked) highlight();
      else place();
    });
  }
  const observer = new ResizeObserver(schedule);
  function highlight() {
    clearTarget();
    const el = findTarget();
    if (!el) return;
    if (view === 'location') revealLocationMenus(el);
    if (el.closest('#musicExpanded')) {
      const expanded = music.dock.expanded;
      music.dock.guided = true;
      music.dock.expand();
      restore.push(() => {
        music.dock.guided = false;
        if (!expanded) music.dock.collapse();
      });
    }
    const content = el.closest('.settings-content');
    if (content?.hidden) {
      content.hidden = false;
      const trigger = document.querySelector(`[aria-controls="${content.id}"]`);
      trigger?.setAttribute('aria-expanded', 'true');
      restore.push(() => {
        content.hidden = true;
        trigger?.setAttribute('aria-expanded', 'false');
      });
    }
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS' && !parent.open) {
        const detail = parent;
        detail.open = true;
        restore.push(() => (detail.open = false));
      }
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
    place();
  }
  function place() {
    if (!marked || panel.hidden) return;
    const w = innerWidth,
      h = innerHeight,
      raw = readingBounds(marked),
      aside = marked.closest('aside'),
      menu = marked.closest('#toolbarActions'),
      scrollArea = aside || (menu?.clientHeight ? menu : null),
      clip = scrollArea?.getBoundingClientRect();
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
      panel.style.left = panel.style.top = panel.style.maxHeight = '';
      spotlight.toggleAttribute('hidden', true);
      return;
    }
    const r = { left: left - 4, right: right + 4, top: top - 4, bottom: bottom + 4 },
      cx = (left + right) / 2,
      cy = (top + bottom) / 2;
    // Measure the normal card again on resize, font reflow or a changed topic.
    panel.style.maxHeight = '';
    const workspace = scrollArea || marked.closest('.toolbar, #xuntianScope');
    const position = placeGuide(
      r,
      workspace?.getBoundingClientRect(),
      w,
      h,
      panel.offsetWidth,
      panel.offsetHeight
    );
    panel.style.maxHeight = position.maxHeight + 'px';
    const pw = panel.offsetWidth,
      ph = panel.offsetHeight;
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
  const nightTip =
    '画面很暗？空间站可能正飞过夜晚的海面。等它飞到阳光下，或把轨道时间轴拖到金色的日照段。';
  function leaveExample() {
    if (busyExample || hasHelpExample()) {
      // The controller serializes restore even if the first target is still loading.
      restoreHelpExample().catch((error) => console.warn('StarOrbit help example', error));
    }
  }
  function useContent(content) {
    if (content === data) return;
    data = content;
    sections = data.manualChapters.flatMap((c) => c.sections);
    searchIndex = undefined;
    tourId = validTour(tourId)?.id || data.tourPages[0].id;
    sectionId = validSection(sectionId)?.id || sections[0].id;
  }
  function showLoadState(message, retry) {
    clearTarget();
    locationAvailability.disconnect();
    workspaceObserver.disconnect();
    locationLinks.replaceChildren();
    locationLinks.hidden = true;
    panel.classList.remove('guiding', 'reading');
    panel.dataset.helpView = 'loading';
    panel.style.left = panel.style.top = '';
    $('helpProgress').textContent = 'StarOrbit';
    $('helpTitle').textContent = t('星轨使用帮助');
    $('helpDirectory').hidden = $('helpSwitch').hidden = $('tourActions').hidden = true;
    const note = node('p', t(message), 'help-status');
    note.setAttribute('role', retry ? 'alert' : 'status');
    contents.replaceChildren(note);
    if (retry) contents.append(button(t('重试'), retry, 'primary'));
    panel.focus({ preventScroll: true });
  }
  // 取得当前语言的手册后再执行 done；过期的载入结果（已关闭、重新打开或又切换语言）丢弃。
  // quiet 用于帮助已打开时切换语言：新手册就绪前保留现有内容，失败时也不打断阅读。
  function withContent(done, quiet = false) {
    const language = getLanguage(),
      ticket = ++loadTicket,
      ready = loadedHelpContent(language);
    if (ready) {
      useContent(ready);
      done();
      return;
    }
    if (!quiet) showLoadState('正在载入…');
    loadHelpContent(language).then(
      (content) => {
        if (ticket !== loadTicket || panel.hidden) return;
        useContent(content);
        done();
      },
      (error) => {
        console.error('StarOrbit help manual', language, error);
        if (ticket !== loadTicket || panel.hidden || quiet) return;
        showLoadState('帮助内容未能载入，请检查网络后重试。', () => withContent(done));
      }
    );
  }
  function go(nextView, id, options = {}) {
    if (!sections.length) return;
    rememberPosition();
    if (!(nextView === view && (nextView === 'tour' ? id === tourId : id === sectionId)))
      leaveExample();
    if (view === 'tour' && manualOrigin && nextView !== 'manual') manualOrigin = null;
    if (nextView === 'home') {
      tourOrigin = null;
      manualOrigin = null;
    }
    clearTarget();
    panel.removeAttribute('data-visiting');
    if (nextView === 'location') previouslyOpen = new Set(openWorkspaces());
    location = options.location || null;
    selector = location?.selector || '';
    view = nextView;
    statusMessage = '';
    practiceOpen = false;
    if (view === 'tour') {
      tourId = validTour(id)?.id || data.tourPages[0].id;
      lastMode = 'tour';
      visitedTour = true;
    } else if (view === 'manual') {
      if (sectionId !== id || !options.resume) manualOffset = 0;
      sectionId = validSection(id)?.id || sections[0].id;
      lastMode = 'manual';
      visitedManual = true;
    }
    // Focus first so opening a compact toolbar can survive its outside-focus handler.
    panel.focus({ preventScroll: true });
    render();
    saveProgress();
    if (view === 'location') marked?.focus({ preventScroll: true });
  }
  function topicRow(parent, label, callback, key, id) {
    const item = button(label, callback, 'help-topic');
    item.dataset[key] = id;
    if (directoryFocus === id) item.setAttribute('aria-current', 'location');
    parent.append(item);
    return item;
  }
  function home() {
    const form = node('form', undefined, 'help-question-form');
    const label = node('label', t('问使用问题'));
    label.htmlFor = 'helpQuestion';
    const input = node('input');
    input.type = 'search';
    input.id = 'helpQuestion';
    input.placeholder = t('输入你的问题');
    input.autocomplete = 'off';
    const ask = node('button', t('查找答案'));
    ask.type = 'submit';
    const result = node('div', undefined, 'help-question-results');
    result.setAttribute('aria-live', 'polite');
    const samples = node('div', undefined, 'help-question-samples');
    function answer() {
      search = input.value.trim();
      result.replaceChildren();
      samples.hidden = !!search;
      if (!search) return;
      if (!answerCards(result, search)) {
        const related = searchSections(search).slice(0, 3);
        result.append(node('p', t('暂未收录这个问法。可换个关键词，或向项目反馈。')));
        for (const section of related)
          result.append(button(section.title, () => go('manual', section.id), 'help-inline-link'));
        const feedback = node('a', t('向项目反馈'));
        feedback.href = 'https://github.com/Wenshuishi0528/StarOrbit/issues/new';
        feedback.target = '_blank';
        feedback.rel = 'noopener noreferrer';
        result.append(feedback);
      }
    }
    for (const question of suggestedQuestions(getLanguage()))
      samples.append(
        button(
          question,
          () => {
            input.value = question;
            answer();
          },
          'help-inline-link'
        )
      );
    input.oninput = answer;
    form.onsubmit = (event) => {
      event.preventDefault();
      answer();
    };
    form.append(label, input, ask);
    contents.append(form, samples, result);
    const modes = node('div', undefined, 'help-modes');
    const start = button(t('简易导览'), () => go('tour', data.tourPages[0].id), 'primary');
    start.id = 'replayTour';
    const manual = button(t('详细手册'), () => {
      tourOrigin = null;
      go('manualIndex');
    });
    manual.id = 'helpManual';
    const keys = button(t('航天器操控键'), () => {
      close();
      document.dispatchEvent(
        new CustomEvent('starorbit:open-controls', { detail: { mode: 'spacecraft' } })
      );
    });
    keys.id = 'helpSpacecraftKeys';
    modes.append(start, manual, keys);
    contents.append(modes);
    if (lastMode) {
      const isTour = lastMode === 'tour';
      const label = isTour ? validTour(tourId).title : validSection(sectionId).title;
      const resume = button(
        t('继续上次：{title}', { title: label }),
        () => {
          tourOrigin = null;
          go(isTour ? 'tour' : 'manual', isTour ? tourId : sectionId, { resume: true });
        },
        'help-resume'
      );
      resume.id = 'helpResume';
      contents.append(resume);
    }
    contents.append(node('p', t(nightTip), 'help-night'));
  }
  function answerCards(parent, query) {
    const matches = findHelpAnswers(query, getLanguage());
    for (const match of matches) {
      const card = node('article', undefined, 'help-answer-card');
      card.append(node('strong', match.question), node('p', match.answer));
      const target = manualLocations[match.section]?.find(availableLocation);
      if (target)
        card.append(
          button(
            t('带我去'),
            () => {
              sectionId = match.section;
              go('location', sectionId, { location: target });
            },
            'help-inline-link'
          )
        );
      card.append(button(t('查看详细说明'), () => go('manual', match.section), 'help-inline-link'));
      parent.append(card);
    }
    return matches.length;
  }
  function searchSections(query) {
    if (!searchIndex) {
      const parser = document.createElement('template');
      searchIndex = new Map();
      for (const chapter of data.manualChapters) {
        for (const section of chapter.sections) {
          parser.innerHTML = section.html;
          searchIndex.set(
            section.id,
            (
              chapter.title +
              ' ' +
              section.title +
              ' ' +
              parser.content.textContent
            ).toLocaleLowerCase()
          );
        }
      }
    }
    const terms = query.trim().toLocaleLowerCase().split(/\s+/);
    return sections.filter((s) => terms.every((term) => searchIndex.get(s.id).includes(term)));
  }
  function indexResume(isTour) {
    if (isTour ? !visitedTour : !visitedManual) return;
    const page = isTour ? validTour(tourId) : validSection(sectionId);
    const resume = button(
      t('继续上次：{title}', { title: page.title }),
      () => go(isTour ? 'tour' : 'manual', page.id, { resume: true }),
      'help-resume'
    );
    contents.append(resume);
  }
  function manualIndex() {
    const input = node('input');
    input.type = 'search';
    input.id = 'helpSearch';
    input.placeholder = t('搜索按钮、功能或问题');
    input.setAttribute('aria-label', input.placeholder);
    input.value = search;
    const list = node('div', undefined, 'help-index');
    const addRow = (parent, section) =>
      topicRow(
        parent,
        section.title,
        () => {
          directoryFocus = section.id;
          go('manual', section.id);
        },
        'sectionId',
        section.id
      );
    function showResults() {
      list.replaceChildren();
      if (search.trim()) {
        answerCards(list, search);
        const results = searchSections(search);
        list.append(node('p', t('找到 {count} 个小节', { count: results.length }), 'help-count'));
        for (const section of results) addRow(list, section);
        return;
      }
      data.manualChapters.forEach((chapter, i) => {
        const group = node('details', undefined, 'help-topic-group');
        group.open = openChapters.has(chapter.id);
        group.dataset.chapterId = chapter.id;
        group.append(node('summary', i + 1 + '. ' + chapter.title));
        for (const section of chapter.sections) addRow(group, section);
        group.addEventListener('toggle', () => {
          if (!group.isConnected) return;
          if (group.open) openChapters.add(chapter.id);
          else openChapters.delete(chapter.id);
        });
        list.append(group);
      });
    }
    input.oninput = () => {
      search = input.value;
      contents.scrollTop = 0;
      showResults();
    };
    indexResume(false);
    contents.append(input, list);
    showResults();
  }

  const locatorLinks = {
    1: [['显示航天器名称', '#craftLabelsControl']],
    2: [['播放音乐', '#musicExpanded']],
    4: [['太阳翼控制', '#animate']],
    7: [['地球地点标识', '#geographyEnabled']],
    8: [
      ['显示导航球', '#attitudeNavball'],
      ['交会对接', '#openFlightLab'],
    ],
  };
  function pointAt(css) {
    selector = css;
    highlight();
  }
  function examples() {
    const actions = node('div', undefined, 'help-example-actions');
    const note = node('p', statusMessage, 'help-status');
    note.setAttribute('role', 'status');
    const labels = { vega: '看织女星', beijing: '看北京', restore: '回到原场景' };
    for (const [key, label] of Object.entries(labels)) {
      const item = button(t(label), async () => {
        if (busyExample) return;
        if (view === 'manual' && key !== 'restore') {
          // The compact guide leaves the telescope and its exterior view visible.
          manualOrigin = { id: sectionId, offset: contents.scrollTop };
          go('tour', 'xuntian');
          contents.querySelector(`[data-help-example="${key}"]`)?.click();
          return;
        }
        busyExample = true;
        updateButtons();
        note.textContent = t('正在准备…');
        try {
          if (key === 'restore') await restoreHelpExample();
          else await runHelpExample(key);
          if (item.isConnected) {
            statusMessage =
              key === 'restore' ? t('已回到原场景') : t('示例已暂停 · 2026-11-05 13:44（UTC+8）');
            note.textContent = statusMessage;
            if (view === 'tour')
              pointAt(key === 'restore' ? validTour(tourId).target : '#xtCanvas');
          }
        } catch (error) {
          note.textContent = t(error.message || '操作失败');
        } finally {
          busyExample = false;
          updateButtons();
          // A different help page may have been opened before loading finished.
          updateExampleControls();
        }
      });
      item.dataset.helpExample = key;
      actions.append(item);
    }
    function updateButtons() {
      for (const item of actions.children)
        item.disabled =
          busyExample || (item.dataset.helpExample === 'restore' && !hasHelpExample());
    }
    contents.append(actions, note);
    updateButtons();
  }
  function updateExampleControls() {
    for (const item of contents.querySelectorAll('[data-help-example]'))
      item.disabled = busyExample || (item.dataset.helpExample === 'restore' && !hasHelpExample());
  }
  function tourPage(page, pageNumber) {
    selector = page.target;
    const text =
      page.touchText && matchMedia('(pointer: coarse)').matches ? page.touchText : page.text;
    if (page.mouse && !matchMedia('(pointer: coarse)').matches) {
      const gestures = node('div', undefined, 'help-mouse-guide');
      for (const [index, [name, action]] of page.mouse.entries()) {
        const card = node('div');
        const mouse = node('span', undefined, 'help-mouse-figure');
        mouse.dataset.part = ['left', 'middle', 'right'][index];
        mouse.setAttribute('aria-hidden', 'true');
        mouse.append(node('i'), node('i'), node('i'));
        card.append(mouse, node('strong', name), node('span', action));
        gestures.append(card);
      }
      contents.append(gestures, node('p', page.exercise));
    } else for (const line of text.split('\n').filter(Boolean)) contents.append(node('p', line));
    if (page.practice) {
      const box = node('details', undefined, 'help-practice');
      box.open = practiceOpen;
      box.append(node('summary', page.practice.title));
      const list = node('ol');
      const ports = [
        '#TH_FORWARD',
        '[data-core="TH_FORWARD"] select[id="TH_FORWARD/TH_FORWARD"]',
        '#TH_FORWARD',
      ];
      page.practice.steps.forEach((line, i) => {
        const row = node('li', line);
        const id = ports[i];
        if (id) {
          const locate = button(t('定位接口'), () => pointAt(id), 'help-inline-link');
          locate.dataset.helpPort = id;
          locate.disabled = !document.querySelector(id);
          row.append(' ', locate);
        }
        list.append(row);
      });
      box.append(list);
      box.ontoggle = () => {
        practiceOpen = box.open;
        schedule();
      };
      contents.append(box);
    }
    if (page.extra) contents.append(node('p', page.extra, 'help-note'));
    if (pageNumber === 6) {
      if ($('openXuntianMap')?.hidden)
        contents.append(node('p', t('选择示例将进入中国空间站任务。'), 'help-note'));
      examples();
    }
    const links = node('div', undefined, 'help-locators');
    for (const [label, css] of locatorLinks[pageNumber] || []) {
      if (document.querySelector(css))
        links.append(button(t(label), () => pointAt(css), 'help-inline-link'));
    }
    if (links.children.length) contents.append(links);
  }
  function handleManualLinks(event) {
    const a = event.target.closest('a[href]');
    if (!a) return;
    const hash = a.getAttribute('href');
    if (!hash?.startsWith('#')) return;
    event.preventDefault();
    const id = hash.slice(1);
    const section = validSection(id) || data.manualChapters.find((c) => c.id === id)?.sections[0];
    if (section) go('manual', section.id);
  }
  const locationLinks = node('div', undefined, 'help-location-links');
  locationLinks.setAttribute('role', 'group');
  contents.before(locationLinks);
  const locationAvailability = new MutationObserver(() => {
    if (view === 'manual') refreshLocationButtons();
    if (view === 'location') schedule();
  });
  // Let modules use their own controls and Escape handling. Return to the article
  // after the last workspace opened during this location visit closes.
  function workspaceChanged() {
    if (view !== 'location' || panel.hidden) return;
    const visiting = openWorkspaces().some((el) => !previouslyOpen.has(el));
    if (visiting) {
      panel.setAttribute('data-visiting', '');
      spotlight.toggleAttribute('hidden', true);
    } else if (panel.hasAttribute('data-visiting')) returnToSection();
  }
  const workspaceObserver = new MutationObserver(workspaceChanged);
  document.addEventListener(
    'toggle',
    (e) => {
      if (e.target.tagName === 'DIALOG') workspaceChanged();
    },
    true
  );
  function watchLocation(el) {
    for (let part = el; part && part !== document.body; part = part.parentElement)
      locationAvailability.observe(part, {
        attributes: true,
        attributeFilter: ['hidden', 'disabled', 'inert'],
      });
  }
  function refreshLocationButtons() {
    for (const action of locationLinks.querySelectorAll('[data-help-locate]'))
      action.hidden = !availableLocation({ selector: action.dataset.helpLocate });
    locationLinks.hidden = !locationLinks.querySelector('button:not([hidden])');
  }
  function addLocationLinks() {
    const entries = manualLocations[sectionId] || [];
    if (!entries.length) return;
    const prompt = t('在界面中定位');
    locationLinks.setAttribute('aria-label', prompt);
    locationLinks.append(node('span', prompt));
    for (const entry of entries) {
      const action = button(
        t(entry.label),
        () => {
          if (availableLocation(entry)) go('location', sectionId, { location: entry });
          else refreshLocationButtons();
        },
        'help-inline-link'
      );
      action.setAttribute('aria-label', `${prompt} · ${t(entry.label)}`);
      action.dataset.helpLocate = entry.selector;
      locationLinks.append(action);
      watchLocation(document.querySelector(entry.selector));
    }
    refreshLocationButtons();
  }
  function returnToSection() {
    const previous = selector;
    go('manual', sectionId, { resume: true });
    Array.from(locationLinks.querySelectorAll('button'))
      .find((button) => !button.hidden && button.dataset.helpLocate === previous)
      ?.focus({ preventScroll: true });
  }
  function openIndex() {
    if (view === 'location') {
      returnToSection();
      return;
    }
    if (view === 'tour' || view === 'manual') {
      directoryFocus = view === 'tour' ? tourId : sectionId;
      if (view === 'manual') openChapters.add(chapterOf(sectionId).id);
      go(view === 'tour' ? 'tourIndex' : 'manualIndex');
    } else go('home');
  }
  function switchMode() {
    if (view === 'tour') {
      if (manualOrigin) {
        const back = manualOrigin;
        manualOrigin = null;
        manualOffset = back.offset;
        sectionId = back.id;
        go('manual', back.id, { resume: true });
        return;
      }
      const page = validTour(tourId);
      tourOrigin = tourId;
      go('manual', page.section || data.manualChapters[page.chapter - 1].sections[0].id);
    } else if (view === 'manual') {
      const ch = data.manualChapters.indexOf(chapterOf(sectionId)) + 1;
      const matching =
        data.tourPages.find((p) => p.section === sectionId) ||
        data.tourPages.find((p) => p.chapter === ch);
      if (!tourOrigin) manualOrigin = { id: sectionId, offset: contents.scrollTop };
      go('tour', tourOrigin || matching?.id || tourId);
      tourOrigin = null;
    } else go(view === 'tourIndex' ? 'manualIndex' : 'tourIndex');
  }
  function render() {
    const isTour = view === 'tour',
      isManual = view === 'manual',
      isLocation = view === 'location';
    const ordered = isTour ? data.tourPages : sections;
    const page = isTour ? validTour(tourId) : validSection(sectionId);
    const i = ordered.indexOf(page),
      chapter = isManual && chapterOf(sectionId);
    const manualNumber = isManual && data.manualChapters.indexOf(chapter) + 1;
    const tourLabel = t('实用指南');
    locationAvailability.disconnect();
    workspaceObserver.disconnect();
    locationLinks.replaceChildren();
    locationLinks.hidden = true;
    panel.classList.toggle('guiding', isTour || isLocation);
    panel.classList.toggle('reading', isManual || view === 'manualIndex');
    panel.dataset.helpView = view;
    panel.style.left = panel.style.top = '';
    $('helpProgress').textContent = isLocation
      ? page.title
      : isTour
        ? t('实用指南（{current}/{total}）', { current: i + 1, total: data.tourPages.length })
        : isManual
          ? t('详细手册（{current}/{total}）', {
              current: manualNumber,
              total: data.manualChapters.length,
            }) +
            ' · ' +
            chapter.title +
            ' (' +
            (chapter.sections.indexOf(page) + 1) +
            '/' +
            chapter.sections.length +
            ')'
          : view === 'tourIndex'
            ? tourLabel
            : view === 'manualIndex'
              ? t('详细手册')
              : 'StarOrbit';
    $('helpTitle').textContent = isLocation
      ? t(location.label)
      : isTour
        ? i + 1 + '. ' + page.title
        : isManual
          ? page.title
          : view === 'home'
            ? t('星轨使用帮助')
            : t(view === 'tourIndex' ? '简易导览目录' : '手册目录');
    $('helpDirectory').hidden = view === 'home';
    $('helpSwitch').hidden = view === 'home' || isLocation;
    $('helpDirectory').textContent = isLocation
      ? t('返回手册')
      : view === 'tourIndex' || view === 'manualIndex'
        ? t('帮助首页')
        : t('返回目录');
    $('helpSwitch').textContent = isTour
      ? t(manualOrigin ? '返回手册' : '查看详细说明')
      : isManual && tourOrigin
        ? t('返回导览第 {n} 页', { n: data.tourPages.findIndex((p) => p.id === tourOrigin) + 1 })
        : view === 'tourIndex'
          ? t('详细手册')
          : t('简易导览');
    $('tourActions').hidden = !(isTour || isManual);
    $('tourPrevious').disabled = i <= 0;
    $('tourNext').textContent = t(
      i === ordered.length - 1 ? (isTour ? '完成导览' : '完成阅读') : '下一页'
    );
    contents.replaceChildren();
    if (view === 'home') home();
    else if (view === 'tourIndex') {
      indexResume(true);
      data.tourPages.forEach((p, index) =>
        topicRow(
          contents,
          index + 1 + '. ' + p.title,
          () => {
            directoryFocus = p.id;
            go('tour', p.id);
          },
          'tourId',
          p.id
        )
      );
    } else if (view === 'manualIndex') manualIndex();
    else if (isTour) tourPage(page, i + 1);
    else if (isLocation) {
      watchLocation(document.querySelector(selector));
      for (const workspace of document.querySelectorAll(workspacePanels))
        workspaceObserver.observe(workspace, {
          attributes: true,
          attributeFilter: ['open', 'hidden'],
        });
    } else {
      addLocationLinks();
      const article = node('article', undefined, 'help-article');
      // HTML is generated from the bundled, reviewed handbook; no remote markup is used.
      article.innerHTML = page.html;
      for (const a of article.querySelectorAll('a[href^="https://"]')) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
      article.onclick = handleManualLinks;
      contents.append(article);
      if (sectionId === 's4-2') examples();
    }
    contents.scrollTop = isManual ? manualOffset : dirScroll[view] || 0;
    if (isTour || (isLocation && !panel.hasAttribute('data-visiting'))) highlight();
  }
  function advance(direction) {
    const isTour = view === 'tour';
    if (!isTour && view !== 'manual') return;
    const list = isTour ? data.tourPages : sections;
    const i = list.findIndex((p) => p.id === (isTour ? tourId : sectionId)) + direction;
    if (i === list.length) {
      close();
      return;
    }
    if (list[i]) go(view, list[i].id);
  }
  function showMode(mode) {
    opening = mode;
    withContent(() => {
      opening = null;
      go(mode, mode === 'tour' ? data.tourPages[0].id : undefined);
    });
  }
  function open(mode = 'home') {
    returnFocus = document.activeElement;
    panel.hidden = false;
    document.body.classList.add('help-active');
    $('helpToggle').setAttribute('aria-expanded', 'true');
    tourOrigin = null;
    manualOrigin = null;
    showMode(mode);
  }
  function close() {
    opening = null;
    rememberPosition();
    leaveExample();
    clearTarget();
    locationAvailability.disconnect();
    workspaceObserver.disconnect();
    panel.removeAttribute('data-visiting');
    location = null;
    view = 'home';
    panel.hidden = true;
    document.body.classList.remove('help-active');
    $('helpToggle').setAttribute('aria-expanded', 'false');
    restoreControlFocus(returnFocus);
  }
  $('helpToggle').onclick = () => (panel.hidden ? open() : close());
  $('closeHelp').onclick = close;
  $('helpDirectory').onclick = openIndex;
  $('helpSwitch').onclick = switchMode;
  $('tourPrevious').onclick = () => advance(-1);
  $('tourNext').onclick = () => advance(1);
  const seen = () => {
    try {
      localStorage.setItem(WELCOME_KEY, 'seen');
    } catch {}
  };
  function dismissWelcome(mode) {
    seen();
    welcome.close();
    if (music.settings.autoplay && music.audio.paused) music.play();
    if (mode) {
      open(mode);
      returnFocus = $('helpToggle');
    } else restoreControlFocus($('helpToggle'));
  }
  $('startTour').onclick = () => dismissWelcome('tour');
  $('welcomeManual').onclick = () => dismissWelcome('manualIndex');
  $('skipTour').onclick = () => dismissWelcome(null);
  welcome.addEventListener('cancel', seen);
  document.addEventListener(
    'keydown',
    (e) => {
      if (
        e.key === 'Escape' &&
        !panel.hidden &&
        !panel.hasAttribute('data-visiting') &&
        !document.querySelector('dialog[open]')
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (view === 'location') returnToSection();
        else close();
      }
    },
    true
  );
  window.addEventListener('resize', schedule);
  document.addEventListener('scroll', schedule, true);
  document.addEventListener('click', schedule);
  document.addEventListener('change', schedule);
  document.addEventListener('toggle', schedule, true);
  window.addEventListener('pagehide', () => {
    if (!panel.hidden) rememberPosition();
  });
  onLanguageChange(() => {
    // 帮助关闭时不载入；下次打开时取当前语言的手册。
    if (panel.hidden) return;
    if (opening) showMode(opening);
    else
      withContent(() => {
        rememberPosition();
        clearTarget();
        render();
      }, true);
  });
  let visited = false;
  try {
    visited = localStorage.getItem(WELCOME_KEY) === 'seen';
  } catch {}
  if (
    !visited &&
    !$('flightLab')?.open &&
    !$('freeFlightLauncher')?.open &&
    !document.body.classList.contains('xt-scope-open')
  )
    welcome.showModal();
}
