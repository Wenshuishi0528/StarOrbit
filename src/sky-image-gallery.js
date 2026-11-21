import { t, getLanguage, onLanguageChange } from './i18n.js';
import { deepSkyTypeName } from './deep-sky-catalog.js';
import { createSkyImageIndex, galleryEntry, panstarrsCovers } from './sky-image-index.js';
import { loadGalleryThumbnail } from './sky-image-thumbnail.js';

const filters = [
  ['featured', '精选'],
  ['all', '全部影像'],
  ['recent', '韦伯图集'],
  ['dss', 'DSS 光学'],
  ['panstarrs', 'Pan-STARRS 光学'],
];
const pageSize = 18;
const sourceLabel = (source) => t(filters.find(([id]) => id === source)?.[1] || '');
const make = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
};
const button = (label, click, cls) => {
  const el = make('button', cls, label);
  el.type = 'button';
  el.addEventListener('click', click);
  return el;
};
const keyOf = (entry) => entry.source + ':' + entry.id;

// Every thumbnail job belongs to a visible card in the open dialog. Network and
// decoded image lifetimes are independent of the simulation's HD tile manager.
function visibleThumbnails(root, load, failed) {
  const memory = new Map(),
    slots = new Map(),
    urls = new Set();
  let active = 0;
  const draw = (img, blob) => {
    const url = URL.createObjectURL(blob);
    urls.add(url);
    img.src = url;
    img.hidden = false;
  };
  function pump() {
    if (active >= 2) return;
    for (const [img, slot] of slots) {
      if (!slot.queued || !slot.visible) continue;
      slot.queued = false;
      const controller = new AbortController();
      slot.controller = controller;
      active++;
      load(slot.entry, controller.signal)
        .then((blob) => {
          if (controller.signal.aborted || slots.get(img) !== slot) return;
          const key = keyOf(slot.entry);
          memory.set(key, blob);
          if (memory.size > 40) memory.delete(memory.keys().next().value);
          draw(img, blob);
          observer.unobserve(slot.target);
        })
        .catch(() => {
          if (!controller.signal.aborted && slots.get(img) === slot) failed();
        })
        .finally(() => {
          active--;
          if (slot.controller === controller) slot.controller = null;
          pump();
        });
      if (active >= 2) break;
    }
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const item of entries) {
        const img = item.target.firstElementChild,
          slot = slots.get(img);
        if (!slot) continue;
        slot.visible = item.isIntersecting;
        clearTimeout(slot.timer);
        if (!slot.visible) {
          slot.queued = false;
          slot.controller?.abort();
          continue;
        }
        const cached = memory.get(keyOf(slot.entry));
        if (cached) {
          draw(img, cached);
          observer.unobserve(item.target);
        } else {
          slot.timer = setTimeout(() => {
            slot.queued = true;
            pump();
          }, 90);
        }
      }
    },
    { root }
  );
  return {
    add(entry) {
      const frame = make('div', 'sig-thumb'),
        img = make('img');
      img.alt = '';
      img.hidden = true;
      frame.append(img);
      slots.set(img, {
        entry,
        target: frame,
        visible: false,
        queued: false,
        controller: null,
        timer: null,
      });
      observer.observe(frame);
      return frame;
    },
    get(entry) {
      return memory.get(keyOf(entry));
    },
    clear() {
      observer.disconnect();
      for (const slot of slots.values()) {
        clearTimeout(slot.timer);
        slot.queued = false;
        slot.controller?.abort();
      }
      slots.clear();
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    },
  };
}

