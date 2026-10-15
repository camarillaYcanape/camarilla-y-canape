// Controla el WebView real del emulador por el protocolo de depuracion (solo APK de depuracion).
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const EV = process.env.EVIDENCE || 'evidence';
const MODE = process.env.MODE || 'main';
const sh = c => { try { return execSync(c, { encoding: 'utf8' }).trim(); } catch (e) { return 'ERR ' + e.message.slice(0, 120); } };
const log = (...a) => console.log('[e2e]', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = n => fs.writeFileSync(`${EV}/${n}.png`, execSync('adb exec-out screencap -p', { maxBuffer: 1 << 26 }));
const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
const tab = tabs.find(t => t.type === 'page');
log('pagina', tab.url);
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));
ws.onclose = () => log('CONEXION DE DEPURACION CERRADA (la app se cerro o recargo)');
let id = 0; const pend = {}; const net = [];
ws.onmessage = m => {
  const d = JSON.parse(m.data);
  if (d.id && pend[d.id]) pend[d.id](d);
  if (d.method === 'Network.responseReceived') {
    const u = d.params.response.url;
    if (/tile\.openstreetmap|router\.project-osrm/.test(u)) net.push(`${d.params.response.status} ${u.slice(0, 80)}`);
  }
  if (d.method === 'Runtime.exceptionThrown') log('EXC', JSON.stringify(d.params.exceptionDetails).slice(0, 200));
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.result?.value ?? JSON.stringify(r.result); };
await send('Runtime.enable'); await send('Network.enable');

