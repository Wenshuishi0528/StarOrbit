import * as THREE from 'three';
import {createOrbitControls} from './camera-controls.js';
import {createFreeFlightAssembly} from './free-flight-assembly.js';

const toVector = xyz => new THREE.Vector3().fromArray(xyz);
const zenith = new THREE.Vector3(0, 0, 1);

// Find a usable rectangle after the pilot moves a floating panel. Recomputed
// only on layout changes; moving UI does not change the ship's physical aim.
export function freeFlightViewport(width,height,obstacles=[]){
  const outer={left:.04*width,right:.96*width,top:.04*height,bottom:.96*height};
  const blocks=obstacles.filter(r=>r.width>0&&r.height>0).map(r=>({left:Math.max(outer.left,r.left-10),right:Math.min(outer.right,r.right+10),
    top:Math.max(outer.top,r.top-10),bottom:Math.min(outer.bottom,r.bottom+10)})).filter(r=>r.right>r.left&&r.bottom>r.top);
  const xs=[...new Set([outer.left,outer.right,...blocks.flatMap(r=>[r.left,r.right])])].sort((a,b)=>a-b);
  const ys=[...new Set([outer.top,outer.bottom,...blocks.flatMap(r=>[r.top,r.bottom])])].sort((a,b)=>a-b);
  let best=null,score=0;
  for(let i=0;i<xs.length-1;i++)for(let j=i+1;j<xs.length;j++)for(let k=0;k<ys.length-1;k++)for(let l=k+1;l<ys.length;l++){
    const box={left:xs[i],right:xs[j],top:ys[k],bottom:ys[l]},w=box.right-box.left,h=box.bottom-box.top;
    if(w<width*.12||h<height*.12||blocks.some(b=>box.left<b.right&&box.right>b.left&&box.top<b.bottom&&box.bottom>b.top))continue;
    if(w*h>score){best=box;score=w*h;}
  }
  // If panels cover the entire scene, keep finite optics until the user moves
  // or closes one; never manufacture a negative viewport or offscreen camera.
  best??=outer;
  return {left:best.left/width,right:best.right/width,top:best.top/height,bottom:best.bottom/height};
}

function createLine(points, color, opacity, loop = false) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false,toneMapped:false});
  return loop ? new THREE.LineLoop(geometry, material) : new THREE.Line(geometry, material);
}

function createGuide() {
  const root = new THREE.Group();
  const ring = Array.from({length:48}, (_, i) => {
    const a = i * Math.PI / 24;
    return new THREE.Vector3(.03, Math.cos(a) * .94, Math.sin(a) * .94);
  });
  root.add(createLine(ring, 0x83e4d4, .9, true));
  const approach = new THREE.BufferGeometry().setFromPoints([1,3,5,8,11,15,19,24,30,36].map(x => new THREE.Vector3(x,0,0)));
  root.add(new THREE.LineSegments(approach, new THREE.LineBasicMaterial({color:0x75d9cb,transparent:true,opacity:.58,depthWrite:false})));
  return root;
}

function createTrail() {
  const positions = new THREE.Float32BufferAttribute(3 * 512, 3).setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry().setAttribute('position', positions);
  geometry.setDrawRange(0, 0);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({color:0xf3be7b,transparent:true,opacity:.72,depthWrite:false}));
  line.frustumCulled = false;
  function update(points) {
    const count = Math.min(positions.count, points?.length || 0);
    for (let i = 0; i < count; i++) {
      const v = points[points.length - count + i];
      positions.setXYZ(i, v[0], v[1], v[2]);
    }
    geometry.setDrawRange(0, count);
    if (count) positions.needsUpdate = true;
  }
  return {line, update};
}

