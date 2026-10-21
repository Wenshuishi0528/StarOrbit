import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Matrix4,Vector3} from 'three';
import {PORT_KEYS,describeAssembly,replaceAttachment,attachmentPort,placementMatrices} from '../src/assembly.js';

const meta=JSON.parse(fs.readFileSync(new URL('../assets/model.json',import.meta.url)));
const matrix=rows=>new Matrix4().set(...rows.flat());
const position=m=>new Vector3().setFromMatrixPosition(m);
const normal=m=>new Vector3(0,0,1).transformDirection(m);
const close=(a,b,epsilon=1e-5)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const defaults={TH_WENTIAN:'WT',TH_MENGTIAN:'MT',TH_FORWARD:'SZ',TH_LOWER:'',TH_AFT:'TZ'};
const legacy=describeAssembly(defaults),legacyPoses=placementMatrices(meta,legacy);
assert.deepEqual(legacy.slots,defaults);
assert.equal(legacy.cores.length,1);
// Every existing spacecraft keeps its original assembled pose.
for(const type of ['WT','MT','TZ','SZ']){
 const id=Object.keys(defaults).find(key=>defaults[key]===type);
 legacyPoses.get(id).elements.forEach((value,index)=>close(value,matrix(meta.modules[type].matrix).elements[index]));
}

let slots=Object.fromEntries(PORT_KEYS.map(port=>[port,'TH']));
slots=replaceAttachment(slots,'TH_FORWARD/TH_FORWARD','TH');
slots=replaceAttachment(slots,'TH_FORWARD/TH_FORWARD/TH_LOWER','TH');
slots=replaceAttachment(slots,'TH_FORWARD/TH_FORWARD/TH_LOWER/TH_MENGTIAN','MT');
slots=replaceAttachment(slots,'TH_WENTIAN/TH_FORWARD','WT');
slots=replaceAttachment(slots,'TH_WENTIAN/TH_LOWER','SZ');
slots=replaceAttachment(slots,'TH_AFT/TH_WENTIAN','TZ');
const graph=describeAssembly(slots),poses=placementMatrices(meta,graph);
assert.equal(graph.cores.length,8);
assert.equal(graph.ports.length,5+7*4);
assert.equal(graph.instances.length,12);
for(const core of graph.cores){
 const ports=graph.ports.filter(p=>p.coreId===core.id);
 assert.equal(ports.length,core.parentId?4:5);
 assert.equal(ports.some(p=>p.port==='TH_AFT'),!core.parentId);
}
for(const item of graph.instances){
 if(!item.parentId)continue;
 const host=poses.get(item.parentId).clone().multiply(matrix(meta.modules.TH.ports[item.hostPort]));
 const incoming=poses.get(item.id).clone().multiply(attachmentPort(meta,item.type));
 // Independently check docking centers, separation along the host normal,
 // opposed port normals and preserved handedness, including rotated parents.
 const delta=position(incoming).sub(position(host)),outward=normal(host);
 close(delta.dot(outward),6);
 close(delta.clone().addScaledVector(outward,-6).length(),0);
 close(normal(incoming).dot(outward),-1);
 close(poses.get(item.id).determinant(),1);
 if(item.type==='TH'){
  const aft=poses.get(item.id).clone().multiply(matrix(meta.modules.TH.ports.TH_AFT));
  close(position(aft).distanceTo(position(incoming)),0);
  const front=poses.get(item.id).clone().multiply(matrix(meta.modules.TH.ports.TH_FORWARD));
  assert.ok(position(front).sub(position(aft)).dot(outward)>79.99,'New core extends outward, away from its parent');
 }
}

// Replacing a core removes only its descendants; another branch stays intact.
const pruned=replaceAttachment(slots,'TH_FORWARD','XT');
assert.equal(pruned.TH_FORWARD,'XT');
assert.ok(!Object.keys(pruned).some(id=>id.startsWith('TH_FORWARD/')));
assert.equal(pruned['TH_WENTIAN/TH_FORWARD'],'WT');
const removed=replaceAttachment(slots,'TH_WENTIAN','');
assert.ok(!Object.keys(removed).some(id=>id.startsWith('TH_WENTIAN/')));
assert.equal(removed['TH_AFT/TH_WENTIAN'],'TZ');
assert.deepEqual(replaceAttachment(slots,'TH_FORWARD/TH_AFT','SZ'),describeAssembly(slots).slots);
assert.deepEqual(describeAssembly({...defaults,'TH_FORWARD/TH_LOWER':'WT','TH_LOWER':'unknown'}).slots,defaults);
assert.deepEqual(describeAssembly(null).slots,Object.fromEntries(PORT_KEYS.map(port=>[port,''])));

// A longer chain remains data-driven, with no fixed instance-count/depth limit.
const chain={};let id='TH_FORWARD';
for(let i=0;i<40;i++){chain[id]='TH';id+='/TH_FORWARD';}
const deep=describeAssembly(chain);
assert.equal(deep.cores.length,41);
assert.equal(deep.ports.length,165);
assert.equal(placementMatrices(meta,deep).size,41);
assert.deepEqual(describeAssembly(JSON.parse(JSON.stringify(slots))).slots,slots);
console.log({legacyPoses:'unchanged',rootPorts:5,addedCorePorts:4,recursiveDocking:'pass',branchRemoval:'pass',chainCores:41});
