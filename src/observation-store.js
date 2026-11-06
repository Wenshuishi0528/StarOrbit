// Observations are small recipes. Pictures and immutable orbit archives are loaded on demand.
const STORES = ['records', 'images', 'thumbnails', 'orbits'];
const KINDS = new Set(['balcony', 'exposure', 'survey', 'survey-photo']);
const DB_NAME = 'starorbit-observations-v1';
let sequence = 0;
function uniqueId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    Date.now().toString(36) +
      '-' +
      (++sequence).toString(36) +
      '-' +
      Math.random().toString(36).slice(2)
  );
}
function newerFirst(a, b) {
  return (b.savedOrder ?? b.savedAt) - (a.savedOrder ?? a.savedAt) || b.id.localeCompare(a.id);
}
function nextOrder(time, previous) {
  return previous === undefined ? time : Math.max(time, previous + 1);
}

async function archiveOrbit(data) {
  if (!data) return null;
  if (!Array.isArray(data.rows) || !data.rows.length) throw Error('观测记录缺少有效的轨道数据');
  const json = JSON.stringify(data);
  let key = uniqueId(),
    compareText = true;
  if (globalThis.crypto?.subtle) {
    try {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
      key = Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, '0')).join('');
      compareText = false;
    } catch {
      /* Restricted browser contexts still share byte-identical archives. */
    }
  }
  return {
    key,
    json,
    compareText,
    provenance: {
      source: data.source || '',
      epoch: data.gpEpoch || data.created || '',
      first: data.rows[0][0],
      last: data.rows.at(-1)[0],
      missionId: data.missionId || '',
    },
  };
}

async function smallPreview(image) {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  let bitmap;
  try {
    bitmap = await createImageBitmap(image);
    const scale = Math.min(1, 360 / bitmap.width, 240 / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.84));
    return blob ? { bytes: await blob.arrayBuffer(), type: blob.type } : null;
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

function openArchive(name) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (db) => {
      if (settled) db?.close();
      else {
        settled = true;
        resolve(db);
      }
    };
    try {
      const request = indexedDB.open(name, 2);
      request.onupgradeneeded = (event) => {
        const db = request.result;
        const records = event.oldVersion
          ? request.transaction.objectStore('records')
          : db.createObjectStore('records', { keyPath: 'id' });
        if (!event.oldVersion) {
          records.createIndex('kind', 'kind');
          records.createIndex('orbitRef', 'orbitRef');
          for (const name of STORES.slice(1))
            db.createObjectStore(name, { keyPath: name === 'orbits' ? 'key' : 'id' });
        }
        records.createIndex('savedOrder', 'savedOrder');
        if (event.oldVersion) {
          // Preserve version-one display order. Existing photographs stay in their own stores.
          const all = records.getAll();
          all.onsuccess = () => {
            let previous;
            for (const record of all.result.sort(newerFirst).reverse()) {
              record.savedOrder = nextOrder(record.savedAt, previous);
              previous = record.savedOrder;
              records.put(record);
            }
          };
        }
      };
      request.onsuccess = () => finish(request.result);
      request.onerror = request.onblocked = () => finish(null);
    } catch {
      finish(null);
    }
  });
}
function transaction(db, stores, mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const request = action(tx);
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = tx.onabort = () => reject(tx.error || Error('观测记录存储失败'));
  });
}

export class ObservationStore {
  constructor(name = DB_NAME) {
    this.name = name;
    this.listeners = new Set();
    this.memory = Object.fromEntries(STORES.map((name) => [name, new Map()]));
    this.persistent = true;
  }
  open() {
    if (!this.ready) {
      this.ready = openArchive(this.name).then((db) => {
        this.persistent = !!db;
        if (db) {
          db.onversionchange = () => {
            db.close();
            this.ready = null;
            this.channel?.close();
            this.channel = null;
          };
          if (typeof BroadcastChannel === 'function') {
            this.channel = new BroadcastChannel(this.name);
            this.channel.onmessage = (e) => this.notify(e.data);
          }
        }
        return db;
      });
    }
    return this.ready;
  }
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  notify(change) {
    for (const fn of this.listeners) {
      try {
        fn(change);
      } catch (error) {
        console.error('Observation log listener:', error);
      }
    }
  }
  changed(change) {
    this.notify(change);
    this.channel?.postMessage(change);
  }

