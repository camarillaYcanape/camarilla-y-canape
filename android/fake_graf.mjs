// Servidor falso con la forma de la API publica de graf.cat, solo para las pruebas (nunca va en la APK).
// Modos por ruta: /ok/ (12 eventos), /ok2/ (14 eventos), /parcial/ (una ficha da 500), /raro/ (una URL no valida),
// /pocos/ (3 eventos), /acabadas/ (todo ya terminado), /incompleta/ (X-WP-Total no cuadra), /basura/ (no es JSON), /vacia/.
import http from 'node:http';
const port = +(process.env.PORT || 8765);
const d = (off) => { const x = new Date(Date.now() + off * 86400000); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(x); };
const cats = ['exposicio', 'exposicio', 'exposicio', 'exposicio', 'exposicio', 'inauguracio', 'inauguracio', 'inauguracio', 'visita-guiada', 'visita-guiada', 'xerrada', 'xerrada', 'taller', 'exposicio'];
const venues = [['sala-pares', 'Sala Par&eacute;s'], ['galeria-a', 'Galeria &#8216;A&#8217; &amp; Co'], ['galeria-b', 'Galeria B']];
function events(mode) {
  const n = { ok: 12, ok2: 14, parcial: 12, raro: 12, pocos: 3, acabadas: 12, incompleta: 12, vacia: 0 }[mode] ?? 12;
  const base = mode === 'ok2' ? 100 : 0;
  return Array.from({ length: n }, (_, i) => ({
    id: 1000 + base + i, link: (mode === 'raro' && i === 2 ? 'http://evil.example/x' : `https://graf.cat/events/event/prueba-${mode === 'ok2' ? 'b' : 'a'}-${i}/`),
    title: { rendered: `Prueba ${i} &#8211; ${mode === 'ok2' ? 'nueva' : 'vieja'} &amp; <em>cosas</em>` },
    class_list: ['event', `event-venue-${venues[i % 3][0]}`, `event-category-${cats[i]}`],
  }));
}
function occ(mode, id) {
  const i = (id - 1000) % 100; const c = cats[i];
  if (mode === 'acabadas') return [{ occurrence_id: id, event_id: id, start: `${d(-30)}T18:00:00+02:00`, end: `${d(-20)}T19:00:00+02:00` }];
  if (c === 'exposicio') return [{ occurrence_id: id, event_id: id, start: `${d(-5)}T00:00:00+02:00`, end: `${d(30 + i)}T23:59:00+02:00` }];
  return [1, 2].slice(0, c === 'xerrada' ? 2 : 1).map(k => ({ occurrence_id: id * 10 + k, event_id: id, start: `${d(k + i)}T18:30:00+02:00`, end: `${d(k + i)}T20:00:00+02:00` }));
}
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const m = u.pathname.match(/^\/([^/]+)\/wp-json\/wp\/v2\/(.*)$/);
  const j = (o, h = {}) => { res.writeHead(200, { 'content-type': 'application/json', ...h }); res.end(typeof o === 'string' ? o : JSON.stringify(o)); };
  console.log(new Date().toISOString(), req.method, req.url, 'UA=' + req.headers['user-agent'], 'cookie=' + (req.headers.cookie || '-'), 'auth=' + (req.headers.authorization || '-'));
  if (!m) { res.writeHead(404); return res.end('no'); }
  const [, mode, rest] = m;
  if (mode === 'basura') return j('<html>no soy json</html>');
  if (rest === 'events') { const ev = events(mode); return j(ev, { 'X-WP-Total': String(mode === 'incompleta' ? ev.length + 5 : ev.length), 'X-WP-TotalPages': '1' }); }
  if (rest === 'event-venues') return j(venues.map(([slug, name]) => ({ slug, name })), { 'X-WP-Total': '3', 'X-WP-TotalPages': '1' });
  const o = rest.match(/^events\/(\d+)\/occurrences/);
  if (o) { if (mode === 'parcial' && +o[1] === 1003) { res.writeHead(500); return res.end('boom'); } return j(occ(mode, +o[1])); }
  res.writeHead(404); res.end('no');
}).listen(port, '0.0.0.0', () => console.log('fake_graf en', port));
