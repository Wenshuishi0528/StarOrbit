import { Vector3, Raycaster, Vector2 } from 'three';
import { t, onLanguageChange, setText } from './i18n.js';
import { spacecraft } from './missions.js';

import { createCameraFocus } from './camera-focus-controller.js';

export function installCameraFocus(sim) {
  const api = sim.api,
    providers = new Map(),
    select = document.getElementById('cameraTarget'),
    button = document.getElementById('centerCameraTarget');
  const position = (object) => object.getWorldPosition(new Vector3());
  providers.set('mission', () => {
    const groups = sim.missions?.activeGroups() || api.groups,
      entries = Object.entries(groups).filter(([, o]) => o?.visible),
      station = entries.filter(([id]) => id !== 'freeXT');
    const root = sim.missions?.bodyRoot() || api.modelRoot;
    const result = [
      {
        id: 'mission',
        name: t(spacecraft(sim.missionId).name),
        key: 'mission',
        objects: station.map(([, o]) => o),
        anchor: () => position(root),
      },
    ];
    if (groups.freeXT?.visible)
      result.push({
        id: 'xuntian',
        name: t('巡天望远镜'),
        key: 'freeXT',
        objects: [groups.freeXT],
        anchor: () =>
          sim.xuntian?.optics?.centerLocal
            ? new Vector3().fromArray(sim.xuntian.optics.centerLocal)
            : position(groups.freeXT),
      });
    const singles = [...result];
    result.push({
      id: 'all',
      name: t('全部航天器'),
      key: null,
      objects: entries.map(([, o]) => o),
      anchor: () =>
        singles
          .reduce((sum, item) => sum.add(item.anchor()), new Vector3())
          .multiplyScalar(1 / singles.length),
    });
    if (sim.capabilities.assembly)
      for (const [id, o] of station)
        result.push({
          id: 'module:' + id,
          name: api.instanceName(id),
          key: id,
          detail: true,
          objects: [o],
          anchor: () => position(o),
        });
    return result;
  });
  const targets = () => {
    const items = [...providers.values()].flatMap((provider) => provider()),
      singles = items.filter((item) => !item.detail && item.id !== 'all' && item.objects?.length),
      all = items.find((item) => item.id === 'all');
    if (all) {
      all.objects = [...new Set(singles.flatMap((item) => item.objects))];
      all.anchor = () =>
        singles
          .reduce((sum, item) => sum.add(item.anchor()), new Vector3())
          .multiplyScalar(1 / Math.max(1, singles.length));
    }
    return items;
  };
  const focus = createCameraFocus({
    camera: api.camera,
    controls: api.controls,
    targets,
    frame: (target, direction) =>
      target.frame
        ? target.frame(direction)
        : api.frameModels(target.key, direction, target.objects),
    enabled: () =>
      sim.view !== 'orbit' &&
      !sim.environment.moon.savedView &&
      !sim.freeFlight?.active &&
      !sim.sceneBusy &&
      !sim.missions?.busy,
    prepare: () => {
      sim.environment.moon.savedView = null;
      setText('lookMoon', '望向月球');
      sim.setView('follow');
    },
  });
  let signature = '',
    missionId = sim.missionId;
  function sync() {
    const items = focus.targets().filter((item) => !item.detail || item.id === focus.selected),
      key = JSON.stringify(items.map((item) => [item.id, item.name]));
    if (signature !== key) {
      select.replaceChildren(...items.map((item) => new Option(item.name, item.id)));
      signature = key;
    }
    select.value = focus.selected;
    button.disabled = select.disabled = !!sim.sceneBusy || !!sim.missions?.busy;
  }
  const center = (id, direction) => {
    const result = focus.focus(id, direction);
    sync();
    return result;
  };
  select.onchange = () => center(select.value);
  button.onclick = () => center();
  const canvas = api.renderer.domElement,
    ray = new Raycaster(),
    point = new Vector2();
  const doubleClick = (event) => {
    if (
      event.button !== 0 ||
      sim.view === 'orbit' ||
      sim.freeFlight?.active ||
      sim.flightLab?.active ||
      sim.sceneBusy
    )
      return;
    const box = canvas.getBoundingClientRect();
    point.set(
      ((event.clientX - box.left) / box.width) * 2 - 1,
      1 - ((event.clientY - box.top) / box.height) * 2
    );
    ray.setFromCamera(point, api.camera);
    const items = focus.targets().filter((item) => !item.detail && item.id !== 'all');
    const hits = items
      .flatMap((item) =>
        ray
          .intersectObjects(item.objects, true)
          .filter((hit) => {
            for (let o = hit.object; o; o = o.parent) if (!o.visible) return false;
            return true;
          })
          .slice(0, 1)
          .map((hit) => ({ id: item.id, distance: hit.distance }))
      )
      .sort((a, b) => a.distance - b.distance);
    if (hits.length) {
      event.preventDefault();
      center(hits[0].id);
    }
  };
  canvas.addEventListener('dblclick', doubleClick);
  onLanguageChange(() => {
    signature = '';
    sync();
  });
  sync();
  focus.adopt(sim.missions?.state.cameraTarget) || focus.adopt('mission');
  sync();
  return {
    ...focus,
    focus: center,
    get selected() {
      return focus.selected;
    },
    restore(id) {
      missionId = sim.missionId;
      focus.adopt(id) || focus.adopt('mission');
      focus.resetAnchor();
      sync();
    },
    update() {
      if (missionId !== sim.missionId) {
        missionId = sim.missionId;
        focus.adopt('mission');
        focus.resetAnchor();
      }
      focus.update();
      sync();
    },
    register(id, provider) {
      providers.set(id, provider);
      sync();
      return () => {
        providers.delete(id);
        focus.update();
        sync();
      };
    },
  };
}