export function createFreeFlightScene(sim, {templates, meta}, snapshot) {
  const assembly = createFreeFlightAssembly(templates, meta, snapshot);
  const {renderer,stage} = sim.api;
  const scene = new THREE.Scene();
  const external = new THREE.PerspectiveCamera(42, 1, .08, 20000);
  const onboard = new THREE.PerspectiveCamera(52, 1, .015, 20000);
  external.up.copy(zenith);
  const touchAction = renderer.domElement.style.touchAction;
  const controls = createOrbitControls(external, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .12;
  controls.minDistance = 1.5; controls.maxDistance = 15000; controls.enablePan = true;
  const sun = new THREE.DirectionalLight(0xfff6e6, 3);
  sun.position.set(12,-8,16);
  const fill = new THREE.HemisphereLight(0xe6f3ff, 0x667785, 1.35);
  const guide = createGuide(), trail = createTrail();
  scene.add(assembly.root, fill, sun, guide, trail.line);

  let view = 'external', active = null, states = assembly.definitions, cameraTarget = 'active';
  let disposed = false;
  let layoutDirty = true, viewportWidth = 0, viewportHeight = 0;
  let usable = {left:.04,right:.96,top:.04,bottom:.96};
  const panel = document.getElementById('freeFlightPanel');
  const instruments = document.getElementById('freeFlightInstruments');
  const instrumentStack = instruments?.querySelector('.ffi-stack');
  const instrumentCards = [...(instruments?.querySelectorAll?.('.ffi-card')??[])];
  let instrumentsVisible = null;
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {layoutDirty = true;}) : null;
  const changedLayout=()=>{layoutDirty=true;};
  document.addEventListener('floating-window-layout',changedLayout);
  resizeObserver?.observe(stage);
  if (panel) resizeObserver?.observe(panel);
  if (instrumentStack) resizeObserver?.observe(instrumentStack);
  for(const card of instrumentCards)resizeObserver?.observe(card);
  const previousCenter = new THREE.Vector3();
  function eye() { return view === 'onboard' ? onboard : external; }
  function refreshViewport() {
    const width = Math.max(1,stage.clientWidth), height = Math.max(1,stage.clientHeight);
    const resized = width !== viewportWidth || height !== viewportHeight;
    const shown = !!instrumentStack && !instruments.hidden;
    // The HUD is shown by readouts after the first rendered frame. Detect its
    // visibility independently of viewport resizing, including navball toggles.
    if (shown !== instrumentsVisible) {instrumentsVisible = shown; layoutDirty = true;}
    if (!resized && !layoutDirty) return false;
    viewportWidth = width; viewportHeight = height; layoutDirty = false;
    const rect = stage.getBoundingClientRect();
    const previousUsable = usable;
    const cards=shown?instrumentCards.filter(el=>!el.hidden):[];
    const panels=[panel,...(cards.length?cards:shown?[instrumentStack]:[])].filter(Boolean);
    usable=freeFlightViewport(width,height,panels.map(el=>{
      const r=el.getBoundingClientRect();return {...r,width:r.width,height:r.height,left:r.left-rect.left,right:r.right-rect.left,top:r.top-rect.top,bottom:r.bottom-rect.top};
    }));
    for (const camera of [external,onboard]) camera.aspect = width / height;
    external.updateProjectionMatrix();
    // Keep the optical axis in the free portion of the window. The camera is
    // still bolted to the port: shifting the principal point does not steer it.
    const centerX = (usable.left + usable.right) / 2, centerY = (usable.top + usable.bottom) / 2;
    onboard.setViewOffset(width,height,(.5-centerX)*width,(.5-centerY)*height,width,height);
    return resized || usable.left !== previousUsable.left || usable.right !== previousUsable.right || usable.top !== previousUsable.top || usable.bottom !== previousUsable.bottom;
  }
  function aimPortCamera() {
    if (!active) return;
    // This virtual centreline camera looks through the actual mating port.
    // It uses the ship orientation, so a missed alignment remains visible.
    const q = active.craft.quaternion;
    onboard.position.copy(active.localPort).applyQuaternion(q).add(active.craft.position);
    onboard.up.copy(zenith).applyQuaternion(q);
    const gaze = new THREE.Vector3(-1,0,0).applyQuaternion(q);
    onboard.lookAt(onboard.position.clone().add(gaze));
    onboard.updateMatrixWorld(true);
  }
  function focusShip() {
    return cameraTarget === 'active' ? active : assembly.ships.get(cameraTarget.slice(5));
  }
  function focusBounds() {
    const ship = focusShip();
    if (ship) return new THREE.Box3().setFromObject(ship.craft);
    const bounds = assembly.stationBounds.clone();
    for (const [id,body] of assembly.ships) {
      if (cameraTarget === 'all' || states.find(state => state.id === id)?.status === 'docked') bounds.expandByObject(body.craft);
    }
    return bounds;
  }
  function focusAnchor() {
    const ship = focusShip();
    if (ship) return ship.craft.position.clone();
    const bounds = assembly.stationBounds.clone();
    // Whole-formation following needs positions only, not a traversal of every
    // CAD mesh on every frame. Fitting uses the full model bounds separately.
    if (cameraTarget === 'all') for (const body of assembly.ships.values()) bounds.expandByPoint(body.craft.position);
    return bounds.getCenter(new THREE.Vector3());
  }
  function setCameraTarget(value) {
    const next = ['active','station','all'].includes(value) || typeof value === 'string' && value.startsWith('ship:') && assembly.ships.has(value.slice(5)) ? value : 'active';
    cameraTarget = next;
    fit();
  }
  function fit(firstAngle = false) {
    refreshViewport();
    const bounds = focusBounds();
    const center = bounds.getCenter(new THREE.Vector3());
    const direction = external.position.clone().sub(controls.target);
    const focused = focusShip();
    if (firstAngle && focused) {
      // Look across this port, with the Earth limb just above the spacecraft.
      // The aft-mounted Tianzhou then remains visible beside Tianhe as well.
      const axis = focused.outward;
      if (Math.hypot(axis.x,axis.y) > .2) direction.set(axis.y + .22 * axis.x, -axis.x + .22 * axis.y, .46);
      else direction.set(.8, -1, .54);
    }
    if (direction.lengthSq() < .01) direction.set(1,-1,.64);
    direction.normalize();
    const right = zenith.clone().cross(direction);
    if (right.lengthSq() < 1e-10) right.set(1,0,0);
    right.normalize();
    const vertical = direction.clone().cross(right);
    const {left,right:rightEdge,top,bottom} = usable;
    const kx = left + rightEdge - 1, ky = 1 - top - bottom;
    const tanV = Math.tan(THREE.MathUtils.degToRad(external.fov * .5)), tanH = tanV * external.aspect;
    let distance = 8;
    for (const x of [bounds.min.x,bounds.max.x]) for (const y of [bounds.min.y,bounds.max.y]) for (const z of [bounds.min.z,bounds.max.z]) {
      const point = new THREE.Vector3(x,y,z).sub(center), depth = point.dot(direction);
      distance = Math.max(distance,depth + Math.abs(point.dot(right)/tanH + kx*depth) / (rightEdge-left),
        depth + Math.abs(point.dot(vertical)/tanV + ky*depth) / (bottom-top));
    }
    distance *= 1.05;
    controls.maxDistance = Math.max(15000,distance*1.1);
    const aim = center.addScaledVector(right,-kx*tanH*distance).addScaledVector(vertical,-ky*tanV*distance);
    controls.stopMotion();controls.target.copy(aim);
    external.position.copy(aim).addScaledVector(direction,distance);
    controls.update();external.updateMatrixWorld(true);previousCenter.copy(focusAnchor());
  }
  function setView(value) {
    view = value === 'onboard' ? 'onboard' : 'external';
    layoutDirty = true;refreshViewport();
    controls.enabled = view === 'external';
    if (active) active.craft.visible = view !== 'onboard';
    aimPortCamera();
  }
  function update(ships,activeId,{trail:points,guide:showGuide=true,sunLocal,illumination=1}={}) {
    if (disposed) return;
    states = ships;
    const selected = assembly.ships.get(activeId);
    const changed = selected !== active;
    for (const state of ships) {
      const ship = assembly.ships.get(state.id);
      if (!ship) continue;
      ship.craft.position.fromArray(state.position);
      ship.craft.quaternion.fromArray(state.quaternion).normalize();
      ship.craft.visible = view !== 'onboard' || selected !== ship;
    }
    active = selected;
    const viewportChanged = refreshViewport();
    if (active) {
      if (changed && cameraTarget === 'active' || viewportChanged) fit(changed && cameraTarget === 'active');
      else {
        // Follow translation only; a rolling vehicle keeps the exterior horizon
        // steady and preserves the player's orbit/pan offset.
        const motion = focusAnchor().sub(previousCenter);
        controls.target.add(motion);external.position.add(motion);
      }
      previousCenter.copy(focusAnchor());
      guide.position.copy(active.port);guide.quaternion.copy(active.dockedOrientation);
    }
    guide.visible = !!active && showGuide;
    trail.update(points);
    sun.intensity = 3.4 * THREE.MathUtils.clamp(illumination,0,1);
    if (sunLocal) sun.position.copy(toVector(sunLocal)).normalize().multiplyScalar(100);
    if (view === 'onboard') aimPortCamera();
    else if (controls.enabled) controls.update();
    external.updateMatrixWorld(true);
  }
  function getDockingProjection() {
    if (!active) return null;
    const local = active.port.clone().applyMatrix4(onboard.matrixWorldInverse);
    const behind = local.z >= 0;
    const projected = local.clone().applyMatrix4(onboard.projectionMatrix);
    const bore = new THREE.Vector3(0,0,-1).applyMatrix4(onboard.projectionMatrix);
    return {x:Number.isFinite(projected.x)?projected.x:0,y:Number.isFinite(projected.y)?projected.y:0,
      visible:!behind&&-local.z>=onboard.near&&projected.z>=-1&&projected.z<=1&&Math.abs(projected.x)<=1&&Math.abs(projected.y)<=1,
      behind,forwardDistance:-local.z,bore:{x:bore.x,y:bore.y},fov:onboard.fov,aspect:onboard.aspect,
      bounds:{left:2*usable.left-1,right:2*usable.right-1,bottom:1-2*usable.bottom,top:1-2*usable.top}};
  }
  function draw() {
    if (disposed) return;
    const autoClear = renderer.autoClear;
    try {
      renderer.autoClear = false;
      renderer.state.buffers.depth.setMask(true);renderer.clearDepth();
      renderer.render(scene,eye());
    } finally { renderer.autoClear = autoClear; }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;resizeObserver?.disconnect();document.removeEventListener('floating-window-layout',changedLayout);controls.dispose();renderer.domElement.style.touchAction = touchAction;
    for (const object of [guide,trail.line]) object.traverse(node => {
      node.geometry?.dispose();node.material?.dispose();
    });
    scene.clear();
  }
  external.position.set(40,-60,32);
  fit();
  return {definitions:assembly.definitions,
    collides:(before,after,def,allShips=states,limits) => assembly.collides(before,after,def,allShips,limits),
    update,setView,setCameraTarget,fit,draw,dispose,getDockingProjection,get cameraTarget(){return cameraTarget;},get camera(){return eye();}};
}
