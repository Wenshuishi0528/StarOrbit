import { getLanguage, onLanguageChange, t } from './i18n.js';
import { getSkyCulture, cultureObjectLabel } from './sky-cultures.js';
import { galleryCoordinates } from './sky-image-index.js';
import { rayInView, skyAngles, localRegion } from './sky-location-math.js';
import { drawLocation } from './sky-location-draw.js';
import { objectTarget, objectSightline } from './sky-object-target.js';
import { bindSkyReading, formationSubject } from './sky-reading-view.js';
import { skyText } from './sky-tool-language.js';

const toolsForSim = new WeakMap();
const skyKinds = new Set(['sky', 'star', 'solar', 'deep-sky']);
const make = (tag, text, cls) => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
function button(text, click, key) {
  const node = make('button', text);
  node.type = 'button';
  node.onclick = click;
  node.dataset.skyAction = key;
  return node;
}
function panel(id, key, cls) {
  const root = make('section', null, 'sky-tool-window');
  root.id = id;
  root.hidden = true;
  root.setAttribute('role', 'region');
  const heading = make('div', null, 'sky-tool-heading');
  const title = make('strong', skyText(key));
  title.id = id + 'Title';
  root.setAttribute('aria-labelledby', title.id);
  const close = button('×', null, 'close');
  heading.append(title, close);
  const body = make('div', null, cls);
  root.append(heading, body);
  document.body.append(root);
  return { root, title, close, body, key, owner: null, opener: null };
}

