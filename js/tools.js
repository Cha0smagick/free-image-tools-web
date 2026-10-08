/* PixelLibre — bindings de UI: paneles, recorte, texto, tema, preview, exportación */
(() => {
  'use strict';

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* sin SW la app funciona igual; solo pierde el modo offline */
    });
  }

  const $ = (id) => document.getElementById(id);

  const preview = $('preview');
  const canvasWrap = $('canvas-wrap');
  const canvasHolder = $('canvas-holder');
  const overlay = $('crop-overlay');

  let activeTool = 'resize';
  let previewScheduled = false;
  let pushTimer = null;
  let estimateTimer = null;
  let pendingCrop = null;
  let dragRect = null;
  let dragOrigin = null;

  /* ---------- preview ---------- */

  function schedulePreview() {
    if (previewScheduled) return;
    previewScheduled = true;
    requestAnimationFrame(() => {
      previewScheduled = false;
      renderPreview();
    });
  }

  function fitScale(outW, outH) {
    const maxW = canvasWrap.clientWidth - 24;
    const maxH = canvasWrap.clientHeight - 24;
    if (maxW <= 0 || maxH <= 0) return 1;
    return Math.min(1, maxW / outW, maxH / outH);
  }

  function renderPreview() {
    if (!App.state.baseBitmap) return;
    const dims = activeTool === 'crop' ? App.rotatedSize() : App.outputSize();
    const previewScale = fitScale(dims.w, dims.h);
    App.renderTo(preview, previewScale, { ignoreCrop: activeTool === 'crop' });
    updateCropOverlay();
    updateInfo();
  }

  function updateInfo() {
    const s = App.state;
    if (!s.baseBitmap) return;
    const out = App.outputSize();
    $('img-info').textContent = s.fileName + ' · ' + s.baseBitmap.width + '×' + s.baseBitmap.height + ' → salida ' + out.w + '×' + out.h;
  }

  /* ---------- recorte ---------- */

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  function holderPoint(e) {
    const rect = canvasHolder.getBoundingClientRect();
    return {
      fx: clamp01((e.clientX - rect.left) / rect.width),
      fy: clamp01((e.clientY - rect.top) / rect.height)
    };
  }

  function drawCropBox(rect) {
    const box = rect || pendingCrop || App.state.crop;
    if (!box || activeTool !== 'crop') {
      overlay.classList.add('hidden');
      return;
    }
    overlay.classList.remove('hidden');
    overlay.style.left = (box.x * 100) + '%';
    overlay.style.top = (box.y * 100) + '%';
    overlay.style.width = (box.w * 100) + '%';
    overlay.style.height = (box.h * 100) + '%';
  }

  function cropDimsText(rect) {
    const box = rect || pendingCrop || App.state.crop;
    if (!box) return 'Sin recorte — arrastra sobre la imagen';
    const r = App.rotatedSize();
    return Math.max(1, Math.round(box.w * r.w)) + ' × ' + Math.max(1, Math.round(box.h * r.h)) + ' px';
  }

  function updateCropOverlay() {
    drawCropBox();
    if (activeTool === 'crop') $('crop-dims').textContent = cropDimsText();
  }

  function startDrag(e) {
    if (activeTool !== 'crop') return;
    e.preventDefault();
    dragOrigin = holderPoint(e);
    dragRect = { x: dragOrigin.fx, y: dragOrigin.fy, w: 0, h: 0 };
    try {
      canvasHolder.setPointerCapture(e.pointerId);
    } catch (err) {
      /* la captura de pointer es opcional; el arrastre sigue funcionando */
    }
    drawCropBox(dragRect);
    $('crop-dims').textContent = cropDimsText(dragRect);
  }

  function moveDrag(e) {
    if (!dragOrigin) return;
    e.preventDefault();
    const p = holderPoint(e);
    dragRect = {
      x: Math.min(dragOrigin.fx, p.fx),
      y: Math.min(dragOrigin.fy, p.fy),
      w: Math.abs(p.fx - dragOrigin.fx),
      h: Math.abs(p.fy - dragOrigin.fy)
    };
    drawCropBox(dragRect);
    $('crop-dims').textContent = cropDimsText(dragRect);
  }

  function endDrag() {
    if (!dragOrigin) return;
    if (dragRect && dragRect.w > 0.02 && dragRect.h > 0.02) {
      pendingCrop = dragRect;
      $('btn-apply-crop').disabled = false;
    } else {
      dragRect = null;
      drawCropBox();
      $('crop-dims').textContent = cropDimsText();
    }
    dragOrigin = null;
  }

  canvasHolder.addEventListener('pointerdown', startDrag);
  canvasHolder.addEventListener('pointermove', moveDrag);
  canvasHolder.addEventListener('pointerup', endDrag);
  canvasHolder.addEventListener('pointercancel', endDrag);

  $('btn-apply-crop').addEventListener('click', () => {
    if (!pendingCrop) return;
    App.setCrop(pendingCrop);
    pendingCrop = null;
    dragRect = null;
    $('btn-apply-crop').disabled = true;
  });

  $('crop-clear').addEventListener('click', () => {
    App.clearCrop();
    pendingCrop = null;
    dragRect = null;
    $('btn-apply-crop').disabled = true;
  });

  /* ---------- cambio de herramienta ---------- */

  const toolBtns = Array.from(document.querySelectorAll('.tool-btn'));
  const panels = Array.from(document.querySelectorAll('.panel'));

  function setTool(name) {
    pendingCrop = null;
    dragRect = null;
    selectedTextId = null;
    textDragOrigin = null;
    $('btn-apply-crop').disabled = true;
    activeTool = name;
    toolBtns.forEach((b) => b.classList.toggle('active', b.dataset.tool === name));
    panels.forEach((p) => p.classList.toggle('active', p.dataset.panel === name));
    renderPreview();
  }

  toolBtns.forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));

  /* ---------- ajustes ---------- */

  const adjDefs = [
    { id: 'adj-brightness', key: 'brightness', unit: '%' },
    { id: 'adj-contrast', key: 'contrast', unit: '%' },
    { id: 'adj-saturation', key: 'saturation', unit: '%' },
    { id: 'adj-blur', key: 'blur', unit: ' px' },
    { id: 'adj-vignette', key: 'vignette', unit: '%' },
    { id: 'adj-pixelate', key: 'pixelate', unit: ' px' }
  ];

  function commitSoon() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => App.pushState(), 500);
  }

  adjDefs.forEach(({ id, key, unit }) => {
    $(id).addEventListener('input', (e) => {
      const v = Number(e.target.value);
      $(id + '-val').textContent = v + unit;
      App.setAdjustment(key, v, false);
      commitSoon();
    });
  });

  function syncAdjustSliders() {
    adjDefs.forEach(({ id, key, unit }) => {
      const v = App.state.adjustments[key];
      $(id).value = v;
      $(id + '-val').textContent = v + unit;
    });
  }

  $('adj-reset').addEventListener('click', () => App.resetAdjustments());

  /* ---------- esquinas ---------- */

  $('corners-slider').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    $('corners-val').textContent = v + ' px';
    App.setCorners(v, false);
    commitSoon();
  });

  $('corners-reset').addEventListener('click', () => App.setCorners(0));

  function syncCorners() {
    const v = App.state.corners;
    $('corners-slider').value = v;
    $('corners-val').textContent = v + ' px';
  }

  /* ---------- tono (hue-rotate) ---------- */

  $('hue-slider').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    $('hue-val').textContent = v + '°';
    App.setHue(v, false);
    commitSoon();
  });

  $('hue-reset').addEventListener('click', () => {
    $('hue-slider').value = 0;
    $('hue-val').textContent = '0°';
    App.setHue(0);
  });

  function syncHue() {
    const v = App.state.filters.hue;
    $('hue-slider').value = v;
    $('hue-val').textContent = v + '°';
  }

  /* ---------- marco ---------- */

  function currentFrameColor() { return $('frame-color').value || '#0B1026'; }

  $('frame-width').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    $('frame-width-val').textContent = v + ' px';
    App.setFrame(v, currentFrameColor(), false);
    commitSoon();
  });

  $('frame-color').addEventListener('input', () => {
    App.setFrame(Number($('frame-width').value), currentFrameColor(), false);
    commitSoon();
  });

  $('frame-reset').addEventListener('click', () => {
    $('frame-width').value = 0;
    $('frame-width-val').textContent = '0 px';
    App.setFrame(0, currentFrameColor());
  });

  function syncFrame() {
    const f = App.state.frame;
    if (document.activeElement !== $('frame-width') && document.activeElement !== $('frame-color')) {
      $('frame-width').value = f.width;
      $('frame-width-val').textContent = f.width + ' px';
      $('frame-color').value = f.color;
    }
  }

  /* ---------- capas de texto ---------- */

  let selectedTextId = null;
  let textDragOrigin = null;

  function selectedText() {
    return App.state.texts.find((t) => t.id === selectedTextId) || null;
  }

  function readTextPanel() {
    return {
      text: $('text-input').value || 'Texto',
      font: $('text-font').value,
      size: Number($('text-size').value),
      fill: $('text-fill').value,
      stroke: $('text-stroke').value,
      strokeWidth: Number($('text-stroke-width').value),
      bold: $('text-bold').checked,
      italic: $('text-italic').checked
    };
  }

  function writeTextPanel(t) {
    $('text-input').value = t ? t.text : '';
    $('text-font').value = t ? t.font : 'Arial';
    $('text-size').value = t ? t.size : 64;
    $('text-size-val').textContent = (t ? t.size : 64) + ' px';
    $('text-fill').value = t ? t.fill : '#FFFFFF';
    $('text-stroke').value = t ? t.stroke : '#000000';
    $('text-stroke-width').value = t ? t.strokeWidth : 4;
    $('text-stroke-width-val').textContent = (t ? t.strokeWidth : 4) + ' px';
    $('text-bold').checked = t ? t.bold : false;
    $('text-italic').checked = t ? t.italic : false;
  }

  function syncTextUI() {
    writeTextPanel(selectedText());
    $('btn-remove-text').disabled = !selectedTextId;
  }

  $('text-input').addEventListener('input', () => {
    if (selectedTextId) {
      App.updateText(selectedTextId, { text: $('text-input').value || 'Texto' }, false);
      commitSoon();
    }
  });

  $('text-size').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    $('text-size-val').textContent = v + ' px';
    if (selectedTextId) {
      App.updateText(selectedTextId, { size: v }, false);
      commitSoon();
    }
  });

  ['text-fill', 'text-stroke'].forEach((id) => {
    $(id).addEventListener('input', () => {
      if (selectedTextId) {
        const patch = id === 'text-fill' ? { fill: $(id).value } : { stroke: $(id).value };
        App.updateText(selectedTextId, patch, false);
        commitSoon();
      }
    });
  });

  $('text-stroke-width').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    $('text-stroke-width-val').textContent = v + ' px';
    if (selectedTextId) {
      App.updateText(selectedTextId, { strokeWidth: v }, false);
      commitSoon();
    }
  });

  ['text-bold', 'text-italic'].forEach((id) => {
    $(id).addEventListener('change', () => {
      if (selectedTextId) {
        const patch = id === 'text-bold' ? { bold: $(id).checked } : { italic: $(id).checked };
        App.updateText(selectedTextId, patch, false);
        commitSoon();
      }
    });
  });

  $('text-font').addEventListener('change', () => {
    if (selectedTextId) {
      App.updateText(selectedTextId, { font: $('text-font').value }, false);
      commitSoon();
    }
  });

  $('btn-add-text').addEventListener('click', () => {
    const item = readTextPanel();
    item.x = 0.5;
    item.y = 0.5;
    selectedTextId = App.addText(item);
    syncTextUI();
  });

  $('btn-remove-text').addEventListener('click', () => {
    if (!selectedTextId) return;
    App.removeText(selectedTextId);
    selectedTextId = null;
    textDragOrigin = null;
    syncTextUI();
  });

  /* ---------- interacción de texto sobre el lienzo ---------- */

  function canvasPoint(e) {
    const rect = preview.getBoundingClientRect();
    const scaleX = preview.width / rect.width;
    const scaleY = preview.height / rect.height;
    return {
      px: (e.clientX - rect.left) * scaleX,
      py: (e.clientY - rect.top) * scaleY
    };
  }

  function textDown(e) {
    if (activeTool !== 'text') return;
    e.preventDefault();
    const p = canvasPoint(e);
    const dims = App.outputSize();
    const scale = Math.max(1, dims.w) > 0 ? preview.width / Math.max(1, dims.w) : 1;
    const hit = App.textAt(p.px, p.py, scale);
    if (hit) {
      selectedTextId = hit;
      const t = selectedText();
      textDragOrigin = { px: p.px, py: p.py, tx: t.x, ty: t.y };
      try {
        canvasHolder.setPointerCapture(e.pointerId);
      } catch (err) {
        /* captura opcional */
      }
    } else {
      selectedTextId = null;
      textDragOrigin = null;
    }
    syncTextUI();
  }

  function textMove(e) {
    if (activeTool !== 'text' || !textDragOrigin) return;
    e.preventDefault();
    const p = canvasPoint(e);
    const nx = clamp01(textDragOrigin.tx + (p.px - textDragOrigin.px) / preview.width);
    const ny = clamp01(textDragOrigin.ty + (p.py - textDragOrigin.py) / preview.height);
    App.updateText(selectedTextId, { x: nx, y: ny }, false);
    commitSoon();
  }

  function textUp() {
    textDragOrigin = null;
  }

  canvasHolder.addEventListener('pointerdown', textDown);
  canvasHolder.addEventListener('pointermove', textMove);
  canvasHolder.addEventListener('pointerup', textUp);
  canvasHolder.addEventListener('pointercancel', textUp);


  /* ---------- filtros ---------- */

  const filterKeys = ['grayscale', 'sepia', 'invert'];

  filterKeys.forEach((k) => {
    const chip = document.querySelector('[data-filter="' + k + '"]');
    if (chip) chip.addEventListener('click', () => App.toggleFilter(k));
  });

  function syncFilterChips() {
    filterKeys.forEach((k) => {
      const chip = document.querySelector('[data-filter="' + k + '"]');
      if (chip) chip.classList.toggle('active', Boolean(App.state.filters[k]));
    });
  }

  /* ---------- redimensionar ---------- */

  function onResizeInput() {
    const wInput = $('resize-w');
    const hInput = $('resize-h');
    let w = Number(wInput.value);
    let h = Number(hInput.value);
    const lock = $('resize-lock').checked;
    if (lock && document.activeElement === wInput && w > 0) {
      h = Math.round(w / App.currentAspect());
      hInput.value = h;
    } else if (lock && document.activeElement === hInput && h > 0) {
      w = Math.round(h * App.currentAspect());
      wInput.value = w;
    }
    if (w > 0 && h > 0) {
      App.setResize(w, h, false);
      commitSoon();
    }
  }

  $('resize-w').addEventListener('input', onResizeInput);
  $('resize-h').addEventListener('input', onResizeInput);

  function syncResizeInputs() {
    if (document.activeElement === $('resize-w') || document.activeElement === $('resize-h')) return;
    const out = App.outputSize();
    $('resize-w').value = out.w;
    $('resize-h').value = out.h;
    $('resize-current').textContent = 'Salida actual: ' + out.w + ' × ' + out.h + ' px';
  }

  Array.from(document.querySelectorAll('[data-preset]')).forEach((btn) => {
    btn.addEventListener('click', () => {
      const parts = btn.dataset.preset.split('x');
      const w = Number(parts[0]);
      const h = Number(parts[1]);
      App.setResize(w, h);
    });
  });

  $('resize-clear').addEventListener('click', () => App.clearResize());

  /* ---------- rotar / espejar ---------- */

  $('rot-ccw').addEventListener('click', () => App.rotate(-90));
  $('rot-cw').addEventListener('click', () => App.rotate(90));
  $('rot-180').addEventListener('click', () => App.rotate(180));
  $('flip-h').addEventListener('click', () => App.setFlip('h'));
  $('flip-v').addEventListener('click', () => App.setFlip('v'));

  /* ---------- exportar ---------- */

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
  }

  function syncExportUI() {
    $('export-format').value = App.state.format;
    $('quality-row').classList.toggle('hidden', App.state.format === 'png');
    const out = App.outputSize();
    $('export-dims').textContent = out.w + ' × ' + out.h + ' px';
    estimateSize();
  }

  function estimateSize() {
    clearTimeout(estimateTimer);
    estimateTimer = setTimeout(async () => {
      try {
        const blob = await App.exportBlob();
        $('export-size').textContent = formatBytes(blob.size) + ' aprox.';
      } catch (err) {
        $('export-size').textContent = '—';
      }
    }, 350);
  }

  $('export-format').addEventListener('change', (e) => {
    App.setFormat(e.target.value);
  });

  $('export-quality').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    $('export-quality-val').textContent = v + '%';
    App.setQuality(v);
    estimateSize();
  });

  $('btn-download').addEventListener('click', async () => {
    try {
      App.pushState();
      const blob = await App.exportBlob();
      App.download(blob);
      App.toast('¡Descarga lista!');
    } catch (err) {
      App.toast('No se pudo exportar la imagen');
    }
  });

  /* ---------- barra superior ---------- */

  $('btn-undo').addEventListener('click', () => App.undo());
  $('btn-redo').addEventListener('click', () => App.redo());
  $('btn-reset').addEventListener('click', () => App.resetEdits());

  $('btn-new').addEventListener('click', () => {
    $('editor').classList.add('hidden');
    $('dropzone-section').classList.remove('hidden');
  });

  /* ---------- tema claro / oscuro ---------- */

  const THEME_KEY = 'pixellibre-theme';

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const btn = $('theme-toggle');
    if (btn) btn.textContent = theme === 'light' ? 'Modo oscuro' : 'Modo claro';
  }

  $('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (err) {
      /* localStorage puede estar bloqueado; el tema cambia igual en la sesión */
    }
    applyTheme(next);
  });

  applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

  /* ---------- dropzone ---------- */

  const fileInput = $('file-input');
  const dropzone = $('dropzone');

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) App.loadFile(file);
    fileInput.value = '';
  });

  ['dragover', 'dragenter'].forEach((ev) => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragging');
    });
    canvasWrap.addEventListener(ev, (e) => e.preventDefault());
  });

  ['dragleave', 'drop'].forEach((ev) => {
    dropzone.addEventListener(ev, () => dropzone.classList.remove('dragging'));
  });

  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) App.loadFile(file);
  });

  canvasWrap.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) App.loadFile(file);
  });

  /* ---------- quitar fondo (IA) ---------- */

  function baseToBlob() {
    return new Promise((resolve, reject) => {
      const b = App.state.baseBitmap;
      if (!b) {
        reject(new Error('No hay imagen cargada'));
        return;
      }
      const tmp = document.createElement('canvas');
      tmp.width = b.width;
      tmp.height = b.height;
      const ctx = tmp.getContext('2d');
      ctx.drawImage(b, 0, 0);
      tmp.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('No se pudo preparar la imagen'));
      }, 'image/png');
    });
  }

  function syncBgStatus() {
    const s = App.state;
    const removed = Boolean(s.baseBitmap && s.originalBitmap && s.baseBitmap !== s.originalBitmap);
    $('bg-status').textContent = removed ? '✓ Imagen sin fondo lista' : 'Imagen original (con fondo)';
    const btn = $('btn-remove-bg');
    btn.textContent = removed ? 'Restaurar original' : 'Quitar fondo con IA';
    btn.dataset.mode = removed ? 'restore' : 'remove';
  }

  function showBgProgress(label) {
    $('bg-progress-label').textContent = label;
    $('bg-progress-bar').style.width = '2%';
    $('bg-progress').classList.remove('hidden');
  }

  function hideBgProgress() {
    $('bg-progress').classList.add('hidden');
  }

  function setBgProgress(label, pct) {
    if (label) $('bg-progress-label').textContent = label;
    $('bg-progress-bar').style.width = Math.max(2, Math.min(100, pct)) + '%';
  }

  $('btn-remove-bg').addEventListener('click', async () => {
    if ($('btn-remove-bg').dataset.mode === 'restore') {
      App.restoreOriginal();
      return;
    }
    showBgProgress('Cargando motor de IA…');
    try {
      const blob = await baseToBlob();
      const result = await BgRemoval.run(blob, setBgProgress);
      const bitmap = await createImageBitmap(result);
      App.applyBgRemoved(bitmap);
      App.toast('¡Fondo eliminado! Exporta en PNG o WebP para conservar la transparencia');
    } catch (err) {
      App.toast((err && err.message) || 'No se pudo quitar el fondo');
    } finally {
      hideBgProgress();
    }
  });

  /* ---------- sincronización global ---------- */

  function syncHistoryButtons() {
    $('btn-undo').disabled = !App.canUndo();
    $('btn-redo').disabled = !App.canRedo();
  }

  function syncAll() {
    syncResizeInputs();
    syncFilterChips();
    syncAdjustSliders();
    syncCorners();
    syncHue();
    syncFrame();
    syncTextUI();
    syncExportUI();
    syncBgStatus();
    syncHistoryButtons();
  }

  document.addEventListener('pixellibre:loaded', () => {
    $('dropzone-section').classList.add('hidden');
    $('editor').classList.remove('hidden');
    activeTool = 'resize';
    toolBtns.forEach((b) => b.classList.toggle('active', b.dataset.tool === 'resize'));
    panels.forEach((p) => p.classList.toggle('active', p.dataset.panel === 'resize'));
    syncAll();
    renderPreview();
  });

  document.addEventListener('pixellibre:state', () => {
    syncAll();
    schedulePreview();
  });

  document.addEventListener('pixellibre:live', () => {
    schedulePreview();
  });
})();
