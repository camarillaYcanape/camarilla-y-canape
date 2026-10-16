# Preparación para Google Play (revisión técnica, 16/10/2026)

Esto es una revisión técnica de la app contra los requisitos oficiales que he podido leer, no una garantía de aprobación ni asesoramiento legal. Play Console no está creada ni conectada: no se ha enviado nada a la tienda.

## Requisitos revisados y estado

| Requisito | Fuente | Estado |
| --- | --- | --- |
| API de destino: desde el 31/08/2026, las apps nuevas y actualizaciones deben apuntar a Android 16 (API 36) | https://developer.android.com/google/play/requirements/target-sdk | Hecho: `targetSdk 36`, `compileSdk 36`, AGP 8.9.1, Gradle 8.11.1. Probado en emulador con Android 16 |
| Formato de publicación: las apps nuevas se publican como Android App Bundle | https://developer.android.com/guide/app-bundle | Hecho: la build genera `camarillaYcanape.aab` firmado con la misma clave |
| Firma: Play App Signing y clave de subida | https://developer.android.com/studio/publish/app-signing | Pendiente de decisión al crear la app (ver abajo) |
| Política de privacidad: URL activa, en la ficha y dentro de la app (la app pide ubicación) | https://support.google.com/googleplay/android-developer/answer/9859455 y https://support.google.com/googleplay/android-developer/answer/9888076 | Hecho: https://camarillaycanape.github.io/camarilla-y-canape/privacidad.html y enlace dentro de la app (Guía y límites). Contacto actual: Issues del repositorio |
| Ubicación: pedir el alcance mínimo, solo primer plano, sin uso publicitario | https://support.google.com/googleplay/android-developer/answer/9888170 | Cumple: solo primer plano, solo al pulsar "Cerca de mí" o "Comprobar con GPS", permiso del sistema. La política de ubicación aprobada para 27/01/2027 recomienda el "botón de ubicación" como alcance mínimo de ubicación precisa; hay que revisarla antes de esa fecha |
| Webviews: no se permite una app cuyo fin principal sea un webview de una web sin permiso del dueño | https://support.google.com/googleplay/android-developer/answer/9899034 | La web es propia (mismo repositorio). Además la app añade funciones nativas: avisos, compartir, guardar .ics y agenda local actualizable. El contenido ajeno (OSM, ArtBarcelona) son datos con atribución, no un webview de otra web |
| Funcionalidad: sin cierres ni fallos; con funcionalidad propia | https://support.google.com/googleplay/android-developer/answer/9898783 | Probado en emulador Android 13 y 16. Sin pruebas en móvil físico adicional |
| Sección Seguridad de los datos | https://support.google.com/googleplay/android-developer/answer/10787469 | Borrador abajo; la rellena el titular en Play Console |
| Cuentas personales nuevas: prueba cerrada con 12 inscritos durante 14 días seguidos antes de producción | https://support.google.com/googleplay/android-developer/answer/14151465 | Requisito de la cuenta, no del código. Cuota única de 25 USD |
| Tamaño de página de 16 KB | n/a | La app no incluye bibliotecas nativas (0 archivos .so) |
| Borde a borde y botón Atrás (cambios con target 35/36) | https://developer.android.com/google/play/requirements/target-sdk | Hecho: márgenes del sistema aplicados y `OnBackInvokedCallback` |

## Cambios técnicos hechos
- Destino API 36 con la misma firma, paquete `org.camarillaycanape.app` y actualización sobre lo instalado (versionCode crece con cada build).
- Pantalla de borde a borde: la web respeta barras de estado y navegación; la barra de estado mantiene el verde oliva.
- Botón Atrás con la API predictiva.
- Política de privacidad alojada y enlazada.
- Pipeline: compila el AAB, lo firma y prueba el APK de destino en un emulador Android 16 además del de Android 13.

## Borrador de "Seguridad de los datos" (a confirmar por el titular)
- Datos recogidos o compartidos: ubicación aproximada y precisa, solo cuando el usuario usa "Cerca de mí" y marca la casilla; las coordenadas se envían a OSRM (router.project-osrm.org, tercero) para calcular tiempos a pie. Opcional, no necesaria para la función principal.
- Sin cuentas, sin anuncios, sin analítica, sin compras, sin SDK de terceros de datos.
- Direcciones IP: las ven OpenStreetMap (mapa), OSRM y graf.cat al usar sus funciones; no se guardan en la app.
- Cifrado en tránsito: HTTPS en todas las peticiones. Borrado: "Restablecer todo" o borrar los datos de la app.
- La Play Console puede pedir una respuesta distinta según su interpretación: revisar antes de enviar.

## Lo que falta y no puedo decidir yo
1. **Cuenta de desarrollador** (25 USD, identidad real, verificación) y el contacto público de desarrollador. No se ha creado ni pagado.
2. **Prueba cerrada**: 12 personas inscritas 14 días seguidos si la cuenta es personal y nueva. No se ha pedido a nadie.
3. **Firma de la tienda**: la ayuda oficial de Play App Signing (https://support.google.com/googleplay/android-developer/answer/9842756) permite subir una clave de firma propia (herramienta PEPK) en lugar de que Google genere una. Con la clave actual importada, las instalaciones por APK seguirían actualizándose. Si Google genera una clave nueva, no. No se ha subido ninguna clave; la clave vive solo en secretos de Actions y la caja fuerte. Decisión del titular al crear la app, y subir la clave privada a Google es un paso que solo él debe autorizar.
4. **Ficha**: nombre, descripción corta y larga, icono de 512 px, imagen destacada de 1024x500 y capturas. Hay capturas de emulador en las evidencias de CI; la imagen destacada y los textos finales los decide el titular. No se ha cambiado el logo de la app.
5. **Cuestionario de clasificación de contenido** y declaración de público objetivo (no infantil): lo contesta el titular. Respuestas previstas: sin violencia, sin juego de azar, sin compras, sin contenido generado por usuarios; alcohol aparece como referencia a vino en el tono de la app, valorar si afecta.
6. **Fuentes de datos**: las condiciones de reutilización de GRAF (graf.cat) siguen sin confirmar (incertidumbre, no prohibición). OSM exige atribución visible (ya está). OSRM público de demostración: uso razonable y con consentimiento, no pensado para tráfico alto de una app en tienda; con mucho tráfico habría que sustituirlo.
7. **Contacto de privacidad**: la política de Play pide un punto de contacto o un mecanismo para enviar consultas (https://support.google.com/googleplay/android-developer/answer/9888076). Ahora el mecanismo son las Issues del repositorio. Si el titular prefiere un correo público, debe elegirlo él; no se ha puesto ninguno. La cuenta de desarrollador pedirá además sus propios datos de contacto.
