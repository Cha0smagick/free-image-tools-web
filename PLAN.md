# PixelLibre — Plan atómico de implementación

> Documento maestro. Todo el proyecto se implementa siguiendo este plan paso a paso, sin desviarse.

---

## 1. Destino y criterios de aceptación

**Destino:** una web pública en GitHub Pages (desplegada con GitHub Actions) llamada **PixelLibre** — editor de imágenes 100% gratuito en el navegador, con quitar fondo por IA, blanco y negro, redimensionar, recortar, rotar/espejar, ajustes, esquinas redondeadas y exportación con estimación de tamaño.

**Criterios de aceptación:**

- El usuario sube una imagen (clic, arrastrar o Ctrl+V) y edita sin límites, gratis, sin registro y sin marcas de agua.
- 8 herramientas funcionales: Redimensionar, Recortar, Rotar/Espejar, Filtros, Ajustes, Quitar fondo (IA), Esquinas, Exportar.
- Todo el procesado ocurre en el navegador del usuario (client-side). Ninguna imagen sale del dispositivo (salvo la descarga única del modelo de IA la primera vez).
- Historial deshacer/rehacer (Ctrl+Z / Ctrl+Y), edición no destructiva.
- Despliegue automático a GitHub Pages vía GitHub Actions en cada push a `main`.
- `node --check` sin errores en los 3 JS; smoke test HTTP 200 en todas las rutas.

## 2. Principios (por qué supera a la competencia)

| Competencia (remove.bg, Canva, Photopea free) | PixelLibre |
|---|---|
| Server-side: suben tu imagen a sus servidores | 100% client-side: nada sale del dispositivo |
| Límite de resolución / créditos / registro | Sin límites, sin registro, sin créditos |
| Marca de agua en planes gratis | Sin marcas de agua |
| Publicidad y upsells agresivos | Cero anuncios |
| Pago por quitar fondo | Quitar fondo con IA gratis (procesado local) |

Principios técnicos:

1. **Client-side puro**: Canvas 2D API + `createImageBitmap`. Sin backend, sin subidas.
2. **Instant tools**: los filtros/ajustes/transformaciones se aplican en vivo (<16 ms) con GPU del navegador.
3. **Lazy AI cached**: el motor de IA (`@imgly/background-removal`) se carga bajo demanda la primera vez (~40 MB) y queda cacheado; el procesado posterior es local y sin red.
4. **No destructivo**: historial de 50 pasos; el bitmap original nunca se muta.
5. **Live size estimate**: la exportación calcula el tamaño real del archivo mientras ajustas calidad/formato.
6. **PWA-ready**: manifest + icono SVG, instalable.
7. **Open source**: MIT, sin telemetría.

## 3. Stack y arquitectura

- **Vanilla HTML/CSS/JS**. Sin framework, sin build step, sin bundler.
- Scripts clásicos con `defer` (no ES modules) — salvo *dynamic import* para el motor de IA.
- **Quitar fondo**: `@imgly/background-removal@1.7.0` vía `https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm` con `import()` dinámico (funciona desde script clásico, CORS correcto).
- **Despliegue**: GitHub Actions → `actions/upload-pages-artifact` + `actions/deploy-pages`.

Arquitectura de 3 módulos JS:

```
js/app.js        → núcleo: estado, historial, pipeline de render, exportación (window.App)
js/tools.js      → UI: paneles, overlay de recorte, preview, bindings de eventos
js/background.js → carga perezosa del motor de IA (window.BgRemoval)
```

## 4. Estructura de archivos

```
PLAN.md                      ← este documento (atómico)
index.html                   ← markup completo, lang="es"
css/styles.css               ← tema oscuro, grid responsive
js/app.js                    ← núcleo (estado + render + export)
js/tools.js                  ← bindings UI
js/background.js             ← loader IA perezoso
manifest.webmanifest         ← PWA
icons/icon.svg               ← favicon + icono manifest
.github/workflows/deploy.yml ← despliegue GitHub Pages
README.md                    ← guía de publicación (español)
```

## 5. Modelo no destructivo (estado + historial)