export function mountSkyImageGallery({
  providers = [],
  works = [],
  onLocate,
  onSave,
  canLocate,
  canSave,
  getSavedPreview,
}) {
  let searchIndex,
    context = 'main',
    source = 'featured',
    query = '',
    page = 0,
    savedScroll = 0,
    selected = null,
    parentTarget = null,
    selectedSource = 'dss',
    opener = null,
    lastCardId = null,
    failed = false;
  const dialog = make('dialog', 'sky-image-gallery');
  dialog.id = 'skyImageGallery';
  dialog.setAttribute('aria-labelledby', 'skyGalleryTitle');
  const header = make('div', 'sig-head'),
    title = make('h2'),
    closeButton = button('', () => dialog.close(), 'sig-close');
  title.id = 'skyGalleryTitle';
  header.append(title, closeButton);
  const tool = make('div', 'sig-tools'),
    search = make('input'),
    filter = make('select');
  search.type = 'search';
  search.autocomplete = 'off';
  search.id = 'skyGallerySearch';
  filter.id = 'skyGalleryFilter';
  tool.append(search, filter);
  const scroller = make('div', 'sig-scroll'),
    feedback = make('p', 'sig-feedback');
  feedback.setAttribute('role', 'status');
  dialog.append(header, tool, feedback, scroller);
  document.body.append(dialog);
  function updateStatus() {
    const offline = navigator.onLine === false;
    feedback.textContent = offline
      ? t('当前离线，可搜索目录和查看已保存的影像。')
      : failed
        ? t('部分预览暂未载入，仍可搜索和定位。')
        : '';
    feedback.hidden = !feedback.textContent;
  }
  const images = visibleThumbnails(
    scroller,
    async (entry, signal) => {
      let saved;
      try {
        saved = await getSavedPreview?.(entry);
      } catch {
        /* A blocked local store still permits online previews. */
      }
      signal.throwIfAborted();
      return saved || loadGalleryThumbnail(entry, providers, signal);
    },
    () => {
      failed = true;
      updateStatus();
    }
  );
  function setLabels() {
    title.textContent = t('浏览星空影像');
    closeButton.textContent = t('关闭');
    search.placeholder = t('搜索天体、编号或作品');
    search.setAttribute('aria-label', search.placeholder);
    filter.setAttribute('aria-label', t('筛选影像'));
    filter.replaceChildren(
      ...filters.map(([value, label]) => {
        const option = make('option', null, t(label));
        option.value = value;
        return option;
      })
    );
    filter.value = source;
    search.value = query;
  }
  function caption(entry) {
    if (entry.work)
      return ['ESA/Webb', entry.work.bands]
        .filter((s, i, a) => s && a.indexOf(s) === i)
        .join(' · ');
    const type = deepSkyTypeName(entry.object.type, getLanguage());
    return [entry.title.includes(entry.id) ? '' : entry.id, type, sourceLabel(entry.source)]
      .filter(Boolean)
      .join(' · ');
  }
  function clearContent() {
    images.clear();
    scroller.replaceChildren();
    failed = false;
    updateStatus();
  }
  function showDetails(row) {
    selected = row;
    const entry = galleryEntry(row, selectedSource, getLanguage());
    clearContent();
    tool.hidden = true;
    const back = button(
      parentTarget ? t('返回天体') : t('返回目录'),
      () => {
        if (parentTarget) {
          const previous = parentTarget;
          parentTarget = null;
          selectedSource = previous.source;
          showDetails(previous.row);
          return;
        }
        selected = null;
        renderList();
        Array.from(scroller.querySelectorAll('[data-entry]'))
          .find((el) => el.dataset.entry === lastCardId)
          ?.focus({ preventScroll: true });
      },
      'sig-back'
    );
    const detail = make('article', 'sig-detail');
    const picture = images.add(entry);
    const text = make('div', 'sig-info'),
      name = make('h3', null, entry.title);
    const provider = providers.find(
      (p) =>
        p.id ===
        (entry.source === 'panstarrs'
          ? 'panstarrs'
          : entry.source === 'dss'
            ? 'dss-color'
            : entry.providerId)
    );
    text.append(name, make('p', 'sig-meta', caption(entry)));
    if (entry.object && panstarrsCovers(entry.object)) {
      const selector = make('select');
      selector.setAttribute('aria-label', t('星空影像'));
      for (const id of ['dss', 'panstarrs']) {
        const option = make('option', null, sourceLabel(id));
        option.value = id;
        selector.append(option);
      }
      selector.value = selectedSource;
      selector.onchange = () => {
        selectedSource = selector.value;
        showDetails(row);
        textFocus();
      };
      text.append(selector);
    }
    const credit = entry.work?.credit || provider?.credit;
    if (credit) text.append(make('p', 'sig-credit', credit));
    const href = entry.work?.sourceUrl || provider?.sourceUrl;
    if (href) {
      const link = make('a', null, t('影像来源'));
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      text.append(link);
    }
    const actions = make('div', 'sig-actions'),
      status = make('p', 'sig-meta');
    status.setAttribute('role', 'status');
    const aimable = entry.kind === 'object' || !!entry.providerId;
    if (aimable) {
      const addPointing = (view, primary) => {
        const available = !!onLocate && canLocate?.(entry, view) !== false;
        if (!available && !primary) return;
        const aim = button(
          view === 'xuntian' ? t('巡天取景') : t('主画面定位'),
          async () => {
            const ok = await onLocate(entry, view);
            if (ok !== false) dialog.close();
            else status.textContent = t('当前视角暂时无法定位。');
          },
          primary ? 'sig-primary' : undefined
        );
        aim.disabled = !available;
        if (!available)
          status.textContent =
            view === 'xuntian' ? t('巡天取景需切换至中国空间站。') : t('当前视角暂时无法定位。');
        actions.append(aim);
      };
      addPointing(context, true);
      addPointing(context === 'xuntian' ? 'main' : 'xuntian', false);
      if (canSave?.(entry) !== false && onSave) {
        const save = button(t(entry.work ? '下载这幅影像' : '下载此天区'), async () => {
          const result = await onSave(entry, context, images.get(entry));
          if (typeof result === 'string') status.textContent = result;
        });
        actions.append(save);
      } else if (provider?.tiles && entry.providerId === 'jwst-carina-2022') {
        actions.append(make('span', 'sig-meta', t('内置离线')));
      }
    } else status.textContent = t('此作品提供图像预览。');
    text.append(actions, status);
    if (entry.object) {
      const linked = searchIndex.related(entry.object);
      if (linked.length) {
        const group = make('details', 'sig-related'),
          summary = make('summary', null, t('相关韦伯影像（{count}）', { count: linked.length }));
        group.append(summary);
        for (const item of linked) {
          const linkedEntry = galleryEntry(item, 'recent', getLanguage());
          group.append(
            button(linkedEntry.title, () => {
              parentTarget = { row, source: selectedSource };
              selectedSource = 'recent';
              showDetails(item);
            })
          );
        }
        text.append(group);
      }
    }
    detail.append(picture, text);
    scroller.append(back, detail);
    scroller.scrollTop = 0;
    back.focus({ preventScroll: true });
  }
  function textFocus() {
    scroller.querySelector('.sig-info select')?.focus({ preventScroll: true });
  }
  function renderList() {
    tool.hidden = false;
    searchIndex ??= createSkyImageIndex(works);
    const results = searchIndex(query, source);
    const count = results.length,
      pages = Math.max(1, Math.ceil(count / pageSize));
    page = Math.min(page, pages - 1);
    clearContent();
    const list = make('div', 'sig-grid');
    for (const row of results.slice(page * pageSize, (page + 1) * pageSize)) {
      const entry = galleryEntry(row, source, getLanguage());
      const card = button(
        '',
        () => {
          savedScroll = scroller.scrollTop;
          selectedSource = entry.source;
          lastCardId = keyOf(entry);
          showDetails(row);
        },
        'sig-card'
      );
      card.dataset.entry = keyOf(entry);
      card.append(
        images.add(entry),
        make('strong', null, entry.title),
        make('small', null, caption(entry))
      );
      list.append(card);
    }
    if (!count) list.append(make('p', 'sig-meta', t('没有找到匹配的影像。')));
    const pager = make('div', 'sig-pager');
    const turn = (delta) => {
      page += delta;
      savedScroll = 0;
      renderList();
      scroller.querySelector('.sig-card')?.focus({ preventScroll: true });
    };
    const prev = button(t('上一页'), () => turn(-1)),
      next = button(t('下一页'), () => turn(1));
    prev.disabled = page === 0;
    next.disabled = page + 1 >= pages;
    if (pages > 1)
      pager.append(
        prev,
        make('span', null, t('第 {page} / {total} 页', { page: page + 1, total: pages })),
        next
      );
    scroller.append(list, pager);
    scroller.scrollTop = savedScroll;
  }
  function refresh() {
    if (!dialog.open) return;
    if (!selected) savedScroll = scroller.scrollTop;
    setLabels();
    if (selected) showDetails(selected);
    else renderList();
  }
  function resetList() {
    page = 0;
    savedScroll = 0;
    selected = null;
    renderList();
  }
  search.oninput = () => {
    query = search.value;
    resetList();
  };
  filter.onchange = () => {
    source = filter.value;
    resetList();
  };
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
  scroller.addEventListener('scroll', () => {
    if (dialog.open && !selected) savedScroll = scroller.scrollTop;
  });
  dialog.addEventListener('close', () => {
    selected = null;
    images.clear();
    scroller.replaceChildren();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  });
  window.addEventListener('online', refresh);
  window.addEventListener('offline', () => {
    if (dialog.open) updateStatus();
  });
  onLanguageChange(refresh);
  return {
    open(options = {}) {
      if (dialog.open) return;
      context = options.context || 'main';
      if (filters.some(([id]) => id === options.source) && source !== options.source) {
        source = options.source;
        page = 0;
        savedScroll = 0;
        query = '';
      }
      opener = options.opener || document.activeElement;
      selected = null;
      parentTarget = null;
      setLabels();
      dialog.showModal();
      renderList();
      search.focus({ preventScroll: true });
    },
    close() {
      if (dialog.open) dialog.close();
    },
    refresh,
  };
}