  async save(recipe, { image = null, orbit = null } = {}) {
    if (
      !recipe ||
      !KINDS.has(recipe.kind) ||
      !Number.isFinite(new Date(recipe.time).getTime()) ||
      !Number.isFinite(recipe.time)
    )
      throw Error('无法保存这次观测');
    if (
      image !== null &&
      (!(image instanceof Blob) || !image.size || !image.type.startsWith('image/'))
    )
      throw Error('观测照片无效');
    const id = uniqueId();
    const [db, archive, imageBytes, preview] = await Promise.all([
      this.open(),
      archiveOrbit(orbit),
      image?.arrayBuffer(),
      image && smallPreview(image),
    ]);
    const record = {
      ...structuredClone(recipe),
      id,
      savedAt: Date.now(),
      version: 1,
      hasImage: !!image,
      hasThumbnail: !!preview,
      orbitRef: archive?.key || null,
      orbitInfo: archive?.provenance || null,
    };
    const full = image ? { id, bytes: imageBytes, type: image.type } : null;
    if (db) {
      await transaction(db, STORES, 'readwrite', (tx) => {
        const records = tx.objectStore('records');
        // The read/write transaction serializes retakes across tabs, including
        // saves in the same millisecond and computers whose wall clock went back.
        const append = () => {
          const last = records.index('savedOrder').openKeyCursor(null, 'prev');
          last.onsuccess = () => {
            record.savedOrder = nextOrder(record.savedAt, last.result?.key);
            records.add(record);
          };
        };
        if (full) tx.objectStore('images').add(full);
        if (preview) tx.objectStore('thumbnails').add({ id, ...preview });
        if (!archive) {
          append();
          return;
        }
        const orbits = tx.objectStore('orbits');
        const existing = archive.compareText ? orbits.getAll() : orbits.getKey(archive.key);
        existing.onsuccess = () => {
          const archivedKey = archive.compareText
            ? existing.result.find((item) => item.json === archive.json)?.key
            : existing.result;
          if (archivedKey === undefined) orbits.add({ key: archive.key, json: archive.json });
          else record.orbitRef = archivedKey;
          append();
        };
      });
    } else {
      if (archive?.compareText) {
        const existing = Array.from(this.memory.orbits.values()).find(
          (item) => item.json === archive.json
        );
        if (existing) record.orbitRef = existing.key;
      }
      record.savedOrder = nextOrder(record.savedAt, this.lastOrder);
      this.lastOrder = record.savedOrder;
      this.memory.records.set(id, record);
      if (full) this.memory.images.set(id, full);
      if (preview) this.memory.thumbnails.set(id, { id, ...preview });
      if (archive && !this.memory.orbits.has(record.orbitRef))
        this.memory.orbits.set(record.orbitRef, archive);
    }
    this.changed({ type: 'save', id, kind: record.kind, fieldId: record.fieldId });
    return structuredClone(record);
  }

  async read(store, key) {
    const db = await this.open();
    return db
      ? transaction(db, store, 'readonly', (tx) => tx.objectStore(store).get(key))
      : this.memory[store].get(key);
  }
  async get(id) {
    const record = await this.read('records', id);
    return record ? structuredClone(record) : null;
  }
  async list({ kind, fieldId, tile } = {}) {
    const db = await this.open();
    let records;
    if (db) {
      records = await transaction(db, 'records', 'readonly', (tx) => {
        const store = tx.objectStore('records');
        return kind ? store.index('kind').getAll(kind) : store.getAll();
      });
    } else records = Array.from(this.memory.records.values(), (item) => structuredClone(item));
    return records
      .filter(
        (record) =>
          (!kind || record.kind === kind) &&
          (!fieldId || record.fieldId === fieldId) &&
          (tile === undefined || record.tile === tile)
      )
      .sort(newerFirst);
  }
  async orbit(ref) {
    if (!ref) return null;
    const entry = await this.read('orbits', ref);
    if (!entry) throw Error('这条记录的轨道副本不可用');
    return JSON.parse(entry.json);
  }
  async picture(store, id) {
    const entry = await this.read(store, id);
    return entry ? new Blob([entry.bytes], { type: entry.type }) : null;
  }
  image(id) {
    return this.picture('images', id);
  }
  thumbnail(id) {
    return this.picture('thumbnails', id);
  }
  async remove(id) {
    const db = await this.open();
    if (db) {
      await transaction(db, STORES, 'readwrite', (tx) => {
        const records = tx.objectStore('records'),
          old = records.get(id);
        old.onsuccess = () => {
          if (!old.result) return;
          const { orbitRef } = old.result;
          records.delete(id);
          tx.objectStore('images').delete(id);
          tx.objectStore('thumbnails').delete(id);
          if (orbitRef) {
            const remaining = records.index('orbitRef').count(orbitRef);
            remaining.onsuccess = () => {
              if (!remaining.result) tx.objectStore('orbits').delete(orbitRef);
            };
          }
        };
      });
    } else {
      const old = this.memory.records.get(id);
      for (const name of ['records', 'images', 'thumbnails']) this.memory[name].delete(id);
      if (
        old?.orbitRef &&
        !Array.from(this.memory.records.values()).some((r) => r.orbitRef === old.orbitRef)
      )
        this.memory.orbits.delete(old.orbitRef);
    }
    this.changed({ type: 'remove', id });
  }
  dispose() {
    this.listeners.clear();
    this.channel?.close();
    this.ready?.then((db) => db?.close());
  }
}
