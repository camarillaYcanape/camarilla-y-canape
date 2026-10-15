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
if (MODE === 'main') {
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
log('compartir -> texto enviado', sh(`adb shell dumpsys activity activities | grep -o -m3 'camarillaycanape.github.io[^ ,]*' || echo no-visible-en-dumpsys`));
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
log('tras Permitir: foco', sh('adb shell dumpsys window | grep -m1 mCurrentFocus'));
log('tras Permitir: proceso', sh('adb shell pidof org.camarillaycanape.app') || 'SIN PROCESO');
process.exit(0);
}
// Fase 2: tras el dialogo (la app puede haberse reiniciado).
await ev(`location.hash='#/ruta'`); await sleep(3000);
await ev(`plan.date=new Date(Date.now()+864e5).toISOString().slice(0,10);render()`); await sleep(1000);
log('avisos: boton fase 2', await ev(`(document.querySelector('#notif')||{}).innerText`));
log('avisos: permiso tras conceder', await ev(`AndroidApp.reminderPermission()`));
const cnt = () => parseInt(sh(`adb shell dumpsys alarm | grep -c 'org.camarillaycanape.app'; true`)) || 0;
const N0 = cnt();
await ev(`document.querySelector('#notif').click()`); await sleep(2000);
log('avisos: 2.o toque', await ev(`(document.querySelector('.toast,[role=status]')||{}).innerText`));
log('avisos: boton ahora', await ev(`(document.querySelector('#notif')||{}).innerText`));
const N1 = cnt();
log('avisos: lineas del paquete en dumpsys alarm antes -> despues de programar', N0 + ' -> ' + N1);
let prog = [];
try { prog = JSON.parse(await ev(`AndroidApp.scheduledReminders()`)); } catch (e) { log('avisos: no se pudo leer lo programado', String(e).slice(0, 80)); }
const exp = JSON.parse(await ev(`JSON.stringify(stopsView().list.map(x=>({t:x.p.n+' · '+clock(x.at),at:new Date(plan.date+'T00:00:00').getTime()+(x.at-15)*60000})))`));
log('avisos: paradas del plan / programadas en Android', exp.length + ' / ' + prog.length);
log('avisos: coincide titulo y hora de cada parada', prog.length > 0 && JSON.stringify(exp.map(e => [e.t, e.at])) === JSON.stringify(prog.map(p => [p.t, p.at])) ? 'SI' : 'NO');
if (prog.length) log('avisos: primera parada programada', JSON.stringify(prog[0]), 'hora UTC', new Date(prog[0].at).toISOString());
// Cancelar con el boton de la app
await ev(`document.querySelector('#notif').click()`); await sleep(2000);
log('avisos: boton tras quitar', await ev(`(document.querySelector('#notif')||{}).innerText`));
log('avisos: programadas tras quitar', await ev(`AndroidApp.scheduledReminders()`));
log('avisos: lineas del paquete en dumpsys alarm tras quitar', cnt());
// Zona horaria Europe/Madrid: la hora programada debe ser la de la parada menos 15 min, incluido el dia del cambio de hora
const fm = t => new Date(t).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour12: false, hour: '2-digit', minute: '2-digit' });
const horasOk = list => list.length > 0 && list.every(p => { const q = p.t.match(/· (\d\d):(\d\d)$/); if (!q) return false; const mins = +q[1] * 60 + +q[2] - 15; return fm(p.at) === String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0'); });
log('avisos: zona horaria del movil Europe/Madrid?', (await ev(`Intl.DateTimeFormat().resolvedOptions().timeZone`)));
log('avisos: hora programada = parada menos 15 min en Europe/Madrid (dia normal)', horasOk(prog) ? 'SI' : 'NO', prog.length ? prog[0].t + ' -> ' + fm(prog[0].at) : '');
await ev(`plan.date='2026-10-25';render()`); await sleep(1200);
await ev(`document.querySelector('#notif').click()`); await sleep(2000);
let dst = []; try { dst = JSON.parse(await ev(`AndroidApp.scheduledReminders()`)); } catch (e) {}
log('avisos: hora programada = parada menos 15 min en Europe/Madrid (cambio de hora 25/10)', horasOk(dst) ? 'SI' : 'NO', dst.length ? dst[0].t + ' -> ' + fm(dst[0].at) + ' ' + new Date(dst[0].at).toISOString() : 'sin datos');
await ev(`document.querySelector('#notif').click()`); await sleep(2000);
// Cancelacion de verdad: una alarma temporal a +30 s, se cancela, y no debe llegar nada
await ev(`AndroidApp.scheduleReminders(JSON.stringify([{id:'c',t:'Prueba CANCELADA',b:'no debe llegar',at:Date.now()+30000}]))`); await sleep(1500);
log('avisos: alarma temporal programada, lineas', cnt());
await ev(`AndroidApp.cancelReminders()`); await sleep(1500);
log('avisos: alarma temporal tras cancelar, lineas', cnt());
await sleep(45000);
log('avisos: llego la cancelada? (0 = no)', sh(`adb shell dumpsys notification --noredact | grep -c 'Prueba CANCELADA'; true`));
// Llegada con la app en segundo plano, con el contenido de una parada real (adelantada a +10 s)
if (prog.length) {
  const p0 = prog[0];
  await ev(`AndroidApp.scheduleReminders(JSON.stringify([{id:${JSON.stringify(p0.id)},t:${JSON.stringify(p0.t)},b:${JSON.stringify(p0.b)},at:Date.now()+10000}]))`);
  sh('adb shell input keyevent KEYCODE_HOME'); await sleep(30000);
  log('avisos: app en segundo plano, foco', sh('adb shell dumpsys window | grep -m1 mCurrentFocus'));
  log('avisos: proceso de la app vivo', sh('adb shell pidof org.camarillaycanape.app') || 'no');
  const nm = p0.t.split(' · ')[0];
  log('avisos: notificacion de parada real en segundo plano', sh(`adb shell dumpsys notification --noredact | grep -c -F ${JSON.stringify(nm)}; true`));
  log('avisos: notificacion publicada', sh(`adb shell dumpsys notification --noredact | grep -m2 -F ${JSON.stringify(nm)}`));
  execSync('adb shell cmd statusbar expand-notifications'); await sleep(2000); shot('07-aviso-recibido');
  execSync('adb shell cmd statusbar collapse'); await sleep(800);
  sh('adb shell am start -n org.camarillaycanape.app/.MainActivity'); await sleep(3000);
}
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
