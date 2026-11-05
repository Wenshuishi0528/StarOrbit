async page=>{
  await page.waitForFunction(()=>!!window.viewer?.sim.observations,null,{timeout:55000});
  return await page.evaluate(async()=>{
    const check=(ok,msg)=>{if(!ok)throw Error(msg);};
    const Store=viewer.sim.observations.constructor;
    const database='starorbit-test-observations-'+crypto.randomUUID(),a=new Store(database),b=new Store(database);
    try {
      // Upgrade a real version-one journal rather than starting from an empty database.
      await new Promise((resolve,reject)=>{
        const req=indexedDB.open(database,1);
        req.onupgradeneeded=()=>{
          const db=req.result,r=db.createObjectStore('records',{keyPath:'id'});
          r.createIndex('kind','kind');r.createIndex('orbitRef','orbitRef');
          for(const name of ['images','thumbnails','orbits'])db.createObjectStore(name,{keyPath:name==='orbits'?'key':'id'});
          r.add({id:'prior-version',kind:'exposure',time:12345,savedAt:12345,hasImage:false,orbitRef:null});
        };
        req.onsuccess=()=>{req.result.close();resolve();};req.onerror=()=>reject(req.error);
      });
      const legacy=await a.get('prior-version');check(legacy?.time===12345&&legacy.savedOrder===12345,'Previous journal did not migrate');
      await a.remove(legacy.id);
      const orbit=structuredClone(viewer.sim.bundledOrbits.tiangong);
      const t=orbit.rows[3][0],source=orbit.source;
      const canvas=document.createElement('canvas');canvas.width=40;canvas.height=25;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#cb4bf8';ctx.fillRect(0,0,40,25);
      const picture=await new Promise(resolve=>canvas.toBlob(resolve));
      const [first,second]=await Promise.all([
        a.save({kind:'balcony',time:t,missionId:'tiangong',observer:{name:'外景测试',latitude:40,longitude:116,height:48}},{orbit}),
        b.save({kind:'survey-photo',time:t+30,fieldId:'cygnus',tile:3},{orbit:structuredClone(orbit),image:picture})
      ]);
      check(a.persistent&&b.persistent,'Should use real IndexedDB in the local launcher');
      check(first.orbitRef===second.orbitRef&&first.id!==second.id,'Orbit not deduplicated between independent writers');
      check((await a.list({kind:'survey-photo',fieldId:'cygnus',tile:3}))[0]?.id===second.id,'Field and tile index failed');
      const thumb=await b.thumbnail(second.id);check(thumb?.size>0,'Missing reloadable thumbnail');
      const bytes=blob=>blob.arrayBuffer().then(buf=>Array.from(new Uint8Array(buf)).join(','));
      check(await bytes(await a.image(second.id))===await bytes(picture),'Photo bytes were lost');
      orbit.source='MODIFIED AFTER CAPTURE';
      check((await b.orbit(first.orbitRef)).source===source,'Archive changed with the live orbit');
      await b.remove(first.id);check(!!await a.orbit(second.orbitRef),'Deleting one record removed a shared orbit');
      const now=Date.now;let older,retake;
      try {
        Date.now=()=>1700000000000;
        older=await a.save({kind:'survey-photo',time:t,fieldId:'orion',tile:0},{image:picture});
        retake=await b.save({kind:'survey-photo',time:t,fieldId:'orion',tile:0},{image:picture});
      } finally {Date.now=now;}
      const repeat=await a.list({kind:'survey-photo',fieldId:'orion',tile:0});
      check(older.savedAt===retake.savedAt&&repeat[0].id===retake.id&&repeat[1].id===older.id,'Retakes lost insertion order at a fixed clock');
      await a.remove(older.id);await b.remove(retake.id);
      const reader=new Store(database);
      try{check((await reader.get(second.id))?.kind==='survey-photo','Record not durable across handles');}finally{reader.dispose();}
      await a.remove(second.id);check(!await a.image(second.id)&&!await a.thumbnail(second.id),'Photos survived their record');
      let erased=false;try{await a.orbit(first.orbitRef);}catch{erased=true;}check(erased,'Orphaned ephemeris after deleting final reference');
      return {dedup:true,archivedSource:source,originalPNG:picture.size,thumbnail:thumb.size};
    }finally{a.dispose();b.dispose();setTimeout(()=>indexedDB.deleteDatabase(database),1000);}
  });
}
