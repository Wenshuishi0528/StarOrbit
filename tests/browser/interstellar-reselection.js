// Run in a fresh StarOrbit page before opening the Chinese sky catalogue.
export async function checkInterstellarReselection() {
  const { worldExplorer: world, environment } = window.viewer.sim;
  if (document.getElementById('welcomeDialog').open) document.getElementById('skipTour').click();
  document.querySelector('.world-mode-entry > button:nth-child(2)').click();
  const button = (mode) => document.querySelector(`.world-explorer [data-mode="${mode}"]`);
  try {
    button('stellar').click();
    if (!button('solar').classList.contains('active'))
      throw Error('The first switch must be waiting for the catalogue.');
    button('solar').click();
    // Share the outstanding catalogue request, then let the pending view switch settle.
    await environment.loadSkyCulture('chinese');
    await new Promise(requestAnimationFrame);
    if (!button('solar').classList.contains('active') || world.interstellar)
      throw Error('The delayed switch replaced the reselected Solar System view.');
    button('stellar').click();
    if (!world.interstellar || !button('stellar').classList.contains('active'))
      throw Error('An explicit switch after loading must open interstellar space.');
  } finally {
    world.close();
  }
}
