const KEY = 'tiangong-overlays-v1';

export function restoreControlFocus(preferred) {
  const targets = [
    preferred,
    document.getElementById('toolsToggle'),
    document.getElementById('viewMenuToggle'),
  ];
  targets
    .find((element) => element?.isConnected && element.getClientRects().length)
    ?.focus({ preventScroll: true });
}

export function installDisplayControls() {
  const $ = (id) => document.getElementById(id);
  const panel = $('telemetry'),
    show = $('showTelemetry');
  const viewToggle = $('viewMenuToggle'),
    views = $('viewActions');
  const toolsToggle = $('toolsToggle'),
    tools = $('toolbarActions');
  const toolbar = toolsToggle.closest('.toolbar');
  const map = $('orbitMinimap'),
    mapToggle = $('toggleMinimap');
  const compact = matchMedia('(max-width:760px)');
  // In a short desktop window the default map can rise over the Help button.
  // Leave the toolbar and the sidebar clear while retaining dragged map positions.
  const aside = document.querySelector('aside');
  function fitMapBesideTools() {
    map.style.removeProperty('--map-toolbar-inset');
    map.style.removeProperty('--map-available-width');
    if (compact.matches || map.hidden || map.hasAttribute('data-floating-moved')) return;
    const rail = toolbar.getBoundingClientRect(),
      mapRect = map.getBoundingClientRect();
    if (rail.bottom + 8 > mapRect.top && rail.top < mapRect.bottom && mapRect.height) {
      map.style.setProperty('--map-toolbar-inset', `${innerWidth - rail.left + 10}px`);
      map.style.setProperty(
        '--map-available-width',
        `${Math.max(160, rail.left - aside.getBoundingClientRect().right - 20)}px`
      );
    }
  }
  const mapLayout = new ResizeObserver(fitMapBesideTools);
  mapLayout.observe(toolbar);
  mapLayout.observe(map);
  window.addEventListener('resize', fitMapBesideTools);
  let visible = true,
    toolsOpen = false;
  try {
    visible = JSON.parse(localStorage.getItem(KEY))?.telemetry !== false;
  } catch {}

  const setVisible = (value, save = true) => {
    panel.hidden = !value;
    show.checked = value;
    if (save)
      try {
        localStorage.setItem(KEY, JSON.stringify({ telemetry: value }));
      } catch {}
  };
  setVisible(visible, false);
  show.onchange = () => setVisible(show.checked);
  $('closeTelemetry').onclick = () => {
    setVisible(false);
    restoreControlFocus(show);
  };

  const setViewsOpen = (open) => {
    views.hidden = !open;
    viewToggle.setAttribute('aria-expanded', String(open));
  };
  const setToolsOpen = (open) => {
    toolsOpen = compact.matches && open;
    tools.hidden = compact.matches && !toolsOpen;
    toolsToggle.setAttribute('aria-expanded', String(toolsOpen));
    if (!toolsOpen) setViewsOpen(false);
  };
  toolsToggle.onclick = () => setToolsOpen(!toolsOpen);
  viewToggle.onclick = () => setViewsOpen(views.hidden);
  tools.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || button === viewToggle) return;
    if (views.contains(button)) {
      setViewsOpen(false);
      (compact.matches ? toolsToggle : viewToggle).focus();
    }
    // Keep focus owned by dialogs opened by the clicked action.
    setToolsOpen(false);
  });
  const dismissOutside = (event) => {
    // A locating card and its highlighted toolbar button are a single interaction.
    // Closing the menu on pointerdown would move the card before the click lands.
    if (
      !toolbar.contains(event.target) &&
      !event.target.closest?.('#helpPanel[data-help-view="location"]')
    )
      setToolsOpen(false);
  };
  document.addEventListener('pointerdown', dismissOutside);
  document.addEventListener('focusin', dismissOutside);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!views.hidden) {
      setViewsOpen(false);
      viewToggle.focus();
    } else if (toolsOpen) {
      setToolsOpen(false);
      toolsToggle.focus();
    }
  });

  const setMapExpanded = (expanded) => {
    map.classList.toggle('compact-expanded', expanded);
    mapToggle.setAttribute('aria-expanded', String(expanded));
  };
  mapToggle.onclick = () => setMapExpanded(!map.classList.contains('compact-expanded'));
  compact.addEventListener('change', () => {
    setToolsOpen(false);
    setMapExpanded(false);
  });
  setToolsOpen(false);
  setMapExpanded(false);
}
