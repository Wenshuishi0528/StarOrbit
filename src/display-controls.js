const KEY = 'tiangong-overlays-v1';

export function restoreControlFocus(preferred) {
  const targets = [preferred, document.getElementById('toolsToggle'), document.getElementById('viewMenuToggle')];
  targets.find(element => element?.isConnected && element.getClientRects().length)?.focus({preventScroll: true});
}

export function installDisplayControls() {
  const $ = id => document.getElementById(id);
  const panel = $('telemetry'), show = $('showTelemetry');
  const viewToggle = $('viewMenuToggle'), views = $('viewActions');
  const toolsToggle = $('toolsToggle'), tools = $('toolbarActions');
  const toolbar = toolsToggle.closest('.toolbar');
  const map = $('orbitMinimap'), mapToggle = $('toggleMinimap');
  const compact = matchMedia('(max-width:760px)');
  let visible = true, toolsOpen = false;
  try { visible = JSON.parse(localStorage.getItem(KEY))?.telemetry !== false; } catch {}

  const setVisible = (value, save = true) => {
    panel.hidden = !value;
    show.checked = value;
    if (save) try { localStorage.setItem(KEY, JSON.stringify({telemetry: value})); } catch {}
  };
  setVisible(visible, false);
  show.onchange = () => setVisible(show.checked);
  $('closeTelemetry').onclick = () => { setVisible(false); restoreControlFocus(show); };

  const setViewsOpen = open => {
    views.hidden = !open;
    viewToggle.setAttribute('aria-expanded', String(open));
  };
  const setToolsOpen = open => {
    toolsOpen = compact.matches && open;
    tools.hidden = compact.matches && !toolsOpen;
    toolsToggle.setAttribute('aria-expanded', String(toolsOpen));
    if (!toolsOpen) setViewsOpen(false);
  };
  toolsToggle.onclick = () => setToolsOpen(!toolsOpen);
  viewToggle.onclick = () => setViewsOpen(views.hidden);
  tools.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button === viewToggle) return;
    if (views.contains(button)) {
      setViewsOpen(false);
      (compact.matches ? toolsToggle : viewToggle).focus();
    }
    // Keep focus owned by dialogs opened by the clicked action.
    setToolsOpen(false);
  });
  document.addEventListener('pointerdown', event => {
    if (!toolbar.contains(event.target)) setToolsOpen(false);
  });
  document.addEventListener('focusin', event => {
    if (!toolbar.contains(event.target)) setToolsOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!views.hidden) { setViewsOpen(false); viewToggle.focus(); }
    else if (toolsOpen) { setToolsOpen(false); toolsToggle.focus(); }
  });

  const setMapExpanded = expanded => {
    map.classList.toggle('compact-expanded', expanded);
    mapToggle.setAttribute('aria-expanded', String(expanded));
  };
  mapToggle.onclick = () => setMapExpanded(!map.classList.contains('compact-expanded'));
  compact.addEventListener('change', () => { setToolsOpen(false); setMapExpanded(false); });
  setToolsOpen(false);
  setMapExpanded(false);
}
