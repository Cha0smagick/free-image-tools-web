/* PixelLibre — núcleo: estado, historial, pipeline de render y exportación */
(() => {
  'use strict';

  const DEFAULTS = () => ({
    adjustments: { brightness: 100, contrast: 100, saturation: 100, blur: 0, vignette: 0, pixelate: 0 },
    filters: { grayscale: false, sepia: false, invert: false, hue: 0 },
    transform: { rotate: 0, flipH: false, flipV: false },
    crop: null,
    corners: 0,
    resize: null,
    frame: { width: 0, color: '#0B1026' },
    texts: []
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
      frame: { ...state.frame },
      texts: state.texts.map((t) => ({ ...t })),
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
    state.frame = { ...s.frame };
    state.texts = s.texts.map((t) => ({ ...t }));
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
    if (f.hue !== 0) parts.push('hue-rotate(' + f.hue + 'deg)');
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
    if (state.adjustments.pixelate > 0) {
      // pixelar: dibujar el contenido a baja resolución y reescalar sin suavizado
      const factor = Math.max(2, state.adjustments.pixelate);
      const pw = Math.max(1, Math.round(outW / factor));
      const ph = Math.max(1, Math.round(outH / factor));
      const tmp = document.createElement('canvas');
      tmp.width = pw;
      tmp.height = ph;
      const tctx = tmp.getContext('2d');
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = 'high';
      tctx.save();
      tctx.filter = filterString(scale / factor);
      tctx.translate(pw / 2, ph / 2);
      tctx.scale(scale / factor, scale / factor);
      tctx.translate(r.w / 2 - (c.x + c.w / 2), r.h / 2 - (c.y + c.h / 2));
      tctx.rotate(((state.transform.rotate % 360) * Math.PI) / 180);
      tctx.scale(state.transform.flipH ? -1 : 1, state.transform.flipV ? -1 : 1);
      tctx.drawImage(b, -b.width / 2, -b.height / 2);
      tctx.restore();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, outW, outH);
      ctx.imageSmoothingEnabled = true;
    } else {
      ctx.filter = filterString(scale);
      ctx.translate(outW / 2, outH / 2);
      ctx.scale(scale, scale);
      ctx.translate(r.w / 2 - (c.x + c.w / 2), r.h / 2 - (c.y + c.h / 2));
      ctx.rotate(((state.transform.rotate % 360) * Math.PI) / 180);
      ctx.scale(state.transform.flipH ? -1 : 1, state.transform.flipV ? -1 : 1);
      ctx.drawImage(b, -b.width / 2, -b.height / 2);
    }
    ctx.restore();
    ctx.filter = 'none';
    /* capa de overlays respetando esquinas */
    ctx.save();
    if (state.corners > 0) {
      roundRectPath(ctx, 0, 0, outW, outH, state.corners * scale);
      ctx.clip();
    }
    /* viñeta */
    if (state.adjustments.vignette > 0) {
      const strength = (state.adjustments.vignette / 100) * 0.85;
      const grad = ctx.createRadialGradient(
        outW / 2, outH / 2, Math.min(outW, outH) * 0.35,
        outW / 2, outH / 2, Math.max(outW, outH) * 0.72
      );
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,' + strength.toFixed(3) + ')');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, outW, outH);
    }
    /* marco */
    if (state.frame.width > 0) {
      const fw = Math.max(1, Math.round(state.frame.width * scale));
      ctx.fillStyle = state.frame.color;
      ctx.fillRect(0, 0, outW, fw);
      ctx.fillRect(0, outH - fw, outW, fw);
      ctx.fillRect(0, 0, fw, outH);
      ctx.fillRect(outW - fw, 0, fw, outH);
    }
    /* textos (en espacio de salida; se omiten en modo recorte) */
    if (!o.ignoreCrop && state.texts.length) {
      ctx.filter = 'none';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (const t of state.texts) {
        const fs = Math.max(1, t.size * scale);
        ctx.font = (t.bold ? 'bold ' : '') + (t.italic ? 'italic ' : '') + fs + 'px "' + t.font + '", sans-serif';
        const tx = t.x * outW;
        const ty = t.y * outH;
        if (t.strokeWidth > 0) {
          ctx.strokeStyle = t.stroke;
          ctx.lineWidth = Math.max(1, t.strokeWidth * scale);
          ctx.strokeText(t.text, tx, ty);
        }
        ctx.fillStyle = t.fill;
        ctx.fillText(t.text, tx, ty);
      }
    }
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

  const MAX_DIM = 6000; // cap de estabilidad: lienzos enormes ralentizan o rompen el navegador

  async function loadFile(file) {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      toast('El archivo no es una imagen válida');
      return;
    }
    try {
      let bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      if (Math.max(bitmap.width, bitmap.height) > MAX_DIM) {
        bitmap = await downscaleBitmap(bitmap, MAX_DIM);
        toast('Imagen muy grande: reducida a ' + MAX_DIM + ' px para una edición estable');
      }
      resetAll(bitmap, file);
    } catch (err1) {
      try {
        let bitmap = await createImageBitmap(file);
        if (Math.max(bitmap.width, bitmap.height) > MAX_DIM) {
          bitmap = await downscaleBitmap(bitmap, MAX_DIM);
          toast('Imagen muy grande: reducida a ' + MAX_DIM + ' px para una edición estable');
        }
        resetAll(bitmap, file);
      } catch (err2) {
        toast('No se pudo abrir la imagen');
      }
    }
  }

  function downscaleBitmap(bitmap, maxDim) {
    const factor = maxDim / Math.max(bitmap.width, bitmap.height);
    const w = Math.max(1, Math.round(bitmap.width * factor));
    const h = Math.max(1, Math.round(bitmap.height * factor));
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const cx = cv.getContext('2d');
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(bitmap, 0, 0, w, h);
    return createImageBitmap(cv);
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
    state.adjustments = { brightness: 100, contrast: 100, saturation: 100, blur: 0, vignette: 0, pixelate: 0 };
    pushState();
  }

  function setHue(deg, commit) {
    state.filters.hue = Math.max(-180, Math.min(180, Math.round(deg)));
    if (commit === false) dispatchLive();
    else pushState();
  }

  function setFrame(width, color, commit) {
    state.frame = {
      width: Math.max(0, Math.round(width || 0)),
      color: color || '#0B1026'
    };
    if (commit === false) dispatchLive();
    else pushState();
  }

  /* ---------- capas de texto ---------- */

  function addText(item) {
    const t = {
      id: 't' + Date.now() + Math.floor(Math.random() * 1000),
      text: (item && item.text) || 'Texto',
      x: (item && typeof item.x === 'number') ? item.x : 0.5,
      y: (item && typeof item.y === 'number') ? item.y : 0.5,
      size: (item && item.size) || 64,
      font: (item && item.font) || 'Arial',
      fill: (item && item.fill) || '#FFFFFF',
      stroke: (item && item.stroke) || '#000000',
      strokeWidth: (item && item.strokeWidth !== undefined) ? item.strokeWidth : 4,
      bold: Boolean(item && item.bold),
      italic: Boolean(item && item.italic)
    };
    state.texts.push(t);
    pushState();
    return t.id;
  }

  function updateText(id, patch, commit) {
    const t = state.texts.find((x) => x.id === id);
    if (!t) return;
    Object.assign(t, patch);
    if (commit === false) dispatchLive();
    else pushState();
  }

  function removeText(id) {
    const before = state.texts.length;
    state.texts = state.texts.filter((x) => x.id !== id);
    if (state.texts.length !== before) pushState();
  }

  // Hit-test: devuelve el id del texto bajo el punto (px,py) del lienzo
  // con el scale dado, o null. Itera en orden inverso (el último dibujado arriba).
  function textAt(px, py, scale) {
    const b = state.baseBitmap;
    if (!b || !state.texts.length) return null;
    const r = rotatedSize();
    const useCrop = Boolean(state.crop);
    const c = useCrop ? cropRectPx() : { x: 0, y: 0, w: r.w, h: r.h };
    const target = state.resize || { w: Math.max(1, Math.round(c.w)), h: Math.max(1, Math.round(c.h)) };
    const outW = Math.max(1, Math.round(target.w * scale));
    const outH = Math.max(1, Math.round(target.h * scale));
    const scratch = document.createElement('canvas').getContext('2d');
    for (let i = state.texts.length - 1; i >= 0; i--) {
      const t = state.texts[i];
      const fs = Math.max(1, t.size * scale);
      scratch.font = (t.bold ? 'bold ' : '') + (t.italic ? 'italic ' : '') + fs + 'px "' + t.font + '", sans-serif';
      const w = scratch.measureText(t.text).width + fs * 0.6;
      const h = fs * 1.3;
      const tx = t.x * outW;
      const ty = t.y * outH;
      if (px >= tx - w / 2 && px <= tx + w / 2 && py >= ty - h / 2 && py <= ty + h / 2) {
        return t.id;
      }
    }
    return null;
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
    renderTo, outputSize, rotatedSize, currentAspect, textAt,
    exportBlob, download,
    rotate, setFlip, setCrop, clearCrop, setResize, clearResize,
    setAdjustment, resetAdjustments, toggleFilter, setCorners,
    setHue, setFrame,
    addText, updateText, removeText,
    setFormat, setQuality, applyBgRemoved, restoreOriginal, resetEdits, toast
  };
})();