```js
DEFAULTS() = {
  adjustments: { brightness:100, contrast:100, saturation:100, blur:0 },
  filters:     { grayscale:false, sepia:false, invert:false },
  transform:   { rotate:0, flipH:false, flipV:false },
  crop: null,   // fracciones {x,y,w,h} respecto al tamaño rotado
  corners: 0,   // px de radio a escala 1
  resize: null  // {w,h} px de salida
}
state = { baseBitmap, originalBitmap, fileName, fileBase, format:'png', quality:92 } + DEFAULTS
```

- `baseBitmap`: bitmap actual (original o sin fondo). `originalBitmap`: nunca cambia → "Reiniciar".
- **Historial**: array de snapshots (deep-copy de los campos pequeños; `baseBitmap` **por referencia**), `historyIndex`, tope 50. `pushState()` trunca el redo, empuja y dispara `CustomEvent('pixellibre:state')`. `history[0]` = estado prístino tras cargar.
- Operaciones *live* (sliders) con `commit:false` disparan `pixellibre:live` y hacen push de historial con debounce de 500 ms (`commitSoon()`).

## 6. Pipeline de render (matriz Canvas 2D)

`renderTo(canvas, scale, opts)` — el corazón del editor:

1. `b = state.baseBitmap`; si no hay, salir. `r = rotatedSize()` (swap si `rotate % 180 !== 0`).
2. `useCrop = Boolean(state.crop) && !opts.ignoreCrop`; `c = useCrop ? cropRectPx() : full`.
3. `target = opts.ignoreCrop ? r : (state.resize || {w,h} redondeado de c)`; `outW/outH = target × scale` (mín 1).
4. Fondo blanco si export JPEG. Si `corners>0`: `roundRectPath` + `clip` (radio escalado).
5. `ctx.filter = filterString(scale)` (blur escalado).
6. Transformación: `translate(outW/2, outH/2)` → `scale(scale)` → `translate(r.w/2 - (c.x+c.w/2), r.h/2 - (c.y+c.h/2))` → `rotate(rotate°)` → `scale(flipH?-1:1, flipV?-1:1)` → `drawImage(b, -b.width/2, -b.height/2)`.

- Opciones: `{ignoreCrop:true}` para el modo recorte (ver la imagen completa), `{forExport:true}` para exportar. Preview usa `previewScale` (fit al contenedor); export usa `scale=1`.
- `remapCrop(crop, deg)` reasigna el recorte al rotar (90/−90/180) con redondeo a 3 decimales.

## 7. Especificación de las 8 herramientas

1. **Redimensionar** — inputs W/H con candado de proporción (aspecto del recorte), presets (1080×1080 Instagram, 1080×1920 Historias, 1280×720 YouTube, 1600×900 X, 1920×1080 HD, 512×512 Avatar), "Quitar redimensionado". Sync de inputs omitido mientras se escribe.
2. **Recortar** — arrastre con Pointer Events sobre el canvas, overlay en % con máscara (`box-shadow: 0 0 0 9999px`), dimensiones en vivo, "Aplicar recorte" (se habilita si área >2%), "Usar imagen completa". Overlay ignorado en preview (`ignoreCrop`).
3. **Rotar / Espejar** — ⟲90°, ⟳90°, 180°, espejo H, espejo V. El recorte se remapea al rotar.
4. **Filtros** — chips: Blanco y negro (`grayscale`), Sepia (`sepia`), Negativo (`invert`). Combinables.
5. **Ajustes** — sliders brillo/contraste/saturación (0–200, default 100) y desenfoque (0–20 px). Commit de historial con debounce 500 ms.
6. **Quitar fondo (IA)** — `@imgly/background-removal` con barra de progreso (descarga de modelo → procesado). Resultado PNG con transparencia; botón pasa a "Restaurar original". 100% local tras la primera descarga.
7. **Esquinas** — slider 0–200 px de radio redondeado (se exporta recortado con transparencia en PNG/WebP).
8. **Exportar** — formato PNG/JPG/WebP, calidad 10–100 (oculta en PNG), dimensiones de salida y **estimación de tamaño real en vivo** (debounce 350 ms, genera el blob). Descarga `<nombre>-editado.<ext>`.

