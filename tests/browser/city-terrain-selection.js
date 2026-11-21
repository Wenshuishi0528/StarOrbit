// Run with Playwright run-code against a fresh browser profile.
async (page) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await page.waitForFunction(() => !!window.viewer?.sim?.worldExplorer);
  if (await page.locator('#welcomeDialog').isVisible()) await page.locator('#skipTour').click();
  await page.evaluate(async () => {
    const manager = viewer.sim.environment.cityTerrain;
    await manager.ready;
    const base = manager.cities.get('beijing');
    for (let index = 0; index < 4; index++) {
      const id = 'selection-fixture-' + index;
      const city = { ...base, id, name: id, names: { zh: id }, builtin: false, tiles: undefined };
      await manager.cache.putTile(
        city,
        '0/0/0',
        {
          buffer: new Uint8Array(1000 + index).buffer,
          mimeType: 'image/jpeg',
        },
        { pinned: index === 0 }
      );
      manager.cities.set(id, city);
    }
  });
  await page.locator('#openResources').evaluate((button) => button.click());
  const bar = page.locator('.city-selection-bar');
  const row = (index) => page.locator('[data-city="selection-fixture-' + index + '"]');
  const layout = (name) => bar.getByRole('button', { name, exact: true }).click();
  await layout('列表视图');
  await row(0).locator('input').check();
  await layout('卡片视图');
  if (!(await row(0).locator('input').isChecked())) throw Error('Selection lost on layout change');
  await layout('列表视图');
  await row(2).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const point = async (index) => {
    const box = await row(index).locator('strong').boundingBox();
    return [box.x + 6, box.y + box.height / 2];
  };
  await page.mouse.move(...(await point(1)));
  await page.mouse.down();
  await page.mouse.move(...(await point(3)));
  await page.mouse.up();
  const selected = page.locator('[data-city^="selection-fixture-"] input:checked');
  if ((await selected.count()) !== 4) throw Error('Drag skipped an item');
  if (await page.locator('[data-city="beijing"] input').count()) throw Error('Built-in selectable');
  const remove = bar.getByRole('button', { name: '删除所选（4）' });
  page.once('dialog', (d) => d.dismiss());
  await remove.click();
  if ((await selected.count()) !== 4) throw Error('Cancel changed selection');
  page.once('dialog', (d) => d.accept());
  await remove.click();
  await page.waitForFunction(() => !document.querySelector('[data-city^="selection-fixture-"]'));
  if (
    await page.evaluate(async () =>
      (await viewer.sim.environment.cityTerrain.cache.list()).some((city) =>
        city.id.startsWith('selection-fixture-')
      )
    )
  )
    throw Error('Data still in IndexedDB');
};
