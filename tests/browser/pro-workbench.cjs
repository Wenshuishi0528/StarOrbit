// Run against a local build with Playwright and Chrome available.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function main() {
  const root = path.resolve(__dirname, '../..');
  const channel = process.env.STARORBIT_TEST_BROWSER || 'chrome';
  const dir = path.resolve(root, process.env.STARORBIT_TEST_OUTPUT || 'output/pro-validation', channel === 'chrome' ? '' : channel);
  fs.mkdirSync(dir, { recursive: true });
  const { runMission } = await import('../../src/pro/mission.js');
  const browser = await chromium.launch({ channel, headless: true, args: ['--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    const ctx = await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:1});
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => { if(msg.type()==='error')errors.push(msg.text()); });
    await page.goto('http://127.0.0.1:8771/StarOrbit.html', {waitUntil:'domcontentloaded'});
    const link = page.getByRole('link',{name:'星轨专业版'});
    assert.equal(await link.getAttribute('href'),'StarOrbitPro.html');
    await link.evaluate(a=>a.click());
    await page.waitForURL('**/StarOrbitPro.html');
    await page.locator('#scene[data-time-sec="0"]').waitFor();
    await page.locator('#scene canvas').waitFor();
    assert.equal(await page.locator('#eventCount').innerText(),'13');
    await page.screenshot({path:path.join(dir,'workbench.png')});
    for(const i of [0,1]){
      const event=page.locator('.event-row[data-plan="'+i+'"]').first();
      const time=await event.getAttribute('data-start');await event.click();
      assert.equal(await page.locator('#scene').getAttribute('data-time-sec'),time);
      assert.equal(await page.locator('#scene').getAttribute('data-view'),'craft');
      assert.equal(await page.locator('#replayTabs [aria-pressed="true"]').getAttribute('data-plan'),String(i));
      assert(await page.locator('#eventDetail').isVisible());
      assert((await page.locator('#eventDetail').innerText()).includes('极值'));
      if(i===0)await page.screenshot({path:path.join(dir,'event.png')});
    }
    await page.locator('#craftName').fill('本机验收星');
    await page.locator('#editTabs [data-plan="1"]').click();
    await page.locator('#planName1').fill('数据采集 B');
    await page.locator('#payloadW1').fill('14');
    await page.locator('#windows1 .window-row').first().locator('input').first().fill('00:10');
    await page.locator('#runTop').click();
    await page.waitForFunction(()=>document.querySelector('#missionTitle').textContent.includes('本机验收星'));
    assert((await page.locator('#summary').innerText()).includes('数据采集 B'));
    await page.locator('.files').first().locator('summary').click();
    async function download(id,file){
      const pending=page.waitForEvent('download');await page.locator(id).click();
      const item=await pending;const filename=path.join(dir,file);await item.saveAs(filename);
      return JSON.parse(fs.readFileSync(filename,'utf8'));
    }
    const mission=await download('#export','ui-mission.json');
    const result=await download('#resultFile','ui-result.json');
    assert.equal(mission.spacecraft.name,'本机验收星');
    assert.deepEqual(mission.plans[1].windows[0],[10,35]);assert.equal(mission.plans[1].payloadW,14);
    const expected=runMission(mission);
    for(let i=0;i<2;i++){
      assert(Math.abs(expected.plans[i].metrics.peakBoardC-result.plans[i].metrics.peakBoardC)<1e-6);
      assert(Math.abs(expected.plans[i].metrics.minBatteryWh-result.plans[i].metrics.minBatteryWh)<1e-6);
      assert.deepEqual(expected.plans[i].events.map(e=>e.startSec),result.plans[i].events.map(e=>e.startSec));
    }
    await page.reload();await page.locator('#scene[data-time-sec="0"]').waitFor();
    assert.equal(await page.locator('#craftName').inputValue(),'本机验收星');
    await page.locator('#apogeeKm').fill('300');await page.locator('#runTop').click();
    assert((await page.locator('#formError').innerText()).includes('近地点'));assert(await page.locator('#resultFile').isDisabled());
    await page.locator('#file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"schemaVersion":17}')});
    await page.waitForFunction(()=>document.querySelector('#formError').textContent.includes('版本 1'));
    mission.spacecraft.name='重新导入的卫星';mission.plans[0].windows=[];
    await page.locator('#file').setInputFiles({name:'mission.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(mission))});
    await page.waitForFunction(()=>document.querySelector('#missionTitle').textContent.includes('重新导入的卫星'));
    await page.locator('#time').fill('86400');assert.equal(await page.locator('#elapsed').innerText(),'24:00:00');
    await page.locator('#lang').selectOption('en');assert.equal(await page.locator('main h2').innerText(),'24-hour mission comparison');
    await page.setViewportSize({width:390,height:844});await page.locator('#runTop').scrollIntoViewIfNeeded();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(dir,'narrow.png')});
    await ctx.close();

    const offline=await browser.newContext({offline:true});
    const filePage=await offline.newPage();let network=0;
    filePage.on('request',r=>{if(/^https?:/.test(r.url()))network++;});
    filePage.on('pageerror',e=>errors.push(e.message));
    await filePage.goto(pathToFileURL(path.join(root,'StarOrbitPro.html')).href);
    await filePage.locator('#scene[data-time-sec="0"]').waitFor();
    await filePage.locator('.event-row[data-plan="1"]').first().click();
    assert.equal(await filePage.locator('#scene').getAttribute('data-view'),'craft');
    assert.equal(network,0);await offline.close();
    assert.deepEqual(errors,[]);
    console.log(channel+' '+browser.version()+': main entry, both 3D event replays, editing, JSON round trip, persistence, validation, 24 h endpoint, narrow viewport and offline single-file entry passed.');
  } finally { await browser.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
