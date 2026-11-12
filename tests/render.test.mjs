import test from 'node:test';
import assert from 'node:assert/strict';
import { buildComposition, describeDate, formatTime } from '../src/composition.mjs';
import { parseTarget, pickAssets } from '../src/invitation.mjs';

const base = { title: 'Cumpleaños de Alexa', eventDate: '2026-11-23T15:17:00+00:00', honoree: 'Alexa', age: 6 };

test('honoree row is omitted when the name is already in the title (accent-insensitive)', () => {
  assert.ok(!buildComposition(base).includes('id="hero-honoree"'));
  assert.ok(buildComposition({ ...base, title: 'Fiesta de las guerreras' }).includes('id="hero-honoree"'));
  assert.ok(!buildComposition({ ...base, title: 'Cumpleaños de ÁLEXA' }).includes('id="hero-honoree"'));
});

test('hostile text is escaped and the closing never carries a link', () => {
  const html = buildComposition({ ...base, title: '<img src=x onerror=alert(1)>', message: '"><script>alert(1)</script>' });
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!/<script>alert/.test(html));
  assert.ok(!/https?:\/\/[^"]*invita/.test(html.split('id="close"')[1] ?? ''));
  assert.match(html, /Será<\/span> <span class="cw">un/);
});

test('scenes adapt to the data and the root duration covers them', () => {
  const bare = buildComposition({ title: 'Fiesta', eventDate: 'invalid' });
  assert.ok(!bare.includes('id="when"') && !bare.includes('id="note"') && !bare.includes('id="album"'));
  const full = buildComposition({ ...base, message: 'Hola a todos', photos: [{ src: 'assets/a.webp' }, { src: 'assets/b.webp' }] });
  assert.ok(full.includes('id="album"') && full.includes('id="shot-1"'));
  const total = Number(/data-composition-id="main" data-start="0" data-duration="([\d.]+)"/.exec(full)[1]);
  assert.ok(total > 12 && total < 30);
});

test('date and time formatting use Lima time and 12-hour clock', () => {
  assert.deepEqual(describeDate('2026-11-23T15:17:00+00:00'), { day: '23', month: 'NOV', weekday: 'lunes', year: '2026' });
  assert.equal(formatTime('12:17'), '12:17 p. m.');
  assert.equal(formatTime('00:05'), '12:05 a. m.');
  assert.equal(formatTime('nope'), null);
});

test('target parsing accepts tokens and https links only', () => {
  const parsed = parseTarget('AbCdEfGh12345678', 'https://invita.wmsolutions.tech');
  assert.equal(parsed.origin, 'https://invita.wmsolutions.tech');
  assert.equal(parsed.token, 'AbCdEfGh12345678');
  assert.equal(parseTarget('https://invita.wmsolutions.tech/i/AbCdEfGh12345678', 'x:').token, 'AbCdEfGh12345678');
  assert.throws(() => parseTarget('http://evil.test/i/AbCdEfGh12345678', 'https://a.b'));
  assert.throws(() => parseTarget('not a link', 'https://a.b'));
});

test('asset picking prefers the phone image and own music', () => {
  const a = pickAssets({ title: 'T', eventDate: 'x', customConfig: { ai: { imageUrl: 'https://s/i.png', mobileImageUrl: 'https://s/m.png' }, experience: { music: 'custom', customMusic: { url: 'https://s/a.mp3' }, photos: [{ url: '/api/invita/media/tok/1', caption: 'c' }] } } }, 'https://invita.wmsolutions.tech');
  assert.equal(a.hero, 'https://s/m.png');
  assert.equal(a.music, 'https://s/a.mp3');
  assert.equal(a.photos[0].url, 'https://invita.wmsolutions.tech/api/invita/media/tok/1');
});

import { fitBox } from '../src/composition.mjs';
test('photos keep their own aspect ratio inside the frame (no cropping)', () => {
  assert.deepEqual(fitBox(600, 900), { w: 640, h: 960 });
  assert.deepEqual(fitBox(1600, 900), { w: 800, h: 450 });
  assert.deepEqual(fitBox(1000, 1000), { w: 800, h: 800 });
  assert.deepEqual(fitBox(0, 0), { w: 800, h: 960 });
  const html = buildComposition({ title: 'F', eventDate: '2026-11-23T15:00:00Z', photos: [{ src: 'assets/a.webp', width: 1600, height: 900 }] });
  assert.match(html, /id="shot-0" style="width:800px;height:450px;left:140px;top:585px"/);
  assert.match(html, /object-fit: contain/);
});
