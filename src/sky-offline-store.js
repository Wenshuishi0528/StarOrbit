// Offline packages share compressed files. Membership, counters and deletion of
// the last reference commit in one transaction, including across browser tabs.
const stores = ['packages', 'files', 'members'];

export function createSkyOfflineStore({
  indexedDB: backend,
  database = 'starorbit-sky-offline-v1',
} = {}) {
  let opening,
    db,
    closed = false;
  function open() {
    return (opening ??= new Promise((resolve, reject) => {
      const indexedDB = backend ?? globalThis.indexedDB;
      if (closed || !indexedDB) return reject(Error('此浏览器无法保存离线影像'));
      const request = indexedDB.open(database, 1);
      request.onupgradeneeded = () => {
        const connection = request.result;
        connection.createObjectStore('packages', { keyPath: 'id' });
        connection.createObjectStore('files', { keyPath: 'key' });
        const members = connection.createObjectStore('members', { keyPath: ['id', 'key'] });
        members.createIndex('byPackage', 'id');
        members.createIndex('byFile', 'key');
      };
      request.onsuccess = () => {
        if (closed) {
          request.result.close();
          reject(Error('下载任务已结束'));
          return;
        }
        db = request.result;
        db.onversionchange = () => {
          db.close();
          db = null;
          opening = null;
        };
        resolve(db);
      };
      request.onerror = request.onblocked = () => reject(Error('此浏览器无法保存离线影像'));
    }));
  }
  async function run(names, mode, action) {
    const connection = await open();
    return new Promise((resolve, reject) => {
      const tx = connection.transaction(names, mode);
      let result, error;
      function watch(request, cb) {
        request.onsuccess = () => {
          try {
            cb(request.result);
          } catch (cause) {
            error = cause;
            tx.abort();
          }
        };
      }
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(error || tx.error || Error('离线存储失败'));
      action(Object.fromEntries(names.map((n) => [n, tx.objectStore(n)])), watch, (value) => {
        result = value;
      });
    });
  }
  function begin(meta, token) {
    return run(['packages'], 'readwrite', ({ packages }, watch, result) => {
      watch(packages.get(meta.id), (old) => {
        const record = old || { ...meta, count: 0, bytes: 0, complete: false };
        if (!record.complete) packages.put({ ...record, token });
        result(record);
      });
    });
  }
  // A preliminary attach with no buffer can claim a file already saved by
  // another package. Reading its byte counter doesn't deserialize other files.
  function attach(id, token, key, buffer, type, optional = false) {
    return run(stores, 'readwrite', ({ packages, files, members }, watch, result) => {
      watch(packages.get(id), (pack) => {
        if (!pack || pack.token !== token) throw new DOMException('下载任务已结束', 'AbortError');
        watch(members.get([id, key]), (existing) => {
          if (existing) return result(pack);
          const link = (size) => {
            members.put({ id, key });
            pack.bytes += size;
            if (!optional) pack.count++;
            packages.put(pack);
            result(pack);
          };
          watch(files.get(key), (file) => {
            if (file) return link(file.buffer.byteLength);
            if (!buffer?.byteLength) return result(null);
            files.put({ key, buffer, type });
            link(buffer.byteLength);
          });
        });
      });
    });
  }
  function finish(id, token) {
    return run(['packages'], 'readwrite', ({ packages }, watch, result) => {
      watch(packages.get(id), (pack) => {
        if (!pack || pack.token !== token) throw new DOMException('下载任务已结束', 'AbortError');
        if (pack.count !== pack.total) throw Error('离线影像尚未完整保存');
        pack.complete = true;
        delete pack.token;
        packages.put(pack);
        result(pack);
      });
    });
  }
  function remove(id) {
    return run(stores, 'readwrite', ({ packages, files, members }, watch) => {
      packages.delete(id);
      watch(members.index('byPackage').openCursor(id), (cursor) => {
        if (!cursor) return;
        const key = cursor.value.key;
        cursor.delete();
        watch(members.index('byFile').count(key), (count) => {
          if (!count) files.delete(key);
          cursor.continue();
        });
      });
    });
  }
  return {
    begin,
    attach,
    finish,
    remove,
    list: () =>
      run(['packages'], 'readonly', ({ packages }, watch, result) =>
        watch(packages.getAll(), result)
      ),
    get: (key) =>
      run(['files'], 'readonly', ({ files }, watch, result) =>
        watch(files.get(key), (file) =>
          result(file ? new Blob([file.buffer], { type: file.type }) : null)
        )
      ),
    close() {
      closed = true;
      db?.close();
    },
  };
}
