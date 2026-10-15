// Regresion basica de la web en un navegador de escritorio real (Chrome), sin el puente Android.
import { chromium } from 'playwright-core';
const log = (...a) => console.log('[web]', ...a);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let ok = true;
for (const [name, url] of [['repo (index.html de esta build)', 'http://127.0.0.1:8099/index.html'], ['publicada en Pages', 'https://camarillaycanape.github.io/camarilla-y-canape/']]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, locale: 'es-ES' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  const check = (label, cond, extra = '') => { log(name, '-', label, cond ? 'OK' : 'FALLO', extra); if (!cond) ok = false; };
  await page.goto(url, { waitUntil: 'load' }); await page.waitForTimeout(1500);
  const nav = await page.evaluate(() => document.body.innerText);
  check('inicio con pestanas', ['Inicio', 'Mi ruta', 'Agenda', 'Guía y límites'].every(t => nav.includes(t)));
  check('sin puente Android', await page.evaluate(() => typeof window.AndroidApp === 'undefined'));
  check('logo cargado', await page.evaluate(() => { const l = document.querySelector('.logo'); return !!l && l.naturalWidth > 0; }));
  await page.evaluate(() => { const g = document.querySelector('#gen'); if (g) g.click(); });
  await page.waitForFunction(() => location.hash.startsWith('#/ruta'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);
  check('ruta generada', await page.evaluate(() => location.hash.startsWith('#/ruta') && !!document.querySelector('.map-panel')));
  const lbl = await page.evaluate(() => (document.querySelector('#notif') || {}).innerText);
  check('boton de avisos de navegador', lbl === 'Avisarme con la pestaña abierta', JSON.stringify(lbl));
  check('boton compartir presente', await page.evaluate(() => !!document.querySelector('#share')));
  await page.evaluate(() => { location.hash = '#/expos'; }); await page.waitForTimeout(1500);
  const n = await page.evaluate(() => document.querySelectorAll('article').length);
  check('agenda con tarjetas', n > 0, String(n));
  check('sin errores de script', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
await browser.close();
log(ok ? 'WEB OK' : 'WEB FALLO');
process.exit(0);
