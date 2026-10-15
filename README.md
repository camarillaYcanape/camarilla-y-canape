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
- El mapa de fondo son teselas de OpenStreetMap (tile.openstreetmap.org, https://operations.osmfoundation.org/policies/tiles/): uso ligero, con atribución, sin garantías. Con "Cerca de mí" solo se piden tras aceptar la casilla.

## Archivos

`index.html` contiene la app, los datos y la ilustración. `sw.js` solo gestiona la notificación. Sin compilación ni claves.

## Propuesta pendiente: actualizar la agenda (no implementada)

Estado: **solo propuesta**. No existe ningún botón de actualizar ni automatización, y no se ha obtenido permiso de las fuentes. La agenda sigue siendo una copia fechada.

Lo acordado como punto de partida:

- **Copia común.** Una única copia de la agenda que consulten todas las personas que usen la app, en vez de que cada navegador pregunte a la fuente.
- **Una renovación al día como máximo**, compartida entre todos los usuarios. Un límite guardado solo en cada navegador no vale: cien personas podrían provocar cien consultas.
- **Botón desactivado** durante ese intervalo, con la fecha de la última actualización y cuándo volverá a estar disponible.
- **Si la actualización falla**, se conserva la última copia válida y se muestra su fecha.
- Que pase un día **no garantiza que haya novedades**.
- **Condiciones de reutilización sin aclarar.** No se han podido confirmar las de GRAF (graf.cat), que alimenta la agenda de ArtBarcelona. Es una incertidumbre pendiente, no una prohibición probada. Hasta aclararlo, la agenda se mantiene como copia fechada con atribución y enlace a la fuente.
- Galeries d'Art de Catalunya aplica un captcha a las consultas automáticas: solo se puede refrescar a mano desde un navegador.

Esta propuesta no añade cuentas, pagos, datos personales ni monitores recurrentes.
