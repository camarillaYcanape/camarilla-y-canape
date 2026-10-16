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
- Agenda: copia manual (15/10/2026) de ArtBarcelona/GRAF (https://www.artbarcelona.es/es/agenda/, con inauguraciones, exposiciones, visitas y charlas con fecha y hora) y del programa de Galeries d’Art de Catalunya (https://www.galeriesdecatalunya.org/es/programa/). No se actualiza sola ni se consulta en directo; en la app de Android, la de ArtBarcelona se puede actualizar a mano (máximo una vez al día en ese móvil, ver más abajo). Se distingue inauguración de exposición; sin hora o fecha en la fuente, no se inventa.
- Sin servidor propio: no hay avisos con la app cerrada (salvo vía calendario), ni sincronización, ni reservas.
- OSRM es un servidor demo de uso moderado y sin garantías.
- El mapa de fondo son teselas de OpenStreetMap (tile.openstreetmap.org, https://operations.osmfoundation.org/policies/tiles/): uso ligero, con atribución, sin garantías. Con "Cerca de mí" solo se piden tras aceptar la casilla.

## Archivos

`index.html` contiene la app, los datos y la ilustración. `sw.js` solo gestiona la notificación. Sin compilación ni claves.

## App para Android (APK)

La app de Android es esta misma web empaquetada dentro de un WebView: la interfaz se abre desde la propia app, sin depender de Chrome. Paquete `org.camarillaycanape.app`; las actualizaciones se firman con la misma clave, así que se instalan encima sin perder los datos guardados en la app (probado en emulador). No está en Play Store: hay que permitir "instalar apps desconocidas". Descarga: [Releases, android-latest](https://github.com/camarillaYcanape/camarilla-y-canape/releases/tag/android-latest).

Qué añade el envoltorio: ubicación con el permiso del sistema, compartir con el selector de Android (el enlace apunta a la web publicada), guardar el .ics y ofrecerlo a las apps de calendario, y avisos del móvil 15 minutos antes de cada parada.

Límites reales:
- El mapa, los tiempos a pie y los enlaces externos necesitan conexión. La interfaz, la agenda (una copia fechada, guardada en el móvil) y el plan guardado abren sin conexión. No se descargan mapas por adelantado: la política de OpenStreetMap no lo permite.
- Los avisos los programa Android sin permiso de alarma exacta. Pueden retrasarse si el sistema ahorra batería, se pierden si reinicias el móvil, usan la hora local del móvil y necesitan el permiso de notificaciones. Se quitan con el mismo botón. No hay garantía de que suenen.
- Calendario: la app abre el .ics con una app de calendario y confirmas tú la importación. No se ha comprobado qué calendario lo importa bien.
- Pruebas hechas en un emulador de Android 13 y en un móvil real al instalar; no hay pruebas en más dispositivos.
- La agenda de ArtBarcelona se puede actualizar a mano desde la app (ver "Agenda actualizable en Android" más abajo). La de Galeries d'Art de Catalunya sigue siendo una copia manual.

Cómo se construye: `.github/workflows/android.yml` compila, firma y prueba en un emulador. La release estable `android-latest` solo se sustituye si el mensaje del commit incluye `[publicar]` y las pruebas pasan; si no, la build queda como prerelease de prueba.

## Agenda actualizable en Android

Estado: **implementado en la app de Android** (prerelease de prueba hasta pasar todas las pruebas; ver abajo). En el navegador la agenda sigue siendo la copia fechada incluida en la web.

Cómo funciona:

- **Registro local sustituible.** La app guarda en su almacenamiento privado un único registro de la agenda de ArtBarcelona (JSON con versión, fecha de descarga, número de entradas y huella SHA-256). Se consulta sin conexión. La copia incluida en la app (15/10/2026) es la base si no hay registro válido y posterior.
- **Se sustituye solo tras una descarga completa y validada.** Se descargan la lista de eventos (todas las páginas, y se comprueba que el total coincide), los nombres de sala y las fechas de cada evento. Si cualquier petición falla, el formato no es el esperado, hay entradas con fechas, horas, enlaces o textos no válidos, todas las entradas ya han terminado o llegan muchas menos entradas vigentes que en la copia anterior, **no se sustituye nada** y se mantiene la copia anterior con su fecha.
- **Sustitución segura.** Se escribe un temporal con fsync, se vuelve a validar, la copia actual pasa a "previa" y el temporal se renombra. Si el archivo actual se daña, se usa la previa; si ambos se dañan, la web vuelve a la copia incluida.
- **La fecha de los datos siempre se ve** en la pestaña Agenda, junto con el botón "Actualizar desde ArtBarcelona". Pasar un día no garantiza que haya novedades.
- **Límite por instalación, no global.** Como máximo una actualización correcta al día en cada móvil; tras un fallo se puede reintentar a los 30 minutos. Es un límite de esta app en este móvil: no hay límite común entre usuarios y no se simula con localStorage. La actualización solo ocurre cuando se pulsa el botón (sin tareas en segundo plano ni monitores).
- **Qué se pide y qué se guarda.** Peticiones GET públicas a `https://graf.cat/wp-json/wp/v2/` (eventos, salas y fechas de cada evento; unas 50 peticiones, una a una, unos 30 s). Solo se guardan datos mínimos de cada entrada (tipo, sala, título, enlace a la ficha, fechas y horas) con atribución a ArtBarcelona/GRAF y enlace a la ficha original. No se envía ubicación ni datos personales; graf.cat ve la IP del móvil y el User-Agent de la app. Se ignoran descripciones, imágenes y datos de contacto. Los tipos que no sean exposición, inauguración, visita guiada o charla se descartan en vez de adivinarlos.
- **Galeries d'Art de Catalunya** aplica un captcha a las consultas automáticas: sigue siendo copia manual fechada y no se intenta saltarlo.

Lo que sigue sin estar confirmado (incertidumbre, no una prohibición probada):

- **Condiciones de reutilización de GRAF (graf.cat).** Su web no publica unos términos de reutilización de los datos que hayamos podido encontrar (solo política de privacidad; contacto info@graf.cat) y su `robots.txt` solo bloquea `/wp-admin/`. La API REST de WordPress es pública y responde a CORS, pero eso no es una licencia. Por eso se piden pocos datos, solo al pulsar, a baja velocidad, con atribución y con enlace a la fuente. Si GRAF pide dejar de usarla, basta quitar la llamada.
- **Datos del lado de la fuente.** No se sabe si la API cambiará de formato; en ese caso la validación rechaza la descarga y se conserva la copia anterior.

Propuesta de una copia común diaria (idea anterior, **no implementada**): una sola copia compartida por todas las personas, con una renovación al día como máximo para todos. Requeriría un servicio o proceso que descargue y publique esa copia, y un límite en localStorage no puede hacerlo cumplir. Queda como opción futura si se quiere un límite común; la implementación actual limita cada instalación por separado.

Pruebas (en CI, emulador Android 13 con un servidor falso que imita la API; no se consulta graf.cat real en las pruebas de CI): validación y rechazo de datos malos, descarga parcial, copia pobre, sustitución completa, límite diario, persistencia tras cerrar la app y sin conexión, archivo corrupto con copia previa, ambos corruptos, regresión de la web en Chrome y de las demás funciones. Estas pruebas no sustituyen una prueba con la fuente real: la lectura real de graf.cat se comprobó aparte (60 entradas en una descarga de prueba).

Esta función no añade cuentas, pagos, datos personales ni monitores recurrentes.
