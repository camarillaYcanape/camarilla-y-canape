// Controla el WebView real del emulador por el protocolo de depuracion (solo APK de depuracion).
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const EV = process.env.EVIDENCE || 'evidence';
const log = (...a) => console.log('[e2e]', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = n => fs.writeFileSync(`${EV}/${n}.png`, execSync('adb exec-out screencap -p', { maxBuffer: 1 << 26 }));
const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
const tab = tabs.find(t => t.type === 'page');
log('pagina', tab.url);
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));
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
await ev(`document.querySelector('#share')&&document.querySelector('#share').click()`); await sleep(1500);
log('compartir -> aviso', await ev(`(document.querySelector('.toast,[role=status]')||{}).innerText`));
// Avisos
await ev(`document.querySelector('#notif')&&document.querySelector('#notif').click()`); await sleep(1500);
log('avisos -> aviso', await ev(`(document.querySelector('.toast,[role=status]')||{}).innerText`));
// .ics
await ev(`document.querySelector('#ics')&&document.querySelector('#ics').click()`); await sleep(4000);
shot('03-ics-selector');
log('ics tras pulsar', 'ver listado de cache/ics y captura 03');
execSync('adb shell input keyevent KEYCODE_BACK'); await sleep(1500);
// Cerca de mi con ubicacion
await ev(`location.hash='#/'`); await sleep(800);
await ev(`document.querySelector('[data-choice=Barrio][data-value=Cerca]')&&document.querySelector('[data-choice=Barrio][data-value=Cerca]').click()`); await sleep(800);
await ev(`document.querySelector('#geo')&&document.querySelector('#geo').click()`); await sleep(4000);
log('cerca de mi', await ev(`(document.querySelector('.summary')||{}).innerText`));
shot('04-cerca-de-mi');
// Agenda
await ev(`location.hash='#/expos'`); await sleep(1500);
log('agenda tarjetas', await ev(`document.querySelectorAll('article').length`));
shot('05-agenda');
process.exit(0);