Extras globales: pegar con Ctrl+V, arrastrar sobre la zona o el canvas, atajos Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, toast de feedback.

## 8. UX / UI

- **Paleta** (`:root`): navy `#0B1026`, bg2 `#131A3A`, ámbar `#FFB03A` (acción primaria), cian `#35C4D9`, blanco `#F5F7FF`, muted `#8A93B8`, borde `rgba(255,255,255,.09)`, danger `#F87171`, green `#4ADE80`.
- **Layout desktop**: `editor-main` grid `auto 1fr 300px` (rail de herramientas · canvas · panel). **Móvil**: apilado, rail con scroll horizontal.
- Header con badge de privacidad; dropzone con borde punteado y glow al hover; toast fijo abajo; modal de progreso IA centrado.
- `accent-color: ámbar` en sliders/checkbox; `focus-visible` en todo lo interactivo; `user-select:none` en controles.

## 9. Rendimiento

- Preview renderizado con `requestAnimationFrame` deduplicado (máx. 1 render por frame).
- `previewScale = min(1, maxW/outW, maxH/outH)` con guarda contra contenedor oculto (evita escala negativa).
- Motor de IA con `import()` perezoso + singleton (una sola carga por sesión).
- `imageSmoothingQuality: 'high'` en preview y export.
- Estimación de tamaño con debounce; sin work en PNG (formato determinista).

## 10. SEO / PWA / Accesibilidad

- `lang="es"`, title y meta description, Open Graph, **JSON-LD** `WebApplication` (categoría MultimediaApplication, `offers price: 0 USD`).
- `manifest.webmanifest` (standalone, theme `#0B1026`, icono SVG `any`).
- Preconnect a `cdn.jsdelivr.net` + dns-prefetch a `staticimgly.com`.
- Dropzone con `role="button"`, `tabindex="0"` y activación por Enter/Espacio; labels en todos los controles.

## 11. GitHub Pages + Actions

`.github/workflows/deploy.yml`:

- `on: push [main]` + `workflow_dispatch`.
- Permisos: `contents:read`, `pages:write`, `id-token:write`.
- `concurrency: group pages, cancel-in-progress`.
- Job único `deploy` en `ubuntu-latest`, environment `github-pages` con URL de `steps.deployment.outputs.page_url`.
- Steps: `checkout@v4` → `configure-pages@v5` → `upload-pages-artifact@v3` (path `.`) → `deploy-pages@v4`.

Sin build step: el sitio se sube tal cual.

## 12. Pasos de implementación (orden estricto)

1. `PLAN.md` (este documento).
2. `index.html` — markup completo.
3. `css/styles.css` — tema y layout.
4. `js/app.js` — núcleo (estado, historial, render, export).
5. `js/tools.js` — bindings de UI.
6. `js/background.js` — loader IA.
7. `manifest.webmanifest` + `icons/icon.svg`.
8. `.github/workflows/deploy.yml`.
9. `README.md`.
10. Verificación (sección 13).

## 13. Verificación

- `node --check` en `js/app.js`, `js/tools.js`, `js/background.js` → sin errores.
- `JSON.parse` del manifest → válido.
- Servidor local (node one-liner) + fetch de todas las rutas (`/`, `/css/styles.css`, `/js/app.js`, `/js/tools.js`, `/js/background.js`, `/manifest.webmanifest`, `/icons/icon.svg`) → HTTP 200.
- Sin comandos git (no hay commit sin petición explícita).

## 14. Riesgos y limitaciones conocidas

- **GIF**: solo se carga el primer fotograma (limitación de `createImageBitmap`).
- **HEIC**: no soportado nativamente por los navegadores.
- **Safari antiguo**: sin `ctx.filter` (Safari <18) → filtros/ajustes no aplican; el resto funciona.
- **Primera vez del modo IA**: descarga ~40 MB (jsDelivr + staticimgly); offline falla con mensaje claro.
- **JPEG con esquinas/transparencia**: el fondo transparente se rellena de blanco al exportar JPEG (correcto por diseño).

## 15. Publicación (pasos del usuario)

```bash
git init
git add .
git commit -m "PixelLibre: editor de imágenes gratuito"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

Luego en GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Cada push a `main` redespliega automáticamente.
