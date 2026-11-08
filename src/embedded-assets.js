// Split builds and older single-file builds contain one ordinary JSON node.
// Large portable builds use inert, bounded JSON blocks to avoid browser string
// limits while reconstructing the exact same object used by resource managers.
export function readEmbeddedAssets(node) {
  if (!node) throw new Error('Embedded environment assets are missing');
  const manifest = JSON.parse(node.textContent);
  if (manifest?.format !== 'starorbit-embedded-assets-v1') return manifest;
  if (manifest.owner !== node.id || !/^[a-zA-Z][\w-]*$/.test(node.id))
    throw new Error('Embedded environment manifest is invalid');
  const blocks = [...node.ownerDocument.querySelectorAll(`script[data-asset-owner="${node.id}"]`)];
  if (!blocks.length) throw new Error('Embedded environment blocks are missing');
  let result;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i],
      payload = JSON.parse(block.textContent);
    if (!Array.isArray(payload.patches) || payload.last !== (i === blocks.length - 1))
      throw new Error('Embedded environment blocks are incomplete');
    for (const record of payload.patches) {
      if (!Array.isArray(record) || record.length !== 2 || !Array.isArray(record[0]))
        throw new Error('Embedded environment record is invalid');
      const [path, value] = record;
      if (!path.length) {
        result = value;
        continue;
      }
      let parent = result;
      for (const key of path.slice(0, -1)) {
        if (!parent || !Object.hasOwn(parent, key))
          throw new Error('Embedded environment path is invalid');
        parent = parent[key];
      }
      if (!parent || typeof parent !== 'object')
        throw new Error('Embedded environment parent is invalid');
      // Preserve own JSON keys such as __proto__ without mutating prototypes.
      Object.defineProperty(parent, path.at(-1), {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
    block.remove();
  }
  if (!result || typeof result !== 'object')
    throw new Error('Embedded environment root is invalid');
  return result;
}
