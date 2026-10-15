# camarillaYcanape

Rutas a pie por galerías reales de Barcelona (Eixample, Poblenou y Born), con ironía cómplice. Pepinillo, oliva y crema.

## Qué hace

- Monta una ruta de 2 a 5 galerías (más un café opcional) para el día y la hora que elijas.
- Descarta lo que OpenStreetMap marca como cerrado a esa hora. Sin horario anotado, sale como "sin verificar".
- Tiempos a pie reales con OSRM (con estimación si no hay conexión).
- Salida desde un barrio o desde tu ubicación. La ubicación no se guarda ni va en los enlaces. Para tiempos reales, y solo si lo aceptas con una casilla, las coordenadas de salida y de las paradas se envían al servidor demo de OSRM (que también ve tu IP). Sin aceptar, se usan tiempos estimados y no se envía nada.
- Abre la ruta en Google Maps, descarga un .ics con alarma 15 min antes de cada parada (lo importas tú; que suene depende de tu calendario) o prepara un evento en Google Calendar (lo confirmas tú).
- Avisos con la pestaña abierta (service worker `sw.js`), comprobación de visita por GPS, visitas manuales, cambiar parada, compartir ruta por enlace (solo zona, día, hora y paradas).
- Pestaña Agenda con inauguraciones, exposiciones, visitas y .ics por evento.
- Guion de conversación por galería, con frases propias.

## Límites

- Datos de OpenStreetMap (copia del 15/10/2026, ODbL): pueden estar incompletos o desfasados. Confirma el horario antes de ir.
- Agenda: copia manual (15/10/2026) de ArtBarcelona/GRAF (https://www.artbarcelona.es/es/agenda/, con inauguraciones, exposiciones, visitas y charlas con fecha y hora) y del programa de Galeries d’Art de Catalunya (https://www.galeriesdecatalunya.org/es/programa/). No se actualiza sola ni se consulta en directo. Se distingue inauguración de exposición; sin hora o fecha en la fuente, no se inventa.
- Sin servidor propio: no hay avisos con la app cerrada (salvo vía calendario), ni sincronización, ni reservas.
- OSRM es un servidor demo de uso moderado y sin garantías.

## Archivos

`index.html` contiene la app, los datos y la ilustración. `sw.js` solo gestiona la notificación. Sin compilación ni claves.
