const zero = () => [0, 0, 0];
const neutral = () => ({
  rotation: zero(),
  translation: zero(),
  brake: false,
  temporarySas: false,
});
const active = (vector) => vector.some(Boolean);

/** Retain a brief press until the next fixed physics step. Focus changes and
 * pauses call clear(), so an abandoned command cannot fire on resume. */
export function createFlightInputBuffer() {
  let held = neutral(),
    pending = neutral();
  return {
    get temporarySas() {
      return held.temporarySas;
    },
    set(value) {
      held = {
        rotation: [...(value.rotation ?? zero())],
        translation: [...(value.translation ?? zero())],
        brake: !!value.brake,
        temporarySas: !!value.temporarySas,
      };
      for (const key of ['rotation', 'translation'])
        if (active(held[key])) pending[key] = [...held[key]];
      pending.brake ||= held.brake;
      pending.temporarySas ||= held.temporarySas;
    },
    take() {
      const next = {
        rotation: [...(active(held.rotation) ? held.rotation : pending.rotation)],
        translation: [...(active(held.translation) ? held.translation : pending.translation)],
        brake: held.brake || pending.brake,
        temporarySas: held.temporarySas || pending.temporarySas,
      };
      pending = neutral();
      return next;
    },
    clear() {
      held = neutral();
      pending = neutral();
    },
  };
}
