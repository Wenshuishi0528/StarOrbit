// Run on a fresh built viewer with the station mission. This also runs through
// plain Chrome DevTools Runtime.evaluate, without a browser-only dependency.
export async function inspectSkyToolsInPage() {
  const $ = (selector) => document.querySelector(selector);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const check = (ok, message) => {
    if (!ok) throw Error(message);
  };
  const wait = async (fn, label, timeout = 75000) => {
    const end = performance.now() + timeout;
    while (performance.now() < end) {
      if (fn()) return;
      await sleep(150);
    }
    throw Error('Timeout: ' + label);
  };
  const click = (selector) => {
    const node = $(selector);
    check(node, selector);
    node.click();
  };
  await wait(() => window.viewer?.sim?.initialized && viewer.sim.xuntian, 'viewer');
  const sim = viewer.sim;
  if ($('#welcomeDialog')?.open) click('#skipTour');
  click('#languageZh');
  sim.seek(Date.UTC(2026, 10, 5, 5, 44));
  sim.update(performance.now());
  click('#openXuntianMap');
  const search = $('#xtSearch');
  search.value = '织女星';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(() => $('#xtResults [data-target="hip:91262"]'), 'find Vega');
  click('#xtResults [data-target="hip:91262"]');
  await wait(
    () => sim.xuntian.pointing.locked && sim.xuntian.result?.identification?.id === 'hip:91262',
    'Vega in finder'
  );
  const first = sim.xuntian.pointing;
  click('#xtSkyTools [data-sky-action="objects"]');
  check(
    !$('#skyObjectWindow').hidden && $('#skyObjectWindow h3').textContent.includes('织女'),
    'centre identification'
  );
  await wait(
    () => $('#skyObjectWindow .sky-reading-prose')?.textContent.includes('夏季大三角'),
    'Vega introduction visible'
  );
  click('#skyObjectWindow [data-sky-about] summary');
  check($('#skyObjectWindow [data-sky-about] a')?.href.startsWith('https://'), 'article source');
  check(
    sim.xuntian.pointing.target === first.target && sim.xuntian.pointing.field === first.field,
    'reading changed pointing'
  );
  click('#skyObjectWindow [data-sky-action="close"]');
  click('#xtSkyTools [data-sky-action="coords"]');
  check(
    $('#skyObjectWindow [data-sky-coordinate-help]').open &&
      $('#skyObjectWindow').textContent.includes('1 h'),
    'coordinate popover'
  );
  click('#skyObjectWindow [data-sky-action="close"]');
  click('#xtSkyTools [data-sky-action="locator"]');
  check(
    !$('#skyLocationWindow').hidden && $('#skyLocationWindow').textContent.includes('天琴座'),
    'locator sky region'
  );
  check($('#skyLocationWindow canvas').width > 80, 'locator rendered');
  click('#skyLocationWindow [data-sky-action="close"]');
  const c = $('#xtCanvas'),
    rect = c.getBoundingClientRect();
  c.dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: rect.left + rect.width * 0.78,
      clientY: rect.top + rect.height * 0.35,
    })
  );
  check(
    !$('#skyObjectWindow').hidden && !$('#skyObjectWindow h3').textContent.includes('织女星'),
    'pointer was treated as centre'
  );
  check(sim.xuntian.pointing.target === first.target, 'context menu moved camera');
  const before = sim.xuntian.pointing.axes.forward;
  click('#skyObjectWindow [data-sky-action="aim"]');
  await wait(() => sim.xuntian.pointing.mode === 'sky-pin', 'inertial direction pinned');
  const aligned = sim.xuntian.pointing;
  check(
    aligned.field === first.field &&
      Math.hypot(...aligned.axes.forward.map((v, i) => v - before[i])) > 0.0001,
    'one-shot FOV or direction'
  );
  const epoch = sim.current.t,
    frozen = [...aligned.axes.forward];
  sim.seek(epoch + 120000);
  await wait(() => Math.abs(sim.current.t - epoch) >= 115000, 'advance the orbit');
  check(
    sim.xuntian.pointing.pinned === 'sky' &&
      sim.xuntian.pointing.locked &&
      Math.hypot(...sim.xuntian.pointing.axes.forward.map((v, i) => v - frozen[i])) < 1e-7 &&
      sim.xuntian.pointing.field === first.field,
    'fixed crosshair drifted with the orbit'
  );
  click('#xtPin');
  check(
    sim.xuntian.pointing.mode === 'free' && !sim.xuntian.pointing.pinned,
    'can release the crosshair'
  );
  sim.seek(epoch);
  click('#xtClose');
  click('.world-mode-entry > button');
  click('[data-ground-deploy]');
  await wait(() => sim.worldExplorer?.ground?.telescope?.layout === 'dock', 'deployed');
  await wait(() => !!$('[data-star-crosshair]')?.dataset.kind, 'scope frame');
  click('.ground-scope-actions [data-sky-action="locator"]');
  check(
    !$('#skyLocationWindow').hidden &&
      $('#skyLocationWindow').textContent.includes('当地地平线') &&
      $('#skyLocationWindow .sky-locator-body').textContent.includes('地面望远镜'),
    'scope horizon'
  );
  click('#skyLocationWindow [data-sky-action="close"]');
  click('.sky-main-actions [data-sky-action="locator"]');
  check(
    $('#skyLocationWindow .sky-locator-body').textContent.includes('地面主画面'),
    'wrong main camera'
  );
  click('#skyLocationWindow [data-sky-action="close"]');
  const ground = sim.worldExplorer.ground;
  const original = [ground.state.azimuth, ground.state.elevation, ground.telescope.field];
  const markerOptions = $('[data-ground-marker-settings] [data-marker-profile="ground"]');
  check(markerOptions, 'ground marker settings');
  function markerSetting(selector, value) {
    const control = markerOptions.querySelector(selector);
    control.value = value;
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }
  markerSetting('[data-marker-shape]', 'dot');
  markerSetting('[data-marker-size]', '37');
  markerSetting('[data-marker-color]', '#e12559');
  const markers = [
    ...document.querySelectorAll(
      '.ground-aim-origin .aim-marker-glyph, .ground-guide-aim-origin .aim-marker-glyph'
    ),
  ];
  check(
    markers.length === 2 &&
      markers.every(
        (node) =>
          node.dataset.shape === 'dot' && node.querySelector('canvas').style.width === '41px'
      ),
    'ground marker mirrors'
  );
  function centreColor(canvas) {
    return Array.from(
      canvas
        .getContext('2d')
        .getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data
    ).join(',');
  }
  check(
    markers.every((node) => centreColor(node.querySelector('canvas')) === '225,37,89,255'),
    'live marker colour'
  );
  const annotation = $('[data-star-photo-annotations]');
  const initialAnnotation = annotation.checked;
  const pixels = [];
  const originalEncode = HTMLCanvasElement.prototype.toBlob;
  try {
    // Read the final PNG raster, avoiding a browser download in the test.
    HTMLCanvasElement.prototype.toBlob = function () {
      pixels.push(centreColor(this));
    };
    for (const include of [true, false]) {
      if (annotation.checked !== include) annotation.click();
      click('[data-scope-photo]');
    }
  } finally {
    HTMLCanvasElement.prototype.toBlob = originalEncode;
    if (annotation.checked !== initialAnnotation) annotation.click();
    markerOptions.querySelector('[data-marker-reset]').click();
  }
  check(
    pixels.length === 2 && pixels[0] === '225,37,89,255' && pixels[1] !== pixels[0],
    'ground photo annotation opt-in: ' + pixels.join(' · ')
  );
  click('.ground-scope-actions [data-sky-action="coords"]');
  check($('#skyObjectWindow [data-sky-coordinate-help]').open, 'eyepiece coordinates');
  check(
    ground.state.azimuth === original[0] && ground.telescope.field === original[2],
    'menu changed ground camera or FOV'
  );
  click('#skyObjectWindow [data-sky-action="close"]');
  const mainCanvas = document.querySelector('.world-stage > canvas');
  const bounds = mainCanvas.getBoundingClientRect();
  mainCanvas.dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: bounds.left + bounds.width * 0.44,
      clientY: bounds.top + bounds.height * 0.19,
    })
  );
  const aim = $('#skyObjectWindow [data-sky-action="aim"]');
  check(
    !$('#skyObjectWindow').hidden && aim && !aim.disabled,
    'ground main-view pointing above horizon: ' +
      [mainCanvas.id, ground.state.elevation, $('#skyObjectWindow').innerText].join(' · ')
  );
  const skyBefore = [ground.telescope.pose.azimuth, ground.telescope.pose.elevation];
  aim.click();
  await wait(
    () =>
      Math.hypot(
        ground.telescope.pose.azimuth - skyBefore[0],
        ground.telescope.pose.elevation - skyBefore[1]
      ) > 0.001,
    'main-view action moved independent telescope'
  );
  check(
    ground.state.azimuth === original[0] &&
      ground.state.elevation === original[1] &&
      sim.worldExplorer.ground.telescope.field === original[2],
    'ground one-shot must keep main camera and telescope FOV'
  );
  click('[data-scope-expand]');
  check(
    getComputedStyle($('.sky-main-actions')).display === 'none',
    'expanded eyepiece retained hidden finder actions'
  );
  click('.world-bar [data-exit]');
  click('#openXuntianMap');
  search.value = '织女星';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(() => $('#xtResults [data-target="hip:91262"]'), 'find Vega again');
  click('#xtResults [data-target="hip:91262"]');
  await wait(() => sim.xuntian.result?.identification?.id === 'hip:91262', 'Vega in finder again');
  click('#xtSkyTools [data-sky-action="objects"]');
  click('#skyObjectWindow [data-sky-action="plan"]');
  await wait(
    () => $('[data-survey="chosen"]')?.textContent.includes('织女'),
    'selected Vega transferred to survey planner'
  );
  return 'Finder and independent ground eyepiece, real right-click and non-slewing info, J2000 units, Lyra and ground horizon, preserved FOV, shared live/photo marker and clean PNG, survey plan handoff';
}
export async function inspectSkyTools(page) {
  return page.evaluate(inspectSkyToolsInPage);
}
