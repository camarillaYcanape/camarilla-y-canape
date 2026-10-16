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

// Agenda actualizable: en el navegador no hay boton; con un puente simulado se valida la lectura del registro local.
{
  const mk = async (init) => { const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, locale: 'es-ES' }); if (init) await ctx.addInitScript(init); const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 120))); await page.goto('http://127.0.0.1:8099/index.html#/expos', { waitUntil: 'load' }); await page.waitForTimeout(1500); return { ctx, page, errs }; };
  const chk2 = (l, c, x = '') => { log('agenda -', l, c ? 'OK' : 'FALLO', x); if (!c) ok = false; };
  const iso = new Date().toISOString();
  const rec = (o = {}) => { const items = [{ y: 'e', g: 'Galeria Falsa', t: 'Exposicion de prueba del puente', u: 'https://graf.cat/events/event/falsa/', f: 'A', s: '2026-10-01', e: '2099-01-01' }]; return JSON.stringify({ v: 1, source: 'x', fetchedMs: Date.now(), fetchedAt: iso, n: 1, sha256: 'x', items, ...o }); };
  let t = await mk(null);
  chk2('navegador: sin boton de actualizar', await t.page.evaluate(() => !document.querySelector('#agrefresh')));
  chk2('navegador: fecha de la copia incluida', await t.page.evaluate(() => abWhen() === '15/10/2026'));
  const base = await t.page.evaluate(() => document.querySelectorAll('article').length);
  chk2('navegador: texto aclara que la actualizacion es de la app de Android', await t.page.evaluate(() => /actualizar desde la app de Android/.test(document.body.innerText)));
  await t.ctx.close();
  t = await mk(`window.AndroidApp={agendaLoad:()=>${JSON.stringify(rec())},agendaStatus:()=>JSON.stringify({hasData:true,allowed:false,nextAllowedMs:Date.now()+3600000,fetchedMs:Date.now()}),agendaRefresh:()=>'limit',scheduleReminders(){}};`);
  chk2('puente con registro valido: se usan sus datos', await t.page.evaluate(() => AB_META !== null && /Exposicion de prueba del puente/.test(document.body.innerText) && !/Sala Parés/.test(document.body.innerText)));
  chk2('puente: boton visible y desactivado por el limite', await t.page.evaluate(() => { const b = document.querySelector('#agrefresh'); return !!b && b.disabled; }));
  chk2('puente: fecha mostrada es la del registro', await t.page.evaluate(() => abWhen() !== '15/10/2026'));
  chk2('puente: sin errores de script', t.errs.length === 0, t.errs.join('|'));
  await t.ctx.close();
  for (const [name, r] of [['registro mas antiguo que la copia incluida', rec({ fetchedAt: '2026-10-01T10:00:00+02:00' })], ['JSON roto', '{"v":1,'], ['version de esquema desconocida', rec({ v: 2 })], ['sin items', rec({ items: [] })], ['item con tipo raro', rec({ items: [{ y: 'z', g: 'g', t: 't', u: 'u', s: '2026-10-01', e: '2026-10-02' }] })]]) {
    t = await mk(`window.AndroidApp={agendaLoad:()=>${JSON.stringify(r)},agendaStatus:()=>'{}',agendaRefresh:()=>'started',scheduleReminders(){}};`);
    chk2(name + ': se usa la copia incluida', await t.page.evaluate(() => AB_META === null && abWhen() === '15/10/2026'));
    chk2(name + ': mismas tarjetas que sin puente', (await t.page.evaluate(() => document.querySelectorAll('article').length)) === base);
    chk2(name + ': sin errores de script', t.errs.length === 0, t.errs.join('|'));
    await t.ctx.close();
  }
}
await browser.close();
log(ok ? 'WEB OK' : 'WEB FALLO');
process.exit(0);
