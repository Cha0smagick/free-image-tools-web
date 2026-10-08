/* PixelLibre — motor de IA auto-hospedado (vendor/imgly, sin dependencias externas) */
(() => {
  'use strict';

  // publicPath DEBE ser una URL absoluta en runtime (el SDK resuelve los
  // chunks con new URL(chunk.hash, publicPath)). Se calcula desde la URL de
  // la página para que funcione bajo el subpath de GitHub Pages.
  const publicPath = new URL('vendor/imgly/', location.href).href;

  let modPromise = null;

  function labelFor(key) {
    if (/fetch/i.test(key)) return 'Descargando modelo…';
    if (/compute/i.test(key)) return 'Procesando imagen…';
    return 'Procesando…';
  }

  function loadModule() {
    if (!modPromise) {
      modPromise = import('./vendor/imgly/background-removal.mjs').catch((err) => {
        modPromise = null; // permite reintento
        throw new Error('No se pudo cargar el motor de IA local. Recarga la página e inténtalo de nuevo.');
      });
    }
    return modPromise;
  }

  function config() {
    return {
      publicPath,
      model: 'medium', // isnet_fp16 (88 MB, auto-hospedado)
      proxyToWorker: true,
    };
  }

  async function run(sourceBlob, onProgress) {
    const mod = await loadModule();
    let lastKey = null;
    return mod.removeBackground(sourceBlob, {
      ...config(),
      progress: (key, current, total) => {
        if (!onProgress || !(total > 0)) return;
        const pct = Math.round((current / total) * 100);
        const label = key !== lastKey ? labelFor(key) : null;
        lastKey = key;
        onProgress(label, pct);
      },
      output: { format: 'image/png', quality: 1.0 }
    });
  }

  // Precarga todos los recursos del modelo (models/medium + wasm) para que
  // queden en la caché del navegador antes del primer recorte.
  async function preload(onProgress) {
    const mod = await loadModule();
    return mod.preload({
      ...config(),
      progress: (key, current, total) => {
        if (!onProgress || !(total > 0)) return;
        const pct = Math.round((current / total) * 100);
        const label = key !== lastKey ? labelFor(key) : null;
        lastKey = key;
        onProgress(label, pct);
      },
    });
  }

  window.BgRemoval = { run, preload, publicPath };
})();
