// Evaluate in a new browser profile after the normal application has loaded.
async () => {
  const find = (selector) => document.querySelector(selector);
  const click = (selector) => {
    const element = find(selector);
    if (!element || element.disabled) throw new Error('Unavailable control ' + selector);
    element.click();
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const checks = [];
  async function until(label, predicate) {
    const deadline = performance.now() + 35000;
    while (!predicate()) {
      if (performance.now() > deadline) throw new Error(label);
      await sleep(90);
    }
    checks.push(label);
  }
  const setValue = (selector, value, event = 'change') => {
    const el = find(selector);
    el.value = value;
    el.dispatchEvent(new Event(event, { bubbles: true }));
  };
  const key = (el, type, code) =>
    el.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
  await until('Application ready', () => window.viewer?.sim.worldExplorer);
  if (find('#welcomeDialog')?.open) click('#skipTour');
  document.dispatchEvent(
    new CustomEvent('starorbit:open-controls', { detail: { mode: 'spacecraft' } })
  );
  const mainGuide = find('#spacecraftKeyGuide');
  await until(
    'Help opens the standalone spacecraft keyboard',
    () => !mainGuide.hidden && document.activeElement === mainGuide
  );
  click('#spacecraftKeyGuide [data-key-focus]');
  const nav = find('#attitudeNavballPanel');
  await until(
    'The guide hands control to the visible navigation ball',
    () => document.activeElement === nav && nav.dataset.keyboard === 'true'
  );
  key(nav, 'keydown', 'KeyW');
  await until(
    'The spacecraft pitch-down key lights on real pilot input',
    () => !!mainGuide.querySelector('[data-key-code=KeyW].is-pressed')
  );
  key(nav, 'keyup', 'KeyW');
  click('#spacecraftKeyGuide [data-key-close]');

  const preview = find('#freeFlightCameraWindow'),
    canvas = preview.querySelector('canvas');
  const context = canvas.getContext('2d'),
    drawImage = context.drawImage;
  let frames = 0;
  context.drawImage = function (...args) {
    frames++;
    return drawImage.apply(this, args);
  };
  click('#openFreeFlight');
  click('#freeFlightLauncher [data-start]');
  const panel = find('#freeFlightPanel'),
    sim = viewer.sim;
  await until(
    'The docked cockpit already receives camera frames',
    () => sim.freeFlight.state?.phase === 'docked' && !preview.hidden && frames > 0
  );
  const attachedPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  await until('The docked image contains illuminated geometry or sky', () =>
    attachedPixels.some((channel, i) => i % 4 !== 3 && channel > 28)
  );
  if (
    !(
      panel
        .querySelector('.ff-inputs')
        .compareDocumentPosition(panel.querySelector('.ff-settings')) &
      Node.DOCUMENT_POSITION_FOLLOWING
    )
  )
    throw new Error('Flight keys must precede RCS settings');
  click('[data-flight-action=undock]');
  await until(
    'Undock starts departure and keeps the camera visible',
    () => ['departing', 'free'].includes(sim.freeFlight.state.phase) && !preview.hidden
  );
  click('[data-flight-keyguide]');
  click('#freeFlightKeyGuide [data-key-focus]');
  key(panel, 'keydown', 'KeyJ');
  await until(
    'Free-flight translation lights the matching key',
    () => !!find('#freeFlightKeyGuide [data-key-code=KeyJ].is-pressed')
  );
  key(panel, 'keyup', 'KeyJ');
  click('#freeFlightKeyGuide [data-key-close]');
  const other = [...panel.querySelector('[data-flight-select]').options].find(
    (o) => o.value !== sim.freeFlight.state.selectedId
  );
  setValue('[data-flight-select]', other.value);
  await until('Changing pilot also switches the onboard camera label', () =>
    preview.textContent.includes(other.textContent)
  );
  click('[data-flight-action=undock]');
  click('[data-close-camera]');
  await until('Camera can close', () => preview.hidden && !sim.freeFlight.state.preview);
  const closedFrames = frames;
  await sleep(350);
  if (closedFrames !== frames) throw new Error('Closed camera kept drawing');
  click('[data-flight-action=preview]');
  await until('Reopening restarts the live feed', () => !preview.hidden && frames > closedFrames);
  click('[data-camera-main]');
  await until(
    'Full port view suppresses the duplicate feed',
    () => sim.freeFlight.state.view === 'port' && preview.hidden
  );
  click('[data-flight-view=external]');
  await until('Leaving the full port view restores the window', () => !preview.hidden);
  click('[data-close-camera]');
  click('[data-flight-action=exit]');
  click('#openFreeFlight');
  click('#freeFlightLauncher [data-resume]');
  await until(
    'Saved mission resumes paused with its camera preference',
    () =>
      sim.freeFlight.state?.paused &&
      !sim.freeFlight.state.preview &&
      panel.querySelector('[data-flight-action=pause]').classList.contains('ff-prominent')
  );
  click('[data-flight-action=exit]');
  context.drawImage = drawImage;

  click('.world-mode-entry button:nth-child(3)');
  await until(
    'First interstellar visit shows the keyboard automatically',
    () => find('#interstellarKeyGuide') && !find('#interstellarKeyGuide').hidden
  );
  click('#interstellarKeyGuide [data-key-focus]');
  const sky = viewer.renderer.domElement;
  key(sky, 'keydown', 'KeyH');
  await until(
    'Stellar motion lights H',
    () => !!find('#interstellarKeyGuide [data-key-code=KeyH].is-pressed')
  );
  key(sky, 'keyup', 'KeyH');
  key(sky, 'keydown', 'Space');
  key(sky, 'keyup', 'Space');
  setValue('.interstellar-panel [data-marker-shape]', 'dot');
  setValue('.interstellar-panel [data-marker-color]', '#ff8822', 'input');
  await until('Marker color and its preview update while choosing', () =>
    [
      ...document.querySelectorAll(
        '.interstellar-reticle, .interstellar-panel .aim-marker-preview i'
      ),
    ].every(
      (el) =>
        el.dataset.shape === 'dot' &&
        el
          .querySelector('canvas')
          ?.getContext('2d')
          .getImageData(
            Math.floor(el.firstChild.width / 2),
            Math.floor(el.firstChild.height / 2),
            1,
            1
          ).data[0] === 255
    )
  );
  find('.interstellar-panel [data-marker-color]').dispatchEvent(
    new Event('change', { bubbles: true })
  );
  click('.interstellar-panel [data-marker-outline]');
  click('#interstellarKeyGuide [data-key-close]');
  click('.world-bar [data-exit]');
  click('.world-mode-entry button:nth-child(3)');
  await until(
    'Interstellar keyboard closure and marker choices persist on reentry',
    () =>
      find('#interstellarKeyGuide')?.hidden &&
      find('.interstellar-panel [data-marker-shape]')?.value === 'dot' &&
      find('.interstellar-panel [data-marker-color]').value === '#ff8822' &&
      !find('.interstellar-panel [data-marker-outline]').checked
  );
  click('.interstellar-utility [aria-controls=interstellarKeyGuide]');
  await until(
    'The interstellar keyboard is easy to reopen',
    () => !find('#interstellarKeyGuide').hidden
  );
  setValue('.interstellar-panel [data-marker-shape]', 'hidden');
  await until('Hiding the marker removes it from the sky and preview', () =>
    [
      ...document.querySelectorAll(
        '.interstellar-reticle, .interstellar-panel .aim-marker-preview i'
      ),
    ].every((el) => el.hidden)
  );
  return { frames, checks };
};
