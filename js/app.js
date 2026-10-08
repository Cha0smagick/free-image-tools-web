/* PixelLibre — núcleo: estado, historial, pipeline de render y exportación */
(() => {
  'use strict';

  const DEFAULTS = () => ({
    adjustments: { brightness: 100, contrast: 100, saturation: 100, blur: 0 },
    filters: { grayscale: false, sepia: false, invert: false },
    transform: { rotate: 0, flipH: false, flipV: false },
    crop: null,
    corners: 0,
    resize: null
  });

  const state = {
    baseBitmap: null,
    originalBitmap: null,
    fileName: '',
    fileBase: 'imagen',
    format: 'png',
    quality: 92
  };
  Object.assign(state, DEFAULTS());

  const history = [];
  let historyIndex = -1;
  const HISTORY_CAP = 50;

  function dispatch(name) {
    document.dispatchEvent(new CustomEvent(name));
  }

  function snapshot() {
    return {
      adjustments: { ...state.adjustments },
      filters: { ...state.filters },
      transform: { ...state.transform },
      crop: state.crop ? { ...state.crop } : null,
      corners: state.corners,
      resize: state.resize ? { ...state.resize } : null,
      baseBitmap: state.baseBitmap
    };
  }

  function pushState() {
    history.splice(historyIndex + 1);
    history.push(snapshot());
    if (history.length > HISTORY_CAP) history.shift();
    historyIndex = history.length - 1;
    dispatch('pixellibre:state');
  }

  function applySnapshot(s) {
    state.adjustments = { ...s.adjustments };
    state.filters = { ...s.filters };
    state.transform = { ...s.transform };
    state.crop = s.crop ? { ...s.crop } : null;
    state.corners = s.corners;
    state.resize = s.resize ? { ...s.resize } : null;
    state.baseBitmap = s.baseBitmap;
    dispatch('pixellibre:state');
  }

  function canUndo() { return historyIndex > 0; }

  function canRedo() { return historyIndex < history.length - 1; }

  function undo() {
    if (!canUndo()) return;
    historyIndex--;
    applySnapshot(history[historyIndex]);
  }

  function redo() {
    if (!canRedo()) return;
    historyIndex++;
    applySnapshot(history[historyIndex]);
  }

  /* ---------- geometría ---------- */

  function rotatedSize() {
    const b = state.baseBitmap;
    const swap = (state.transform.rotate % 180) !== 0;
    return { w: swap ? b.height : b.width, h: swap ? b.width : b.height };
  }

  function cropRectPx() {
    const r = rotatedSize();
    if (!state.crop) return { x: 0, y: 0, w: r.w, h: r.h };
    return {
      x: state.crop.x * r.w,
      y: state.crop.y * r.h,
      w: state.crop.w * r.w,
      h: state.crop.h * r.h
    };
  }

  function outputSize() {
    if (state.resize) return { w: state.resize.w, h: state.resize.h };
    const c = cropRectPx();
    return { w: Math.max(1, Math.round(c.w)), h: Math.max(1, Math.round(c.h)) };
  }

  function currentAspect() {
    const c = cropRectPx();
    return c.w / c.h;
  }

  function filterString(scale) {
    const a = state.adjustments;
    const f = state.filters;
    const parts = [];
    if (f.grayscale) parts.push('grayscale(100%)');
    if (f.sepia) parts.push('sepia(100%)');
    if (f.invert) parts.push('invert(100%)');
    if (a.brightness !== 100) parts.push('brightness(' + a.brightness + '%)');
    if (a.contrast !== 100) parts.push('contrast(' + a.contrast + '%)');
    if (a.saturation !== 100) parts.push('saturate(' + a.saturation + '%)');
    if (a.blur > 0) parts.push('blur(' + Math.max(0.01, a.blur * scale).toFixed(2) + 'px)');
    return parts.length ? parts.join(' ') : 'none';
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function renderTo(canvas, scale, opts) {
    const o = opts || {};
    const b = state.baseBitmap;
    if (!b) return;
    const r = rotatedSize();
    const useCrop = Boolean(state.crop) && !o.ignoreCrop;
    const c = useCrop ? cropRectPx() : { x: 0, y: 0, w: r.w, h: r.h };
    const target = o.ignoreCrop
      ? { w: r.w, h: r.h }
      : (state.resize || { w: Math.max(1, Math.round(c.w)), h: Math.max(1, Math.round(c.h)) });
    const outW = Math.max(1, Math.round(target.w * scale));
    const outH = Math.max(1, Math.round(target.h * scale));
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.save();
    if (o.forExport && state.format === 'jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outW, outH);
    }
    if (state.corners > 0) {
      roundRectPath(ctx, 0, 0, outW, outH, state.corners * scale);
      ctx.clip();
    }
    ctx.filter = filterString(scale);
    ctx.translate(outW / 2, outH / 2);
    ctx.scale(scale, scale);
    ctx.translate(r.w / 2 - (c.x + c.w / 2), r.h / 2 - (c.y + c.h / 2));
    ctx.rotate(((state.transform.rotate % 360) * Math.PI) / 180);
    ctx.scale(state.transform.flipH ? -1 : 1, state.transform.flipV ? -1 : 1);
    ctx.drawImage(b, -b.width / 2, -b.height / 2);
    ctx.restore();
    ctx.filter = 'none';
  }

  /* ---------- exportación ---------- */

  function exportBlob() {
    return new Promise((resolve, reject) => {
      const tmp = document.createElement('canvas');
      try {
        renderTo(tmp, 1, { forExport: true });
      } catch (err) {
        reject(err);
        return;
      }
      let type = 'image/png';
      let q;
      if (state.format === 'jpeg') {
        type = 'image/jpeg';
      } else if (state.format === 'webp') {
        type = 'image/webp';
        q = state.quality / 100;
      }
      tmp.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('No se pudo generar la imagen'));
      }, type, q);
    });
  }

  function download(blob) {
    const ext = state.format === 'jpeg' ? 'jpg' : state.format;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = state.fileBase + '-editado.' + ext;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /* ---------- carga ---------- */

  function resetAll(bitmap, file) {
    state.baseBitmap = bitmap;
    state.originalBitmap = bitmap;
    state.fileName = file.name;
    state.fileBase = file.name.replace(/\.[^.]+$/, '') || 'imagen';
    Object.assign(state, DEFAULTS());
    history.length = 0;
    historyIndex = -1;
    pushState();
    dispatch('pixellibre:loaded');
  }

  async function loadFile(file) {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      toast('El archivo no es una imagen válida');
      return;
    }
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      resetAll(bitmap, file);
    } catch (err1) {
      try {
        const bitmap = await createImageBitmap(file);
        resetAll(bitmap, file);
      } catch (err2) {
        toast('No se pudo abrir la imagen');
      }
    }
  }

  function resetEdits() {
    if (!state.originalBitmap) return;
    state.baseBitmap = state.originalBitmap;
    Object.assign(state, DEFAULTS());
    pushState();
  }

  /* ---------- operaciones ---------- */

  const round3 = (v) => Math.round(v * 1000) / 1000;

  function remapCrop(crop, deg) {
    if (!crop) return null;
    const { x, y, w, h } = crop;
    if (deg === 90) return { x: round3(1 - y - h), y: round3(x), w: round3(h), h: round3(w) };
    if (deg === -90) return { x: round3(y), y: round3(1 - x - w), w: round3(h), h: round3(w) };
    if (deg === 180) return { x: round3(1 - x - w), y: round3(1 - y - h), w: round3(w), h: round3(h) };
    return { x: round3(x), y: round3(y), w: round3(w), h: round3(h) };
  }

  function rotate(deg) {
    state.transform.rotate = ((state.transform.rotate + deg) % 360 + 360) % 360;
    state.crop = remapCrop(state.crop, deg);
    pushState();
  }

  function setFlip(axis) {
    if (axis === 'h') state.transform.flipH = !state.transform.flipH;
    else if (axis === 'v') state.transform.flipV = !state.transform.flipV;
    pushState();
  }

  function setCrop(rect) {
    if (!rect || rect.w <= 0 || rect.h <= 0) return;
    state.crop = { x: round3(rect.x), y: round3(rect.y), w: round3(rect.w), h: round3(rect.h) };
    pushState();
  }

  function clearCrop() {
    state.crop = null;
    pushState();
  }

  function dispatchLive() {
    dispatch('pixellibre:live');
  }

  function setResize(w, h, commit) {
    state.resize = (w > 0 && h > 0) ? { w: Math.round(w), h: Math.round(h) } : null;
    if (commit === false) dispatchLive();
    else pushState();
  }

  function clearResize() {
    state.resize = null;
    pushState();
  }

  function setAdjustment(key, value, commit) {
    if (!(key in state.adjustments)) return;
    state.adjustments[key] = value;
    if (commit === false) dispatchLive();
    else pushState();
  }

  function resetAdjustments() {
    state.adjustments = { brightness: 100, contrast: 100, saturation: 100, blur: 0 };
    pushState();
  }

  function toggleFilter(key) {
    if (!(key in state.filters)) return;
    state.filters[key] = !state.filters[key];
    pushState();
  }

  function setCorners(v, commit) {
    state.corners = Math.max(0, v);
    if (commit === false) dispatchLive();
    else pushState();
  }

  function setFormat(f) {
    state.format = f;
    dispatch('pixellibre:state');
  }

  function setQuality(q) {
    state.quality = q;
    dispatchLive();
  }

  function applyBgRemoved(bitmap) {
    state.baseBitmap = bitmap;
    pushState();
  }

  function restoreOriginal() {
    if (!state.originalBitmap) return;
    state.baseBitmap = state.originalBitmap;
    pushState();
  }

  /* ---------- toast ---------- */

  let toastTimer = null;

  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
  }

  /* ---------- atajos ---------- */

  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.matches && e.target.matches('input, textarea, select')) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      redo();
    }
  });

  window.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          loadFile(file);
        }
        return;
      }
    }
  });

  window.App = {
    state,
    loadFile, pushState, undo, redo, canUndo, canRedo,
    renderTo, outputSize, rotatedSize, currentAspect,
    exportBlob, download,
    rotate, setFlip, setCrop, clearCrop, setResize, clearResize,
    setAdjustment, resetAdjustments, toggleFilter, setCorners,
    setFormat, setQuality, applyBgRemoved, restoreOriginal, resetEdits, toast
  };
})();
