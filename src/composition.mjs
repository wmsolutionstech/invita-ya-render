/**
 * Builds a self-contained HyperFrames composition (1080x1920, 30 fps) for one invitation.
 * Everything visible is a pure function of timeline time, so the render is deterministic.
 * User text is HTML-escaped and only ever placed in text nodes.
 */
export const WIDTH = 1080;
export const HEIGHT = 1920;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const color = (value, fallback) => (/^#[0-9a-fA-F]{6}$/.test(value ?? '') ? value : fallback);
const words = (text, cls = 'w') => esc(text).split(/\s+/).filter(Boolean).map((word) => `<span class="${cls}">${word}</span>`).join(' ');
/** Largest box with the photo's own aspect ratio that fits inside max (never crops). */
export function fitBox(width, height, maxW = 800, maxH = 960) {
  if (!(width > 0) || !(height > 0)) return { w: maxW, h: maxH };
  const scale = Math.min(maxW / width, maxH / height);
  return { w: Math.round(width * scale), h: Math.round(height * scale) };
}
const norm = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function describeDate(iso, timeZone = 'America/Lima') {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, day: 'numeric', month: 'numeric', year: 'numeric', weekday: 'long' }).formatToParts(date).map((p) => [p.type, p.value]));
  const dayIndex = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(parts.weekday);
  return { day: parts.day, month: MONTHS[Number(parts.month) - 1], weekday: DAYS[dayIndex], year: parts.year };
}

export function formatTime(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? '');
  if (!match) return null;
  const hour = Number(match[1]);
  return `${((hour + 11) % 12) + 1}:${match[2]} ${hour >= 12 ? 'p. m.' : 'a. m.'}`;
}

/**
 * @param {object} spec
 * @param {string} spec.title @param {string} [spec.honoree] @param {number|string} [spec.age]
 * @param {string} [spec.message] @param {string} spec.eventDate ISO @param {string} [spec.time]
 * @param {string} [spec.place] @param {string} [spec.address]
 * @param {string} [spec.heroImage] asset path @param {{src:string,caption?:string}[]} [spec.photos]
 * @param {string} [spec.music] asset path @param {{primary?:string,secondary?:string,background?:string}} [spec.palette]
 */
