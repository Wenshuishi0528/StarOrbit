// Stream bounded resources and reuse a validated cached payload when HTTP validators match.
// Cross-origin requests use the browser's ordinary conditional cache, avoiding custom CORS headers.
export async function fetchResource(url,{max=16e6,cached=null,onProgress=()=>{},timeout=25000,fetcher=fetch,signal}={}){
 let timedOut=false;const controller=new AbortController(),timer=setTimeout(()=>{timedOut=true;controller.abort();},timeout);
 const cancel=()=>controller.abort();if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
 try{
  const response=await fetcher(url,{cache:'no-cache',signal:controller.signal});
  if(!response.ok){
   const error=Object.assign(Error('HTTP '+response.status),{status:response.status});
   // Only the same-origin relay returns trusted, bounded diagnostic messages.
   if(url.startsWith('/api/')&&response.headers.get('content-type')?.includes('application/json')){
    try{const detail=await response.json(),info=detail.error;
     if(typeof info==='string')error.message=info.slice(0,240);
     else if(typeof info?.message==='string'){error.message=info.message.slice(0,240);if(typeof info.code==='string')error.code=info.code;}
     if(typeof (info?.retryable??detail.retryable)==='boolean')error.retryable=info?.retryable??detail.retryable;
    }catch{}
   }
   throw error;
  }
  const length=Number(response.headers.get('content-length'))||0;
  if(length>max){controller.abort();throw Error('数据超过大小限制');}
  const etag=response.headers.get('etag'),modified=response.headers.get('last-modified');
  const validators={etag:etag||null,lastModified:modified||null,contentLength:length||null};
  if(cached?.blob&&cached.source===url&&((etag&&cached.http?.etag===etag)||(!etag&&modified&&cached.http?.lastModified===modified&&length&&cached.http?.contentLength===length))){
   await response.body?.cancel();return {blob:cached.blob,r:response,unchanged:true,http:validators};
  }
  let blob;
  if(response.body?.getReader){
   const reader=response.body.getReader(),chunks=[];let received=0;
   for(;;){const {done,value}=await reader.read();if(done)break;received+=value.byteLength;
    if(received>max){await reader.cancel();throw Error('数据超过大小限制');}
    chunks.push(value);onProgress({received,total:length||null});
   }
   blob=new Blob(chunks,{type:response.headers.get('content-type')||'application/octet-stream'});
  }else{blob=await response.blob();if(blob.size>max)throw Error('数据超过大小限制');onProgress({received:blob.size,total:length||null});}
  return {blob,r:response,unchanged:false,http:validators};
 }catch(error){if(timedOut&&!signal?.aborted)throw Object.assign(Error('请求超时，请重试；已有数据已保留'),{name:'TimeoutError',retryable:true});throw error;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
export async function blobHash(blob){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');}

// A digest cached earlier in the session cannot establish that WebKit still
// has the file behind this particular IndexedDB Blob handle.
export async function readableBlobMatches(blob,digest){
 try{return await blobHash(blob)===digest;}
 catch(error){if(['NotFoundError','NotReadableError'].includes(error.name))return false;throw error;}
}