function createSkyTools(sim) {
  const location = panel('skyLocationWindow', 'locator', 'sky-locator-body');
  const object = panel('skyObjectWindow', 'objects', 'sky-object-body');
  let selection = null,
    timer = 0,
    lastDrawing = '';
  const links = new Set();
  const banner = make('p'),
    panels = make('div', null, 'sky-locator-panels');
  const captions = [],
    maps = [];
  for (const key of ['local', 'globe']) {
    const fig = make('figure'),
      caption = make('figcaption', skyText(key)),
      canvas = make('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    fig.append(caption, canvas);
    panels.append(fig);
    captions.push(caption);
    maps.push(canvas);
  }
  const locCoords = make('p', null, 'sky-coordinates'),
    legend = make('p', null, 'sky-locator-legend');
  const explain = make('details'),
    explainTitle = make('summary', skyText('coords')),
    explainRA = make('p'),
    explainDec = make('p', skyText('decInfo'));
  explain.append(explainTitle, explainRA, explainDec);
  location.body.append(banner, panels, locCoords, legend);
  const regionReading = bindSkyReading(location.body, { expanded: true });
  location.body.append(explain);

  function updateButtons() {
    for (const binding of links) {
      for (const [node, key] of [
        [binding.location, 'locator'],
        [binding.object, 'objects'],
        [binding.coords, 'coords'],
      ])
        node.textContent =
          key === 'locator' && binding.compactLabel ? binding.compactLabel : skyText(key);
      binding.location.setAttribute(
        'aria-expanded',
        String(!location.root.hidden && location.owner === binding)
      );
      binding.object.setAttribute(
        'aria-expanded',
        String(!object.root.hidden && object.owner === binding)
      );
    }
  }
  function hide(pane, focus = true) {
    if (pane.root.hidden) return;
    pane.root.hidden = true;
    if (pane === location) {
      clearInterval(timer);
      timer = 0;
      lastDrawing = '';
    } else selection = null;
    const opener = pane.opener;
    pane.owner = null;
    pane.opener = null;
    if (focus && opener?.isConnected && opener.getClientRects().length)
      opener.focus({ preventScroll: true });
    updateButtons();
  }
  function show(pane, owner, opener) {
    pane.owner = owner;
    pane.opener = opener;
    pane.root.hidden = false;
    updateButtons();
  }
  function locatorTick() {
    if (!location.owner?.enabled()) {
      hide(location, false);
      return;
    }
    const view = location.owner.view();
    if (!view) {
      banner.textContent = skyText('unavailable');
      panels.hidden = true;
      locCoords.textContent = '';
      legend.textContent = '';
      regionReading.set(null);
      explain.hidden = true;
      return;
    }
    panels.hidden = false;
    explain.hidden = false;
    const culture = getSkyCulture(view.culture);
    const { ra, dec } = skyAngles(view.forward);
    const region = localRegion(view.forward, culture);
    regionReading.set(formationSubject(region), culture.id);
    const name = cultureObjectLabel(region, getLanguage());
    const field = (view.opticalFov || view.fovY).toLocaleString(getLanguage(), {
      maximumFractionDigits: 3,
    });
    banner.textContent = [
      skyText(location.owner.label),
      culture.id === 'chinese' ? skyText('nearby') + ' · ' + name : name,
      field + '°',
    ].join(' · ');
    if (['terrain', 'earth', 'station', 'rig'].includes(view.foreground))
      banner.textContent += ' · ' + skyText(view.foreground);
    locCoords.textContent = 'J2000 · ' + galleryCoordinates(ra, dec);
    if (explain.open)
      explainRA.textContent = skyText('raInfo', {
        n: ra.toLocaleString(getLanguage(), { maximumFractionDigits: 4 }),
      });
    legend.textContent = skyText('footprint') + (view.zenith ? ' · ' + skyText('horizon') : '');
    captions[0].textContent = skyText(culture.id === 'chinese' ? 'nearby' : 'local');
    captions[1].textContent = skyText('globe');
    const signature = [
      getLanguage(),
      culture.id,
      ...view.forward,
      ...view.up,
      view.fovY,
      view.aspect,
      view.circleDiameter,
      ...(view.zenith || []),
      maps[0].clientWidth,
      maps[1].clientWidth,
    ]
      .map((n) => (typeof n === 'number' ? n.toFixed(8) : n))
      .join('|');
    if (signature !== lastDrawing) {
      drawLocation(...maps, view, culture, region, { north: skyText('n'), east: skyText('e') });
      lastDrawing = signature;
    }
  }
  function toggleLocation(owner, opener) {
    if (location.owner === owner && !location.root.hidden) return hide(location);
    show(location, owner, opener);
    lastDrawing = '';
    locatorTick();
    if (!location.root.hidden && !timer) timer = setInterval(locatorTick, 250);
    location.close.focus({ preventScroll: true });
  }
  function showObject(coordinatesOpen = false, sourcesOpen = false) {
    if (!selection) return;
    const { options, owner, ray, culture } = selection;
    const hit = options[selection.index];
    const target = objectTarget(hit, ray, culture);
    const body = object.body;
    body.replaceChildren();
    if (options.length === 1) body.append(make('small', skyText(owner.label)));
    if (selection.toolbar && !coordinatesOpen)
      body.append(make('p', skyText('gesture'), 'sky-locator-legend'));
    if (options.length > 1) {
      const label = make('label', skyText(owner.label) + ' · ' + skyText('filters')),
        select = make('select');
      select.setAttribute('aria-label', skyText('filters'));
      options.forEach((candidate, i) => {
        const name =
          objectTarget(candidate, ray, culture)?.name || candidate.name || skyText(candidate.kind);
        const label = candidate.relation
          ? t(candidate.relation, { name })
          : candidate.regionOnly
            ? name + ' · ' + skyText('covering')
            : name;
        select.add(new Option(label, String(i), false, i === selection.index));
      });
      select.dataset.skyCandidates = '';
      select.onchange = () => {
        selection.index = select.selectedIndex;
        showObject(coordinatesOpen);
        body.querySelector('select')?.focus();
      };
      label.append(select);
      body.append(label);
    }
    const heading = make(
      'h3',
      target?.name || hit.name || skyText(hit.kind + 'Title') || skyText('blank')
    );
    body.append(heading);
    if (target && hit.kind !== 'sky') {
      bindSkyReading(body, { inline: true, sourcesOpen, heading: t('认识这个目标') }).set(
        target,
        culture,
        hit
      );
    } else {
      const description =
        hit.kind === 'sky'
          ? skyText(hit.explicitPosition ? 'usePosition' : 'unmatched')
          : [skyText(hit.kind), hit.kind === 'satellite' && hit.detail].filter(Boolean).join(' ');
      body.append(make('p', description));
    }
    if (target && hit.kind === 'formation') {
      if (target.groupId) {
        const group = getSkyCulture('chinese').groups.find((g) => g.id === target.groupId);
        bindSkyReading(body).set(formationSubject(group), 'chinese');
      }
    } else if (target) {
      const chart = getSkyCulture(culture);
      const members = !hit.regionOnly && target.asterisms;
      if (members?.length) {
        for (const member of members) {
          const record = chart.asterisms.find((a) => a.targetId === member.id);
          bindSkyReading(body, { summaryLabel: '所属星官 · {name}' }).set(
            formationSubject(record),
            chart.id
          );
        }
      } else {
        const region = localRegion(objectSightline(hit, target, ray), chart);
        bindSkyReading(body, {
          expanded: hit.kind === 'sky' && !coordinatesOpen,
          summaryLabel: chart.id === 'chinese' ? '附近星官 · {name}' : '所在星座 · {name}',
        }).set(formationSubject(region), chart.id);
      }
    }
    // Coordinates describe the selected position. Foreground objects have no
    // catalogue celestial identity, but their sightline can still be explained.
    const dir = coordinatesOpen ? ray : objectSightline(hit, target, ray),
      { ra, dec } = skyAngles(dir);
    const position = make('p', 'J2000 · ' + galleryCoordinates(ra, dec), 'sky-coordinates');
    const read = make('details');
    read.open = coordinatesOpen;
    read.dataset.skyCoordinateHelp = '';
    read.append(
      make('summary', skyText('coords')),
      make(
        'p',
        skyText('raInfo', { n: ra.toLocaleString(getLanguage(), { maximumFractionDigits: 4 }) })
      ),
      make('p', skyText('decInfo'))
    );
    body.append(position, read);
    if (!target) return;
    const positionTarget = hit.regionOnly
      ? {
          ...objectTarget({ kind: 'sky' }, ray, culture),
          name: target.name + ' · ' + skyText('blank'),
        }
      : target;
    const actions = make('div', null, 'sky-object-actions');
    const status = make('p');
    status.setAttribute('role', 'status');
    const execute = (track) => {
      if (!owner.enabled() || !owner.point(track ? target : positionTarget, track)) {
        status.textContent = skyText('blockedAim');
        return;
      }
      hide(object);
    };
    const aim = button(skyText(owner.aimLabel || 'aim'), () => execute(false), 'aim');
    aim.disabled = owner.canPoint?.(positionTarget) === false;
    actions.append(aim);
    if (hit.kind !== 'sky' && hit.kind !== 'formation') {
      const track = button(skyText('track'), () => execute(true), 'track');
      track.disabled = owner.canPoint?.(target) === false;
      actions.append(track);
    }
    if (hit.kind !== 'solar' && sim.flightLab?.openSurveyPlan) {
      const plan = button(
        skyText('plan'),
        async () => {
          plan.disabled = true;
          try {
            const detailSelection = owner.detailSelection?.();
            const ok = await sim.flightLab.openSurveyPlan(
              detailSelection ? { ...positionTarget, detailSelection } : positionTarget
            );
            if (ok) {
              if (object.owner === owner) hide(object, false);
            } else status.textContent = skyText('blockedAim');
          } catch {
            status.textContent = skyText('blockedAim');
          } finally {
            plan.disabled = false;
          }
        },
        'plan'
      );
      actions.append(plan);
    }
    heading.after(actions, status);
  }
  function openAt(owner, x, y, opener, client, coordinatesOpen = false) {
    if (!owner?.enabled()) return;
    const view = owner.view();
    if (!view) return;
    const ray = rayInView(view, x, y),
      candidates = [];
    const primary = owner.identify(view, x, y, ray, candidates) || { kind: 'unavailable' };
    const options = [primary];
    if (skyKinds.has(primary.kind) && primary.kind !== 'sky' && !primary.withinDisc) {
      const seen = new Set([primary.id]);
      candidates.sort(
        (a, b) =>
          Number(!!a.regionOnly) - Number(!!b.regionOnly) ||
          a.angularDistanceDeg - b.angularDistanceDeg
      );
      for (const item of candidates) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        options.push(item);
      }
    }
    if (skyKinds.has(primary.kind) && !primary.withinDisc) {
      const chart = getSkyCulture(view.culture);
      const target = objectTarget(primary, ray, view.culture);
      if (!primary.regionOnly && target?.asterisms?.length) {
        for (const a of target.asterisms)
          options.push({ kind: 'formation', id: a.id, relation: '所属星官 · {name}' });
      } else {
        const region = localRegion(objectSightline(primary, target, ray), chart);
        if (region)
          options.push({
            kind: 'formation',
            id: region.targetId,
            relation: chart.id === 'chinese' ? '附近星官 · {name}' : '所在星座 · {name}',
          });
      }
      if (primary.kind !== 'sky')
        options.push({ kind: 'sky', direction: ray, explicitPosition: true });
    }
    selection = {
      owner,
      culture: view.culture,
      ray,
      options,
      index: 0,
      toolbar: opener === owner.object,
    };
    show(object, owner, opener);
    showObject(coordinatesOpen);
    if (!object.root.hasAttribute('data-floating-moved')) {
      object.root.removeAttribute('data-sky-anchored');
      for (const key of ['left', 'top', 'right', '--sky-anchor-top'])
        object.root.style.removeProperty(key);
    }
    if (client && !object.root.hasAttribute('data-floating-moved')) {
      const rect = object.root.getBoundingClientRect();
      object.root.style.left =
        Math.max(8, Math.min(client.x + 8, window.innerWidth - rect.width - 8)) + 'px';
      object.root.style.top =
        Math.max(8, Math.min(client.y + 8, window.innerHeight - rect.height - 8)) + 'px';
      object.root.style.right = 'auto';
      object.root.dataset.skyAnchored = '';
      object.root.style.setProperty('--sky-anchor-top', object.root.style.top);
    }
    (
      object.body.querySelector(
        coordinatesOpen ? '[data-sky-coordinate-help] summary' : 'select, summary, button'
      ) || object.close
    ).focus({ preventScroll: true });
  }
  for (const pane of [location, object]) {
    pane.close.onclick = () => hide(pane);
    pane.close.setAttribute('aria-label', skyText('close'));
    pane.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        hide(pane);
      }
    });
  }
  const outside = (event) => {
    if (
      !object.root.hidden &&
      !object.root.contains(event.target) &&
      event.target !== object.opener
    )
      hide(object, false);
  };
  document.addEventListener('pointerdown', outside, true);
  const languageOff = onLanguageChange(() => {
    for (const pane of [location, object]) {
      pane.title.textContent = skyText(pane.key);
      pane.close.setAttribute('aria-label', skyText('close'));
    }
    explainTitle.textContent = skyText('coords');
    explainDec.textContent = skyText('decInfo');
    for (const owner of links) {
      owner.compactLabel = '';
      owner.lastCompact = -Infinity;
    }
    updateButtons();
    if (location.owner) locatorTick();
    if (object.owner)
      showObject(
        object.body.querySelector('[data-sky-coordinate-help]')?.open,
        object.body.querySelector('[data-sky-about]')?.open
      );
  });
  return {
    attach(config) {
      const { surface, controls } = config,
        owner = { ...config, compactLabel: '', lastCompact: -Infinity };
      const row = make('div', null, 'sky-tool-links');
      controls.append(row);
      owner.object = button(skyText('objects'), () => openAt(owner, 0, 0, owner.object), 'objects');
      owner.location = button(
        skyText('locator'),
        () => toggleLocation(owner, owner.location),
        'locator'
      );
      owner.coords = button(
        skyText('coords'),
        () => openAt(owner, 0, 0, owner.coords, null, true),
        'coords'
      );
      owner.object.setAttribute('aria-controls', object.root.id);
      owner.location.setAttribute('aria-controls', location.root.id);
      row.append(owner.object, owner.location, owner.coords);
      links.add(owner);
      updateButtons();
      const events = new AbortController(),
        pointers = new Set();
      const on = (name, fn, capture = false) =>
        surface.addEventListener(name, fn, { signal: events.signal, capture });
      let press = null,
        hold = 0,
        openedAt = -Infinity,
        heldId = null,
        secondary = null;
      function cancel() {
        clearTimeout(hold);
        hold = 0;
        press = null;
      }
      function inspect(x, y) {
        if (!owner.enabled()) return;
        const rect = surface.getBoundingClientRect();
        if (!(rect.width > 0 && rect.height > 0)) return;
        openAt(
          owner,
          (2 * (x - rect.left)) / rect.width - 1,
          1 - (2 * (y - rect.top)) / rect.height,
          surface,
          { x, y }
        );
      }
      on('contextmenu', (e) => {
        if (!owner.enabled()) return;
        e.preventDefault();
        e.stopPropagation();
        if (secondary?.moved) {
          secondary = null;
          return;
        }
        if (press) heldId = press.id;
        cancel();
        if (performance.now() - openedAt > 700) {
          if (!e.clientX && !e.clientY) openAt(owner, 0, 0, surface);
          else inspect(e.clientX, e.clientY);
        }
      });
      on('keydown', (e) => {
        if (!owner.enabled() || !(e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')))
          return;
        e.preventDefault();
        e.stopPropagation();
        openAt(owner, 0, 0, surface);
      });
      on(
        'pointerdown',
        (e) => {
          if (!owner.enabled()) return;
          if (e.button === 2) {
            secondary = { x: e.clientX, y: e.clientY, moved: false };
            return;
          }
          secondary = null;
          if (e.pointerType !== 'touch') return;
          pointers.add(e.pointerId);
          cancel();
          if (pointers.size !== 1) return;
          press = { x: e.clientX, y: e.clientY, id: e.pointerId };
          hold = setTimeout(() => {
            if (!press) return;
            heldId = press.id;
            openedAt = performance.now();
            inspect(press.x, press.y);
            cancel();
          }, 550);
        },
        true
      );
      on(
        'pointermove',
        (e) => {
          if (
            secondary &&
            e.buttons & 2 &&
            Math.hypot(e.clientX - secondary.x, e.clientY - secondary.y) > 7
          )
            secondary.moved = true;
          if (heldId === e.pointerId && pointers.size === 1) {
            e.stopImmediatePropagation();
            return;
          }
          if (!press || press.id !== e.pointerId) return;
          if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 7) cancel();
          else e.stopImmediatePropagation();
        },
        true
      );
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
        on(
          name,
          (e) => {
            pointers.delete(e.pointerId);
            if (heldId === e.pointerId) heldId = null;
            cancel();
          },
          true
        );
      const release = () => {
        cancel();
        pointers.clear();
        secondary = null;
        heldId = null;
        for (const pane of [location, object]) if (pane.owner === owner) hide(pane, false);
      };
      return {
        compact(wall) {
          if (wall - owner.lastCompact < 700 || !owner.enabled()) return;
          owner.lastCompact = wall;
          const view = owner.view();
          if (!view) return;
          const culture = getSkyCulture(view.culture);
          const name = cultureObjectLabel(localRegion(view.forward, culture), getLanguage());
          const prefix = skyText(culture.id === 'chinese' ? 'nearby' : 'locator');
          const next = prefix + ' · ' + name;
          if (next !== owner.compactLabel) {
            owner.compactLabel = next;
            owner.location.textContent = next;
          }
        },
        release,
        dispose() {
          release();
          events.abort();
          row.remove();
          links.delete(owner);
          if (!links.size) {
            languageOff();
            document.removeEventListener('pointerdown', outside, true);
            location.root.remove();
            object.root.remove();
            toolsForSim.delete(sim);
          }
        },
      };
    },
  };
}

export function attachSkyTools(sim, config) {
  if (!toolsForSim.has(sim)) toolsForSim.set(sim, createSkyTools(sim));
  return toolsForSim.get(sim).attach(config);
}
