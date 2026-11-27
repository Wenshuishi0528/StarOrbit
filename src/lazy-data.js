// 启动包之外的大型数据：首次使用时才加载，并发调用共享同一次加载。
// 失败不缓存：load() 可立即重试；get() 的后台请求失败后等待 retryMs 再自动重试，
// 以免渲染循环每帧重复请求和报错。
export function lazyData(importer, { label = '数据', retryMs = 30000 } = {}) {
  let value = null,
    pending = null,
    retryAt = -Infinity;
  function load() {
    return (pending ??= Promise.resolve()
      .then(importer)
      .then(
        (result) => (value = result),
        (error) => {
          pending = null;
          throw error;
        }
      ));
  }
  return {
    load,
    // 同步读取：已加载时返回数据；否则在后台开始加载并返回 null。
    get() {
      if (value || pending || performance.now() < retryAt) return value;
      load().catch((error) => {
        retryAt = performance.now() + retryMs;
        console.error(label + '加载失败', error);
      });
      return value;
    },
  };
}
