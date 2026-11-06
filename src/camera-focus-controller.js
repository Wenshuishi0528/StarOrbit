// Providers expose stable IDs, render objects and a translation anchor. Framing
// is explicit; normal updates translate the camera without changing zoom/roll.
export function createCameraFocus({
  camera,
  controls,
  targets,
  frame,
  prepare = () => {},
  enabled = () => true,
}) {
  let selected = 'mission',
    previous = null,
    pendingFallback = false;
  const available = () => targets().filter((target) => target.objects?.length);
  const find = (id) => available().find((target) => target.id === id);
  function adopt(id) {
    const target = find(id);
    if (!target) return false;
    selected = id;
    previous = target.anchor().clone();
    pendingFallback = false;
    return true;
  }
  function focus(id = selected, direction) {
    const target = find(id) || find('mission');
    if (!target) return false;
    prepare();
    frame(target, direction);
    adopt(target.id);
    return true;
  }
  function update() {
    if (pendingFallback && enabled()) {
      focus('mission');
      return;
    }
    const target = find(selected);
    if (!target) {
      previous = null;
      if (enabled()) focus('mission');
      else {
        selected = 'mission';
        pendingFallback = true;
      }
      return;
    }
    if (!enabled()) return;
    const anchor = target.anchor();
    if (previous) {
      const delta = anchor.clone().sub(previous);
      camera.position.add(delta);
      controls.target.add(delta);
    }
    previous = anchor.clone();
  }
  return {
    focus,
    adopt,
    update,
    targets: available,
    get selected() {
      return selected;
    },
    resetAnchor() {
      previous = null;
    },
  };
}
