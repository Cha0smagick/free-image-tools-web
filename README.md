# PixelLibre

**Editor de imágenes 100% gratuito que funciona completamente en tu navegador.** Quita el fondo con IA, aplica filtros, redimensiona, recorta, rota y exporta — sin registro, sin marcas de agua, sin límites. Tus imágenes nunca salen de tu dispositivo.

## Características

- 🪄 **Quitar fondo con IA** — procesado 100% local en tu navegador (`@imgly/background-removal`); la primera vez descarga un modelo (~40 MB) y luego funciona con caché.
- 📐 **Redimensionar** — con candado de proporción y presets (Instagram, Historias, YouTube, X, HD, Avatar).
- ✂️ **Recortar** — arrastre libre sobre la imagen con dimensiones en vivo.
- 🔄 **Rotar / Espejar** — 90°, 180° y espejos horizontal/vertical.
- 🎨 **Filtros** — blanco y negro, sepia y negativo (combinables).
- ☀️ **Ajustes** — brillo, contraste, saturación y desenfoque en vivo.
- 🔲 **Esquinas redondeadas** — con transparencia real en PNG/WebP.
- ⬇️ **Exportar** — PNG / JPG / WebP con estimación de tamaño en vivo.
- ↶ **Deshacer / Rehacer** — historial de 50 pasos (Ctrl+Z / Ctrl+Y).
- 📋 **Pegar con Ctrl+V** y arrastrar y soltar.

## Publicar en GitHub Pages

1. Crea un repositorio en GitHub y sube este proyecto:

   ```bash
   git init
   git add .
   git commit -m "PixelLibre: editor de imágenes gratuito"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
   git push -u origin main
   ```

2. En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

3. Cada push a `main` despliega automáticamente el sitio (workflow en `.github/workflows/deploy.yml`).

## Stack

- HTML/CSS/JS vanilla — sin framework, sin build, sin dependencias de instalación.
- Canvas 2D API + `createImageBitmap` para todo el procesado.
- `@imgly/background-removal@1.7.0` (carga perezosa desde jsDelivr) para quitar fondos.
- GitHub Actions para el despliegue.

## Limitaciones

- **GIF**: solo se carga el primer fotograma.
- **HEIC**: no soportado nativamente por los navegadores.
- **Safari antiguo** (<18): sin `ctx.filter`, los filtros y ajustes no se aplican (el resto funciona).
- **Primera vez del modo IA**: requiere conexión a internet para descargar el modelo; después funciona sin red.

## Licencia

MIT
