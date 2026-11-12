# invita-ya-render

Componente aparte de Invita-Ya: renderiza una invitación como **video vertical 1080×1920 (MP4)** con
[HyperFrames](https://hyperframes.heygen.com) **en el propio equipo** de quien lo ejecuta. La CPU, la RAM y, con
`--gpu`, la GPU del dispositivo hacen el trabajo; el servidor no gasta recursos y nada se sube a ningún lado.

## Requisitos
Node 22+, Chrome/Chromium (HyperFrames lo usa sin pantalla) y FFmpeg en el `PATH`.

## Uso
```bash
npx --yes github:wmsolutionstech/invita-ya-render https://invita.wmsolutions.tech/i/<token> --out mi-video.mp4
# o desde un clon:
node bin/invita-render.mjs <enlace-o-token> --out mi-video.mp4 --gpu --quality delivery
```
Opciones: `--music <archivo>` (música local), `--photos <carpeta>` (hasta 3 fotos locales), `--quality draft|looks|delivery`,
`--gpu`, `--keep`, `--project-only`. Los renders usan todos los núcleos disponibles (`-w auto`).

## Qué hace
1. Lee la invitación pública (`/api/invita/public/<token>`): título, fecha, lugar, mensaje, colores, imagen vertical.
2. Descarga solo recursos `https` a una carpeta temporal (máx. 25 MB c/u) o toma los locales que le indiques.
3. Elige el modo de portada: si la imagen es vertical (como la versión «Celular» generada con IA) va a pantalla completa; si es cuadrada o apaisada se muestra **entera** en un marco, para no recortar a las protagonistas.
4. Genera una composición HyperFrames (`src/composition.mjs`): título palabra por palabra, insignia de edad, mensaje,
   álbum (polaroids), fecha/lugar y un cierre en dos tiempos (mensaje con destellos y «Te esperamos» con resumen), **sin enlace**. Dura ≈ 25–36 s según los datos. El texto del usuario se escapa; nunca se inyecta como HTML.
5. `hyperframes check` + `hyperframes render`.

El render del servidor (FFmpeg) de Invita-Ya sigue siendo el respaldo para celulares, donde no puede correr HyperFrames.

## Pruebas
`npm test` (puras, sin red).
