#!/usr/bin/env node
/**
 * invita-render — renders an Invita-Ya invitation to a vertical MP4 with HyperFrames on THIS machine.
 * CPU, RAM and (optionally) GPU of the local device do the work; photos and music are read from disk or fetched
 * once into a temporary project folder. Nothing is uploaded anywhere.
 */
import { mkdir, writeFile, readFile, copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { cpus, totalmem, tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { buildComposition } from '../src/composition.mjs';
import { parseTarget, pickAssets } from '../src/invitation.mjs';

const USAGE = `Uso: invita-render <enlace-o-token> [opciones]

  <enlace-o-token>     https://invita.wmsolutions.tech/i/<token>  o  el token
  --out <archivo>      MP4 de salida (por defecto ./invitacion.mp4)
  --music <archivo>    música local (mp3/m4a/wav); si no, usa la canción propia de la invitación
  --photos <carpeta>   fotos locales (jpg/png/webp) en lugar de las de la invitación
  --base <url>         servidor de Invita-Ya (por defecto https://invita.wmsolutions.tech)
  --quality <q>        draft | looks | delivery (por defecto looks)
  --gpu                usa la GPU del equipo para codificar si está disponible
  --keep               conserva la carpeta temporal del proyecto
  --project-only       solo genera el proyecto HyperFrames (no renderiza)
`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--gpu' || a === '--keep' || a === '--project-only' || a === '--help') args[a.slice(2)] = true;
    else if (a.startsWith('--')) args[a.slice(2)] = argv[++i];
    else args._.push(a);
  }
  return args;
}

async function download(url, dest, maxBytes = 25 * 1024 * 1024) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error(`Solo se descargan recursos https: ${parsed.origin}`);
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`No se pudo descargar ${parsed.pathname} (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error('Un recurso supera el tamaño máximo.');
  await writeFile(dest, bytes);
}

/** Pixel size of an image (ffprobe ships with FFmpeg, already a prerequisite). */
const imageSize = (file) => new Promise((resolveSize) => {
  const child = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file], { stdio: ['ignore', 'pipe', 'ignore'] });
  let out = '';
  child.stdout.on('data', (chunk) => { out += chunk; });
  child.on('error', () => resolveSize({}));
  child.on('close', () => { const [width, height] = out.trim().split('x').map(Number); resolveSize({ width, height }); });
});

const run = (cmd, args, cwd) => new Promise((resolveRun, reject) => {
  const child = spawn(cmd, args, { cwd, stdio: 'inherit' });
  child.on('error', reject);
  child.on('close', (code) => (code === 0 ? resolveRun() : reject(new Error(`${cmd} terminó con código ${code}`))));
});

const QUICK_HINT = 'Alternativa sencilla: en Invita-Ya abre tu invitación y pulsa «Crear video ahora» (no instala nada).';

/** Friendly pre-flight so a missing tool never ends in a cryptic stack trace. */
async function checkPrerequisites() {
  const missing = [];
  if (Number(process.versions.node.split('.')[0]) < 22) missing.push(`Node 22 o superior (tienes ${process.versions.node})`);
  const ffmpeg = await new Promise((resolveCheck) => {
    const child = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
    child.on('error', () => resolveCheck(false));
    child.on('close', (code) => resolveCheck(code === 0));
  });
  if (!ffmpeg) missing.push('FFmpeg (instálalo con «brew install ffmpeg» en Mac o desde ffmpeg.org)');
  if (missing.length) {
    console.error(`Faltan requisitos:\n - ${missing.join('\n - ')}\n\n${QUICK_HINT}`);
    process.exit(2);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.length === 0) { process.stdout.write(USAGE); process.exit(args.help ? 0 : 1); }
  await checkPrerequisites();
  const base = args.base ?? 'https://invita.wmsolutions.tech';
  const { origin, token } = parseTarget(args._[0], base);
  const out = resolve(args.out ?? 'invitacion.mp4');

  const response = await fetch(`${origin}/api/invita/public/${token}`, { signal: AbortSignal.timeout(30_000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) throw new Error('No se encontró la invitación (¿está publicada?).');
  const assets = pickAssets(payload.data, origin);

  const project = join(tmpdir(), `invita-render-${token.slice(0, 8)}-${Date.now()}`);
  await mkdir(join(project, 'assets'), { recursive: true });

  let heroImage; let heroSize = {};
  if (assets.hero) { heroImage = 'assets/hero.png'; await download(assets.hero, join(project, heroImage)).catch(() => { heroImage = undefined; }); if (heroImage) heroSize = await imageSize(join(project, heroImage)); }

  const photos = [];
  if (args.photos) {
    const { readdir } = await import('node:fs/promises');
    const files = (await readdir(resolve(args.photos))).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort().slice(0, 3);
    for (const [i, file] of files.entries()) { const dest = `assets/photo-${i}${extname(file).toLowerCase()}`; await copyFile(join(resolve(args.photos), file), join(project, dest)); photos.push({ src: dest, ...(await imageSize(join(project, dest))) }); }
  } else {
    for (const [i, photo] of assets.photos.slice(0, 3).entries()) {
      const dest = `assets/photo-${i}.webp`;
      try { await download(photo.url, join(project, dest)); photos.push({ src: dest, caption: photo.caption, ...(await imageSize(join(project, dest))) }); } catch { /* skip photos that fail */ }
    }
  }

  let music;
  if (args.music) { music = `assets/music${extname(args.music).toLowerCase()}`; await copyFile(resolve(args.music), join(project, music)); }
  else if (assets.music) { music = 'assets/music.mp3'; await download(assets.music, join(project, music)).catch(() => { music = undefined; }); }

  const html = buildComposition({ ...assets.spec, heroImage, heroWidth: heroSize.width, heroHeight: heroSize.height, photos, music });
  await writeFile(join(project, 'index.html'), html);
  await writeFile(join(project, 'hyperframes.json'), JSON.stringify({ name: 'invita-ya', resolution: 'portrait' }, null, 2));
  console.log(`Proyecto: ${project}`);
  if (args['project-only']) return;

  const cores = cpus().length; const ramGb = Math.round(totalmem() / 1e9);
  console.log(`Renderizando en este equipo (${cores} núcleos, ${ramGb} GB de RAM)…`);
  await run('npx', ['--yes', 'hyperframes', 'check', '--json'], project).catch(() => { /* report only; render validates too */ });
  const renderArgs = ['--yes', 'hyperframes', 'render', '.', '-o', out, '-q', args.quality ?? 'looks', '-w', 'auto'];
  if (args.gpu) renderArgs.push('--gpu', '--browser-gpu');
  await run('npx', renderArgs, project);
  console.log(`Listo: ${out}`);
  if (!args.keep) await rm(project, { recursive: true, force: true });
}

main().catch((error) => { console.error(`Error: ${error.message}\n\n${QUICK_HINT}`); process.exit(1); });
