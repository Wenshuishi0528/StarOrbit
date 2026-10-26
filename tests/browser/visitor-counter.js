// Intercept every statistics request: test visits never reach the live service.
async page=>{
 const requests=[],checks=[],check=(v,s)=>{if(!v)throw Error(s+' '+JSON.stringify(requests));checks.push(s);};let fail=false;
 await page.unrouteAll({behavior:'wait'});await page.evaluate(()=>{try{localStorage.clear();}catch{}});await page.goto("about:blank");await page.setViewportSize({width:1440,height:960});
 await page.addInitScript(()=>{Object.defineProperty(navigator,'webdriver',{configurable:true,get:()=>false});localStorage.setItem('private-scene-test','PRIVATE_MODEL_SOURCE');});
 await page.context().addCookies([{name:'test-private-cookie',value:'PRIVATE_COOKIE',domain:'wenshuishi.goatcounter.com',path:'/',secure:true}]);
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.hostname==='wenshuishi.goatcounter.com'){
   requests.push({url:url.href,headers:await request.allHeaders(),body:request.postData(),type:request.resourceType()});
   if(fail)return route.abort();
   return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({count:'1,234'})});
  }
  if(url.origin==='https://wenshuishi0528.github.io'){
   const local='http://127.0.0.1:8784/'+url.pathname.replace(/^\/StarOrbit\//,'');
   return route.fulfill({response:await route.fetch({url:local})});
  }
  if(url.hostname==='127.0.0.1'||['data:','blob:'].includes(url.protocol))return route.continue();
  return route.abort();
 });
 const ready=async()=>{await page.waitForFunction(()=>window.viewer?.sim.initialized);await page.evaluate(()=>{viewer.music.pause();document.getElementById('welcomeDialog').close();});await page.locator('#visitorCount').waitFor({state:'visible'});};
 await page.goto('https://wenshuishi0528.github.io/StarOrbit/?private=PRIVATE_URL#PRIVATE_FRAGMENT');await ready();
 check(requests.length===2,'official website sends one count and one read');
 for(const request of requests){
  check(!request.headers.referer&&!request.headers.cookie&&!request.body,'request excludes referrer, cookies and body');
  check(!JSON.stringify(request).includes('PRIVATE_'),'request excludes private URL, scene and cookie values');
  check(request.type==='fetch','no third-party script or iframe');
 }
 check(requests.some(r=>r.url==='https://wenshuishi.goatcounter.com/count?p=%2FStarOrbit%2F'),'fixed visit identifier');
 await page.locator('header').screenshot({path:'output/playwright/visits053-desktop.png'});
 for(const [id,label] of [['languageEn','Web visits'],['languageRu','Посещения сайта'],['languageFr','Visites du site'],['languageZh','网页累计访问']]){await page.locator('#'+id).click();check((await page.locator('#visitorCount').textContent()).startsWith(label),'translated counter '+id);}
 await page.setViewportSize({width:390,height:844});await page.locator('header').screenshot({path:'output/playwright/visits053-mobile.png'});
 check(await page.locator('#visitorCount').evaluate(e=>{const r=e.getBoundingClientRect(),h=e.closest('header').getBoundingClientRect();return r.height>0&&r.bottom<=h.bottom&&r.right<=innerWidth&&e.scrollWidth<=e.clientWidth;}),'counter fits narrow header');
 requests.length=0;await page.reload();await ready();check(requests.length===1&&requests[0].url.includes('/count?'),'fresh cache avoids repeated reads');
 requests.length=0;await page.goto('http://127.0.0.1:8784/');await ready();check(requests.length===1&&requests[0].url.endsWith('.json'),'local app reads public count without recording visits');
 await page.evaluate(()=>{const k='starorbit-public-visits-v1',v=JSON.parse(localStorage.getItem(k));v.updatedAt=Date.now()-3600000;localStorage.setItem(k,JSON.stringify(v));});fail=true;requests.length=0;
 await page.reload();await ready();await page.waitForFunction(()=>document.getElementById('visitorCount').textContent.includes('1,234'));
 check((await page.locator('#visitorCount').getAttribute('title')).includes('统计更新'),'offline cache retains timestamp');
 check(await page.evaluate(()=>viewer.sim.initialized),'counter failure leaves simulator ready');
 return checks;
}
