# PixelLibre

**Editor de imágenes 100% gratuito que funciona completamente en tu navegador.** Quita el fondo con IA, añade texto con relleno y borde, aplica filtros, redimensiona, recorta, rota y exporta — sin registro, sin marcas de agua, sin límites. Tus imágenes nunca salen de tu dispositivo.

Desarrollado por **Cha0smagickLabs** — herramienta gratuita para las masas · https://cha0smagicklabs.com

## Características

- **Quitar fondo con IA** — procesado 100% local en tu navegador; el modelo (~90 MB) está **auto-hospedado en este sitio** (`vendor/imgly/`), se descarga una sola vez desde nuestro dominio y después queda en caché del navegador (funciona incluso sin conexión). Sin dependencias de CDNs de terceros.
- **Texto sobre la imagen** — múltiples capas de texto con 7 fuentes, tamaño, **relleno y borde con color independiente para cada uno**, grosor de borde, negrita y cursiva. Haz clic para seleccionar y arrastra para posicionar.
- **Redimensionar** — con candado de proporción y presets (Instagram, Historias, YouTube, X, HD, Avatar).
- **Recortar** — arrastre libre sobre la imagen con dimensiones en vivo.
- **Rotar / Espejar** — 90°, 180° y espejos horizontal/vertical.
- **Filtros** — blanco y negro, sepia, negativo y tono (hue-rotate −180° a 180°), combinables.
- **Ajustes** — brillo, contraste, saturación, desenfoque, viñeta y pixelado, en vivo.
- **Marco** — borde de color con grosor ajustable (útil para publicaciones en redes).
- **Esquinas redondeadas** — con transparencia real en PNG/WebP.
- **Modo claro y modo oscuro** — el usuario elige; se recuerda la preferencia y respeta el tema del sistema por defecto.
- **Exportar** — PNG / JPG / WebP con estimación de tamaño en vivo.
- **Deshacer / Rehacer** — historial de 50 pasos (Ctrl+Z / Ctrl+Y).
- **Pegar con Ctrl+V** y arrastrar y soltar.
- **Funciona offline** — Service Worker que cachea la app y el modelo de IA.

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

Nota: el repositorio pesa ~125 MB (modelo de IA auto-hospedado). GitHub admite archivos de hasta 100 MB por archivo (los chunks del modelo son de 4 MB) y sitios de hasta 1 GB.

## Stack

- HTML/CSS/JS vanilla — sin framework, sin build, sin dependencias de instalación.
- Canvas 2D API + `createImageBitmap` para todo el procesado.
- `@imgly/background-removal@1.4.5` **auto-hospedado** en `vendor/imgly/` (código + modelo + wasm; sin jsDelivr ni staticimgly.com).
- Service Worker (`sw.js`) para caché offline.
- GitHub Actions para el despliegue.

## Limitaciones

- **GIF**: solo se carga el primer fotograma.
- **HEIC**: no soportado nativamente por los navegadores.
- **Safari antiguo** (<18): sin `ctx.filter`, los filtros y ajustes no se aplican (el resto funciona).
- **Imágenes muy grandes**: se reducen a 6000 px en el lado mayor para una edición estable (se avisa al usuario).
- **Primera vez del modo IA**: descarga el modelo (~90 MB) desde este mismo dominio; después funciona sin conexión.

## Licencia

MIT