if (MODE === 'set') { await ev(`localStorage.setItem('cyc_test_marker','sobrevive-'+${JSON.stringify(process.env.MARK || 'x')})`); log('marcador escrito', await ev(`localStorage.getItem('cyc_test_marker')`)); process.exit(0); }
if (MODE === 'get') { log('marcador leido tras actualizar', await ev(`localStorage.getItem('cyc_test_marker')`)); process.exit(0); }
if (MODE === 'offline') {
  log('sin red: navigator.onLine', await ev('navigator.onLine'));
  log('sin red: origen', await ev('location.origin'));
  log('sin red: logo', await ev(`!!document.querySelector('.logo') && document.querySelector('.logo').naturalWidth`));
  await ev(`location.hash='#/expos'`); await sleep(1500);
  log('sin red: agenda tarjetas', await ev(`document.querySelectorAll('article').length`));
  shot('11-sin-red-agenda');
  await ev(`location.hash='#/ruta'`); await sleep(2000);
  log('sin red: ruta pantalla', (await ev(`document.body.innerText.slice(0,300).replace(/\\n+/g,' | ')`)));
  await ev(`document.querySelector('#gen')&&document.querySelector('#gen').click()`); await sleep(9000);
  log('sin red: tras generar ruta', (await ev(`[...document.querySelectorAll('[role=status],.warn,.toast,.summary')].map(e=>e.innerText.replace(/\\n+/g,' ')).join(' ; ').slice(0,400)`)));
  shot('12-sin-red-ruta');
  process.exit(0);
}
log('origen', await ev('location.origin'));
log('UA', await ev('navigator.userAgent'));
log('funciones', await ev(`JSON.stringify({Notification:'Notification' in window, share:!!navigator.share, clipboard:!!navigator.clipboard, sw:'serviceWorker' in navigator, geo:!!navigator.geolocation})`));
log('titulo', await ev(`document.querySelector('header h1').innerText + ' | logo ' + !!document.querySelector('.logo') + ' ' + (document.querySelector('.logo')||{}).naturalWidth`));
// Ruta Eixample
await ev(`document.querySelector('#gen')&&document.querySelector('#gen').click()`); await sleep(9000);
log('hash', await ev('location.hash'));
await ev(`document.querySelector('.map-panel')&&document.querySelector('.map-panel').scrollIntoView()`); await sleep(2500);
log('red tiles/osrm', JSON.stringify([...new Set(net)].slice(0, 12)));
log('imagenes de mapa en SVG', await ev(`document.querySelectorAll('.map-panel image').length`));
shot('02-ruta-mapa');
// Compartir enlace
await ev(`document.querySelector('#share')&&document.querySelector('#share').click()`); await sleep(2500);
log('compartir -> aviso', await ev(`(document.querySelector('.toast,[role=status]')||{}).innerText`));
log('compartir -> ventana', sh(`adb shell dumpsys window | grep -m1 mCurrentFocus`));
log('compartir -> texto enviado', sh(`adb shell dumpsys activity activities | grep -o -m2 'extra.TEXT[^ ]\\{0,200\\}'`));
shot('06-compartir');
execSync('adb shell input keyevent KEYCODE_BACK'); await sleep(1500);
log('tras cerrar compartir, foco', sh(`adb shell dumpsys window | grep -m1 mCurrentFocus`));
// Avisos nativos
await ev(`plan.date=new Date(Date.now()+864e5).toISOString().slice(0,10);render()`); await sleep(800);
log('avisos: boton', await ev(`(document.querySelector('#notif')||{}).innerText`));
log('avisos: permiso inicial', await ev(`AndroidApp.reminderPermission()`));
await ev(`document.querySelector('#notif').click()`); await sleep(2500);
log('avisos: 1.er toque', await ev(`(document.querySelector('.toast,[role=status]')||{}).innerText`));
shot('06b-permiso-avisos');
// Se pulsa "Permitir" en el dialogo real del sistema (conceder por adb cerraria la app).
const ui = sh('adb shell uiautomator dump /sdcard/u.xml >/dev/null; adb shell cat /sdcard/u.xml');
const mm = ui.match(/resource-id="com\.android\.permissioncontroller:id\/permission_allow_button"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
log('avisos: boton Permitir del dialogo', mm ? 'encontrado' : 'NO encontrado');
if (mm) sh(`adb shell input tap ${Math.round((+mm[1] + +mm[3]) / 2)} ${Math.round((+mm[2] + +mm[4]) / 2)}`);
await sleep(2000);
log('avisos: permiso tras conceder', await ev(`AndroidApp.reminderPermission()`));
await ev(`document.querySelector('#notif').click()`); await sleep(2000);
log('avisos: 2.o toque', await ev(`(document.querySelector('.toast,[role=status]')||{}).innerText`));
log('avisos: boton ahora', await ev(`(document.querySelector('#notif')||{}).innerText`));
log('avisos: alarmas de Android programadas', sh(`adb shell dumpsys alarm | grep -c 'org.camarillaycanape.app'`));
await ev(`document.querySelector('#notif').click()`); await sleep(1500);
log('avisos: tras quitar, alarmas', sh(`adb shell dumpsys alarm | grep -c 'reminder://'`));
// El aviso llega de verdad: alarma a +6 s por el mismo puente
await ev(`AndroidApp.scheduleReminders(JSON.stringify([{id:'t',t:'Prueba de aviso',b:'En 15 minutos. Calle de prueba',at:Date.now()+6000}]))`); await sleep(20000);
log('avisos: notificacion publicada', sh(`adb shell dumpsys notification --noredact | grep -m3 -E 'Prueba de aviso|En 15 minutos'`));
execSync('adb shell cmd statusbar expand-notifications'); await sleep(2000); shot('07-aviso-recibido');
execSync('adb shell cmd statusbar collapse'); await sleep(800);
// .ics
await ev(`document.querySelector('#ics')&&document.querySelector('#ics').click()`); await sleep(4000);
shot('03-ics-selector');
log('ics: ventana', sh(`adb shell dumpsys window | grep -m1 mCurrentFocus`));
execSync('adb shell input keyevent KEYCODE_BACK'); await sleep(1500);
// Cerca de mi con ubicacion
await ev(`location.hash='#/'`); await sleep(800);
await ev(`document.querySelector('[data-choice=Barrio][data-value=Cerca]')&&document.querySelector('[data-choice=Barrio][data-value=Cerca]').click()`); await sleep(800);
execSync('adb emu geo fix 2.1649 41.3917');
await ev(`document.querySelector('#geo')&&document.querySelector('#geo').click()`);
let st = '';
for (let i = 0; i < 12; i++) { await sleep(2500); st = await ev(`(document.querySelector('.summary')||{}).innerText||''`); if (/Tu ubicación actual/.test(st) && !/Buscando/.test(st)) break; }
log('cerca de mi: ubicacion', /Tu ubicación actual/.test(st) ? 'OBTENIDA' : 'NO obtenida', '|', st.split('\n').slice(0, 2).join(' / '), '|', await ev(`[...document.querySelectorAll('[role=status],.warn,.toast')].map(e=>e.innerText).join(' ; ')`));
shot('04-cerca-de-mi');
// Agenda
await ev(`location.hash='#/expos'`); await sleep(1500);
log('agenda tarjetas', await ev(`document.querySelectorAll('article').length`));
shot('05-agenda');
process.exit(0);
