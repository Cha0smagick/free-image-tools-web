/* PixelLibre — carga perezosa del motor de IA (@imgly/background-removal) */
(() => {
  'use strict';

  const CDN = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';

  let modPromise = null;

  function labelFor(key) {
    if (/fetch/i.test(key)) return 'Descargando modelo…';
    if (/compute/i.test(key)) return 'Procesando imagen…';
    return 'Procesando…';
  }

  function loadModule() {
    if (!modPromise) {
      modPromise = import(CDN).catch((err) => {
        modPromise = null;
        if (err instanceof TypeError) {
          throw new Error('Se necesita conexión a internet la primera vez para descargar el modelo de IA');
        }
        throw err;
      });
    }
    return modPromise;
  }

  async function run(sourceBlob, onProgress) {
    const mod = await loadModule();
    let lastKey = null;
    return mod.removeBackground(sourceBlob, {
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

  window.BgRemoval = { run };
})();