export function buildComposition(spec) {
  const primary = color(spec.palette?.primary, '#7c3aed');
  const accent = color(spec.palette?.secondary, '#f5c451');
  const photos = (spec.photos ?? []).slice(0, 3);
  const date = describeDate(spec.eventDate);
  const time = formatTime(spec.time);
  const showAge = spec.age !== undefined && spec.age !== null && String(spec.age).trim() !== '';
  const showHonoree = spec.honoree && !norm(spec.title).includes(norm(spec.honoree));
  const message = (spec.message ?? '').trim().slice(0, 220);

  // Scene plan (seconds). Each scene is a clip; its children animate. Exits are shorter than entrances.
  let cursor = 0;
  const scenes = [];
  const add = (id, length) => { scenes.push({ id, start: cursor, length }); cursor += length; return scenes[scenes.length - 1]; };
  const hero = add('hero', 4.4);
  const note = message ? add('note', Math.min(5.2, 2.4 + message.split(/\s+/).length * 0.16)) : null;
  const album = photos.length ? add('album', photos.length * 1.5 + 0.6) : null;
  const when = date ? add('when', 3.6) : null;
  const close = add('close', 3.6);
  const total = Math.round(cursor * 100) / 100;
  const at = (scene, offset = 0) => (scene.start + offset).toFixed(3);

  const heroImage = spec.heroImage ? `<img id="bg-img" src="${esc(spec.heroImage)}" alt="" />` : '';
  const sceneAttrs = (s) => `class="clip scene" data-start="${s.start}" data-duration="${s.length}" data-track-index="2"`;

  const heroHtml = `
    <div id="hero" ${sceneAttrs(hero)}>
      <p id="hero-welcome">¡Estás invitado/a!</p>
      <h1 id="hero-title">${words(spec.title)}</h1>
      ${showHonoree ? `<p id="hero-honoree">${esc(spec.honoree)}</p>` : ''}
      ${showAge ? `<div id="hero-age"><strong>${esc(spec.age)}</strong><span>AÑOS</span></div>` : ''}
    </div>`;
  const noteHtml = note ? `
    <div id="note" ${sceneAttrs(note)}>
      <div id="note-card">
        <p id="note-eyebrow">Con mucho cariño</p>
        <blockquote id="note-text">${words(message, 'nw')}</blockquote>
      </div>
    </div>` : '';
  const albumHtml = album ? `
    <div id="album" ${sceneAttrs(album)}>
      <p id="album-eyebrow">Pequeños instantes, grandes recuerdos</p>
      ${photos.map((photo, i) => { const box = fitBox(photo.width, photo.height); return `<figure class="shot" id="shot-${i}" style="width:${box.w}px;height:${box.h}px;left:${Math.round((WIDTH - box.w) / 2)}px;top:${Math.round(330 + (960 - box.h) / 2)}px"><img src="${esc(photo.src)}" alt="" /></figure>`; }).join('')}
    </div>` : '';
  const whenHtml = when ? `
    <div id="when" ${sceneAttrs(when)}>
      <p class="when-eyebrow">Nos vemos el</p>
      <div id="when-date"><strong>${esc(date.day)}</strong><span>${esc(date.month)}</span></div>
      <p id="when-weekday">${esc(date.weekday)} · ${esc(date.year)}</p>
      ${time ? `<p class="when-row" id="when-time">${esc(time)}</p>` : ''}
      ${spec.place ? `<p class="when-row" id="when-place">${esc(spec.place)}</p>` : ''}
      ${spec.address ? `<p class="when-row small" id="when-address">${esc(spec.address)}</p>` : ''}
    </div>` : '';
  const closeHtml = `
    <div id="close" ${sceneAttrs(close)}>
      <h2 id="close-title">${words('Será un día inolvidable', 'cw')}</h2>
      <div id="close-rule"></div>
      <p id="close-note">Tu presencia lo hará aún más especial</p>
    </div>`;

  // ---- timeline -----------------------------------------------------------------------------------------------
  const tl = [];
  const T = (code) => tl.push(code);
  T(`tl.fromTo('#bg-img',{scale:1.02},{scale:1.16,duration:${total},ease:'none'},0);`);
  T(`tl.fromTo('#bg-fade',{opacity:0.15},{opacity:1,duration:0.8,ease:'power2.out'},0);`);
  // hero
  T(`tl.fromTo('#hero-welcome',{opacity:0,y:30},{opacity:1,y:0,duration:0.6,ease:'power3.out'},${at(hero, 0.15)});`);
  T(`tl.fromTo('#hero-title .w',{opacity:0,filter:'blur(14px)',y:50},{opacity:1,filter:'blur(0px)',y:0,duration:0.7,ease:'expo.out',stagger:0.14},${at(hero, 0.35)});`);
  if (showHonoree) T(`tl.fromTo('#hero-honoree',{opacity:0,filter:'blur(8px)'},{opacity:1,filter:'blur(0px)',duration:0.5,ease:'power2.out'},${at(hero, 1.3)});`);
  if (showAge) T(`tl.fromTo('#hero-age',{opacity:0,scale:0.3,rotation:-12},{opacity:1,scale:1,rotation:0,duration:0.9,ease:'back.out(1.6)'},${at(hero, 1.1)});`);
  T(`tl.to('#hero > *',{opacity:0,filter:'blur(10px)',duration:0.3,ease:'power2.in'},${at(hero, hero.length - 0.35)});`);
  // note
  if (note) {
    T(`tl.fromTo('#note-card',{opacity:0,scale:0.92,y:60},{opacity:1,scale:1,y:0,duration:0.7,ease:'power4.out'},${at(note, 0.05)});`);
    T(`tl.fromTo('#note-text .nw',{opacity:0.12},{opacity:1,duration:0.3,ease:'none',stagger:0.11},${at(note, 0.6)});`);
    T(`tl.to('#note-card',{opacity:0,y:-40,duration:0.3,ease:'power3.in'},${at(note, note.length - 0.35)});`);
  }
  // album
  if (album) {
    T(`tl.fromTo('#album-eyebrow',{opacity:0,y:20},{opacity:1,y:0,duration:0.5,ease:'power3.out'},${at(album, 0.05)});`);
    photos.forEach((_, i) => {
      const start = 0.3 + i * 1.5;
      const tilt = [-3, 2.5, -2][i % 3];
      T(`tl.fromTo('#shot-${i}',{opacity:0,scale:0.86,rotation:${tilt * 2.4},x:${i % 2 ? 160 : -160}},{opacity:1,scale:1,rotation:${tilt},x:0,duration:0.7,ease:'expo.out'},${at(album, start)});`);
      T(`tl.to('#shot-${i}',{opacity:0,y:-60,duration:0.3,ease:'power3.in'},${at(album, start + 1.4)});`);
    });
    T(`tl.to('#album-eyebrow',{opacity:0,duration:0.25,ease:'power2.in'},${at(album, album.length - 0.3)});`);
  }
  // when
  if (when) {
    T(`tl.fromTo('#when .when-eyebrow',{opacity:0,y:20},{opacity:1,y:0,duration:0.5,ease:'power3.out'},${at(when, 0.05)});`);
    T(`tl.fromTo('#when-date',{opacity:0,scale:0.6},{opacity:1,scale:1,duration:0.8,ease:'back.out(1.5)'},${at(when, 0.2)});`);
    T(`tl.fromTo('#when-weekday',{opacity:0},{opacity:1,duration:0.5,ease:'power2.out'},${at(when, 0.8)});`);
    T(`tl.fromTo('#when .when-row',{opacity:0,y:40},{opacity:1,y:0,duration:0.6,ease:'power3.out',stagger:0.18},${at(when, 1.1)});`);
    T(`tl.to('#when > *',{opacity:0,duration:0.3,ease:'power2.in'},${at(when, when.length - 0.35)});`);
  }
  // close
  T(`tl.fromTo('#close-title .cw',{opacity:0,y:70,filter:'blur(12px)'},{opacity:1,y:0,filter:'blur(0px)',duration:0.8,ease:'expo.out',stagger:0.16},${at(close, 0.1)});`);
  T(`tl.fromTo('#close-rule',{scaleX:0},{scaleX:1,duration:0.7,ease:'power3.out'},${at(close, 0.9)});`);
  T(`tl.fromTo('#close-note',{opacity:0,y:24},{opacity:1,y:0,duration:0.7,ease:'power3.out'},${at(close, 1.2)});`);

  const audio = spec.music ? `<audio id="music" src="${esc(spec.music)}" data-start="0" data-duration="${total}" data-volume="0.9" data-fade-in="0.6" data-fade-out="1.2"></audio>` : '';

  return `<!doctype html>
<html lang="es" data-resolution="portrait">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${WIDTH}, height=${HEIGHT}" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
<style>
  :root { --primary: ${primary}; --accent: ${accent}; --ink: #ffffff; --display: 'Playfair Display', serif; --body: 'Poppins', sans-serif; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: #120d22; }
  #root { position: absolute; inset: 0; font-family: var(--body); color: var(--ink); background: linear-gradient(160deg, color-mix(in srgb, var(--primary) 70%, #000), #120d22); }
  #bg { position: absolute; inset: 0; overflow: hidden; }
  #bg-img { position: absolute; left: 0; top: 0; width: ${WIDTH}px; height: ${HEIGHT}px; object-fit: cover; }
  #bg-fade { position: absolute; inset: 0; background: linear-gradient(180deg, #120d22cc 0%, #120d2266 38%, #120d22b8 70%, #120d22f2 100%); }
  .scene { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .w, .nw, .cw { display: inline-block; }
  /* hero: title block sits at the top, age badge in the middle, nothing below the 1330px safe line */
  #hero { padding-top: 250px; }
  #hero-welcome { font-size: 40px; letter-spacing: .08em; color: #efe6ff; }
  #hero-title { margin: 28px 70px 0; font-family: var(--display); font-weight: 800; font-size: 132px; line-height: 1.04; letter-spacing: -.02em; text-shadow: 0 6px 40px #0009; }
  #hero-honoree { margin-top: 26px; font-size: 52px; color: var(--accent); font-family: var(--display); font-style: italic; }
  #hero-age { margin-top: 56px; width: 360px; height: 360px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 6px solid var(--accent); background: radial-gradient(circle at 30% 25%, color-mix(in srgb, var(--accent) 34%, transparent), #120d2290 72%); box-shadow: 0 0 0 20px color-mix(in srgb, var(--accent) 16%, transparent), 0 30px 90px -20px var(--accent); }
  #hero-age strong { font-family: var(--display); font-size: 210px; line-height: .9; font-weight: 800; color: #fff; }
  #hero-age span { margin-top: 6px; font-size: 34px; letter-spacing: .38em; }
  #note { justify-content: center; padding-bottom: 420px; }
  #note-card { margin: 0 80px; padding: 70px 64px; border-radius: 48px; background: #1a1230d9; border: 2px solid color-mix(in srgb, var(--accent) 55%, transparent); }
  #note-eyebrow { font-size: 30px; letter-spacing: .3em; text-transform: uppercase; color: var(--accent); margin-bottom: 36px; }
  #note-text { font-family: var(--display); font-style: italic; font-size: 58px; line-height: 1.32; }
  #album { justify-content: center; padding-bottom: 420px; }
  #album-eyebrow { position: absolute; top: 220px; font-size: 34px; letter-spacing: .22em; text-transform: uppercase; color: var(--accent); }
  .shot { position: absolute; overflow: hidden; border-radius: 28px; border: 14px solid #f7f0ff; box-shadow: 0 40px 100px #000a; background: #f7f0ff; }
  .shot img { position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: contain; }
  #when { justify-content: center; padding-bottom: 420px; gap: 10px; }
  .when-eyebrow { font-size: 36px; letter-spacing: .3em; text-transform: uppercase; color: var(--accent); }
  #when-date { display: flex; flex-direction: column; align-items: center; margin: 18px 0 4px; }
  #when-date strong { font-family: var(--display); font-weight: 800; font-size: 330px; line-height: .86; }
  #when-date span { font-size: 70px; letter-spacing: .4em; padding-left: .4em; color: var(--accent); font-weight: 600; }
  #when-weekday { font-size: 42px; text-transform: capitalize; color: #efe6ff; margin-bottom: 40px; }
  .when-row { font-size: 56px; font-weight: 600; max-width: 900px; }
  .when-row.small { font-size: 38px; font-weight: 400; color: #e0d5f3; }
  #close { justify-content: center; padding-bottom: 420px; }
  #close-title { margin: 0 80px; font-family: var(--display); font-weight: 800; font-size: 120px; line-height: 1.08; text-shadow: 0 6px 40px #0009; }
  #close-rule { width: 360px; height: 6px; margin: 44px 0 40px; background: linear-gradient(90deg, transparent, var(--accent), transparent); transform-origin: center; }
  #close-note { font-size: 46px; color: #efe6ff; max-width: 820px; line-height: 1.4; }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${WIDTH}" data-height="${HEIGHT}">
  <div id="bg" class="clip" data-start="0" data-duration="${total}" data-track-index="0">${heroImage}<div id="bg-fade"></div></div>
  ${heroHtml}${noteHtml}${albumHtml}${whenHtml}${closeHtml}
  ${audio}
</div>
<script>
  const tl = gsap.timeline({ paused: true });
  ${tl.join('\n  ')}
  window.__timelines['main'] = tl;
</script>
</body>
</html>
`;
}
