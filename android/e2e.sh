#!/usr/bin/env bash
# Prueba en un emulador Android real: actualizacion sobre version previa, funciones, modo sin red y humo de la APK firmada.
# Version final probada: la release estable se publica solo con [publicar] en el titulo del commit.
set -u
PKG=org.camarillaycanape.app
EV=${EVIDENCE:-evidence}; mkdir -p "$EV"
DBG=$1; REL=$2; DBGPREV=$3; RELPREV=$4
log(){ echo "[$(date +%H:%M:%S)] $*" | tee -a "$EV/e2e-log.txt"; }
node_e2e(){ MODE=$1 EVIDENCE=$EV MARK=${2:-} node android/e2e.mjs 2>&1 | tee -a "$EV/e2e-log.txt" > /tmp/last_e2e.txt; }
# El emulador (imagen google_apis) a veces mata la app porque muere un proceso de Google Play services del que depende el WebView
# (logcat: "Killing ... depends on provider com.google.android.gms/.fonts.provider.FontsProvider in dying proc"). Se registra y se reintenta una vez.
razon_muerte(){ adb logcat -d | grep -E "Killing [0-9]+:$PKG" | tail -2 | tee -a "$EV/e2e-log.txt"; }
start_app(){ for try in 1 2 3; do adb shell am force-stop $PKG; adb shell am start -W -n $PKG/.MainActivity >/dev/null; sleep 9
  PID=$(adb shell pidof $PKG | tr -d '\r'); log "pid=$PID"; [ -n "$PID" ] && break; log "la app no arranco (intento $try); causa en logcat:"; razon_muerte; done
  adb forward tcp:9222 localabstract:webview_devtools_remote_$PID; }
adb wait-for-device; adb shell 'while [ -z "$(getprop sys.boot_completed)" ]; do sleep 2; done'
adb shell settings put global window_animation_scale 0; adb shell settings put global transition_animation_scale 0
log "Dispositivo: $(adb shell getprop ro.product.model) Android $(adb shell getprop ro.build.version.release) API $(adb shell getprop ro.build.version.sdk)"
log "WebView: $(adb shell dumpsys webviewupdate | grep -m1 -i 'current webview package' )"
adb shell settings put secure location_mode 3 || true
for i in 1 2 3 4 5 6; do
  adb shell cmd alarm set-timezone Europe/Madrid 2>&1 | tee -a "$EV/e2e-log.txt" || true
  sleep 3
  [ "$(adb shell getprop persist.sys.timezone | tr -d '\r')" = "Europe/Madrid" ] && break
  log "zona horaria aun no aplicada (intento $i)"
done
if [ "$(adb shell getprop persist.sys.timezone | tr -d '\r')" != "Europe/Madrid" ]; then
  adb root >/dev/null 2>&1; sleep 3; adb shell setprop persist.sys.timezone Europe/Madrid; sleep 2
fi
log "Zona horaria del emulador: $(adb shell getprop persist.sys.timezone) | $(adb shell date)"
adb logcat -c; adb logcat -v time > "$EV/logcat-completo.txt" 2>&1 &
LOGPID=$!

log "== Actualizacion: instalo la version previa (versionCode 1) y guardo un dato en la app"
adb install -r "$DBGPREV" | tee -a "$EV/e2e-log.txt"
log "versionCode instalado: $(adb shell dumpsys package $PKG | grep -m1 versionCode)"
start_app; node_e2e set "$(date +%s)"; sleep 8
log "== Actualizacion: instalo encima la version nueva con adb install -r (mismo paquete)"
adb install -r "$DBG" | tee -a "$EV/e2e-log.txt"
log "versionCode instalado: $(adb shell dumpsys package $PKG | grep -m1 versionCode)"
start_app; node_e2e get

log "== Funciones (permisos de ubicacion concedidos antes de abrir: conceder con la app abierta la cierra)"
adb shell pm grant $PKG android.permission.ACCESS_FINE_LOCATION
adb shell pm grant $PKG android.permission.ACCESS_COARSE_LOCATION
adb emu geo fix 2.1649 41.3917 || true
start_app
adb exec-out screencap -p > "$EV/01-inicio.png"
node_e2e main
if grep -qE 'CONEXION DE DEPURACION CERRADA|fetch failed' /tmp/last_e2e.txt && ! grep -q 'boton Permitir' /tmp/last_e2e.txt; then
  log "REINTENTO: la app murio antes del dialogo de permiso. Causa registrada en logcat:"; razon_muerte
  start_app; node_e2e main
fi
sleep 3
PID=$(adb shell pidof $PKG | tr -d '\r'); if [ -z "$PID" ]; then log "la app se cerro tras conceder el permiso: la reabro"; adb shell am start -W -n $PKG/.MainActivity >/dev/null; sleep 9; PID=$(adb shell pidof $PKG | tr -d '\r'); fi
adb forward tcp:9222 localabstract:webview_devtools_remote_$PID
node_e2e rest
if grep -qE 'CONEXION DE DEPURACION CERRADA|fetch failed' /tmp/last_e2e.txt; then
  log "REINTENTO de la fase 2: la app murio durante ella. Causa registrada en logcat:"; razon_muerte
  start_app; node_e2e rest
fi
adb logcat -d -s AndroidRuntime:E | tail -15 | tee -a "$EV/e2e-log.txt"
adb shell run-as $PKG ls -la cache/ics 2>&1 | tee -a "$EV/e2e-log.txt"
adb exec-out screencap -p > "$EV/09-final-debug.png"

log "== Agenda: registro local actualizable (servidor falso con la forma de la API de graf.cat; no se consulta graf.cat real)"
(PORT=8765 node android/fake_graf.mjs > "$EV/fake-graf.log" 2>&1 &); sleep 2
adb reverse tcp:8765 tcp:8765 | tee -a "$EV/e2e-log.txt"
start_app; node_e2e agenda
if grep -q 'CONEXION DE DEPURACION CERRADA' /tmp/last_e2e.txt && ! grep -q 'agenda\[5\] sustitucion: tarjetas' /tmp/last_e2e.txt; then
  log "REINTENTO de la fase de agenda: la app murio. Causa registrada en logcat:"; razon_muerte
  adb shell run-as $PKG rm -rf files/agenda; start_app; node_e2e agenda
fi
adb shell run-as $PKG ls -la files/agenda 2>&1 | tee -a "$EV/e2e-log.txt"
EXC0=0
log "(el servidor falso registra cada peticion: ver fake-graf.log; aqui, que nunca llevaron cookies ni autorizacion)"

log "== Sin conexion (modo avion + wifi y datos apagados)"
adb shell cmd connectivity airplane-mode enable 2>&1 | tee -a "$EV/e2e-log.txt"
adb shell svc wifi disable; adb shell svc data disable; sleep 4
log "ping 8.8.8.8: $(adb shell ping -c1 -W2 8.8.8.8 2>&1 | tail -1)"
start_app; node_e2e offline
adb shell cmd connectivity airplane-mode disable; adb shell svc wifi enable; adb shell svc data enable
log "== Agenda sin red: tras cerrar y reabrir la app con modo avion, los datos guardados siguen ahi"
adb shell cmd connectivity airplane-mode enable; adb shell svc wifi disable; adb shell svc data disable; sleep 4
adb shell am force-stop $PKG; start_app; node_e2e agendaoffline
adb shell cmd connectivity airplane-mode disable; adb shell svc wifi enable; adb shell svc data enable; sleep 4
log "== Agenda: archivo actual corrupto (simula escritura interrumpida): debe usarse la copia previa"
adb shell am force-stop $PKG
adb shell "run-as $PKG sh -c 'printf truncado > files/agenda/agenda-actual.json; printf x > files/agenda/agenda-nueva.tmp'"
adb shell run-as $PKG ls -la files/agenda 2>&1 | tee -a "$EV/e2e-log.txt"
start_app; node_e2e agendafallback
log "== Agenda: ambos archivos corruptos: vuelve a la copia incluida sin romper la app"
adb shell am force-stop $PKG
adb shell "run-as $PKG sh -c 'printf basura > files/agenda/agenda-previa.json'"
adb shell run-as $PKG ls -la files/agenda 2>&1 | tee -a "$EV/e2e-log.txt"
start_app; node_e2e agendafallback2

adb shell input keyevent KEYCODE_BACK; sleep 1
adb uninstall $PKG >/dev/null
log "== Humo de la APK firmada (release): previa firmada y actualizacion encima"
adb logcat -c
adb install --no-incremental -r "$RELPREV" | tee -a "$EV/e2e-log.txt"
adb install --no-incremental -r "$REL" | tee -a "$EV/e2e-log.txt"
log "versionCode release instalado: $(adb shell dumpsys package $PKG | grep -m1 versionCode)"
adb shell am start -W -n $PKG/.MainActivity | tee -a "$EV/e2e-log.txt"; sleep 12
RP=$(adb shell pidof $PKG | tr -d '\r'); log "pid release=$RP"
if [ -z "$RP" ]; then
  log "PRIMER ARRANQUE DE LA RELEASE FALLO (sin proceso). Causa en logcat-completo.txt. Reintento una vez."
  adb logcat -d | grep -E "FATAL|ANR in|has died|am_crash|am_proc_died|Force finishing|AndroidRuntime" | tail -20 | tee -a "$EV/e2e-log.txt"
  adb shell am start -W -n $PKG/.MainActivity | tee -a "$EV/e2e-log.txt"; sleep 12
  RP=$(adb shell pidof $PKG | tr -d '\r'); log "pid release tras reintento=$RP"
fi
adb logcat -d -s AndroidRuntime:E | tail -30 | tee -a "$EV/e2e-log.txt"
adb exec-out screencap -p > "$EV/10-release-inicio.png"
adb shell dumpsys window | grep -m1 mCurrentFocus | tee -a "$EV/e2e-log.txt"
kill $LOGPID 2>/dev/null
pkill -f fake_graf.mjs 2>/dev/null
log "servidor falso: peticiones $(grep -c ' GET ' "$EV/fake-graf.log"); con cookie o autorizacion $(grep ' GET ' "$EV/fake-graf.log" | grep -vc 'cookie=- auth=-'); sin el User-Agent de la app $(grep ' GET ' "$EV/fake-graf.log" | grep -vc 'UA=camarillaYcanape-Android/1.0')"
V=PASS; why=""
log "agenda: excepciones de script en las fases de agenda $(sed -n '/== Agenda: registro local/,/== Humo de la APK firmada/p' "$EV/e2e-log.txt" | grep -c '\[e2e\] EXC')"
chk(){ grep -qE "$1" "$EV/e2e-log.txt" || { V=FAIL; why="$why | falta: $2"; }; }
chk 'marcador leido tras actualizar sobrevive' 'dato sobrevive a la actualizacion'
chk 'compartir -> ventana.*ChooserActivity' 'selector de compartir'
chk 'coincide titulo y hora de cada parada SI' 'paradas programadas coinciden con el plan'
chk 'zona horaria del movil Europe/Madrid\?.*Europe/Madrid' 'zona horaria Europe/Madrid'
chk 'dia normal\) SI' 'hora local Madrid, dia normal'
chk 'cambio de hora 25/10\) SI' 'hora local Madrid, dia del cambio de hora'

chk 'llego la cancelada\? \(0 = no\) 0' 'cancelacion efectiva'
chk 'notificacion de parada real en segundo plano [1-9]' 'aviso de parada real en segundo plano'
chk '\] agenda tarjetas (3[0-9]|4[0-9])$' 'agenda (depende del dia: oculta lo ya terminado)'
chk 'sin red: agenda tarjetas [0-9]+ esperadas [0-9]+ SI' 'agenda sin red (muestra lo que hay guardado)'
chk 'pid release(tras reintento)?=[0-9]+' 'release firmada abre'
chk 'agenda\[1\] inicio: registro local vacio true' 'agenda: arranque sin registro'
chk 'agenda\[1\] inicio: fecha mostrada = copia incluida 15/10/2026 true' 'agenda: fecha de la copia incluida'
chk 'agenda\[2\] fallo parcial: aviso recibido true' 'agenda: aviso de fallo'
chk 'agenda\[2\] fallo parcial: registro sigue vacio y fecha 15/10/2026 true' 'agenda: fallo parcial no sustituye'
chk 'agenda\[2\] fallo parcial: reintento bloqueado 30 min limit' 'agenda: reintento tras fallo limitado'
chk 'agenda\[3\] descarga ok: aviso true' 'agenda: descarga correcta'
chk 'agenda\[3\] descarga ok: titulos "vieja" y sin entidades HTML true' 'agenda: datos guardados limpios'
chk 'agenda\[3\] descarga ok: fecha mostrada es la de hoy true' 'agenda: fecha de los datos nuevos'
chk 'agenda\[3\] descarga ok: tarjetas = esperadas [0-9]+ esperadas [0-9]+ SI' 'agenda: tarjetas = datos'
chk 'agenda\[3\] descarga ok: aparece "Prueba" de la fuente true' 'agenda: se muestran los datos descargados'
chk 'agenda\[3\] descarga ok: boton desactivado por limite diario true' 'agenda: boton bloqueado tras actualizar'
chk 'agenda\[3\] descarga ok: segundo intento limit' 'agenda: limite diario por instalacion'
chk 'agenda\[4\] validacion rechaza copia pobre: aviso true' 'agenda: validacion rechaza datos pobres'
chk 'agenda\[4\] registro anterior intacto \(identico\) SI' 'agenda: fallo conserva el registro'
chk 'agenda\[5\] sustitucion: ahora son los datos "nueva" y ya no "vieja" SI' 'agenda: sustitucion completa'
chk 'agenda\[5\] sustitucion: tarjetas = esperadas [0-9]+ esperadas [0-9]+ SI' 'agenda: tarjetas tras sustituir'
chk 'agenda sin red: persiste tras cerrar la app y usa datos guardados true' 'agenda: persistencia sin red'
chk 'agenda sin red: tarjetas [0-9]+ esperadas [0-9]+ SI' 'agenda: tarjetas sin red'
chk 'agenda sin red: fallo claro true' 'agenda: fallo sin red claro'
chk 'agenda sin red: datos intactos tras el fallo true' 'agenda: datos intactos sin red'
chk 'agenda danada\[1\] actual corrupto: se usa la copia previa valida \(vieja\) true' 'agenda: archivo corrupto usa copia previa'
chk 'agenda danada\[1\] tarjetas [0-9]+ esperadas [0-9]+ SI' 'agenda: tarjetas con copia previa'
chk 'agenda danada\[2\] ambos corruptos: registro vacio, la web usa la copia incluida true' 'agenda: ambos corruptos vuelve a la copia incluida'
chk 'agenda danada\[2\] tarjetas [0-9]+ esperadas [0-9]+ SI' 'agenda: tarjetas con copia incluida'
chk 'agenda danada\[2\] la app sigue usable \(ruta\) true' 'agenda: app usable tras corrupcion'
chk 'servidor falso: peticiones [1-9][0-9]*; con cookie o autorizacion 0; sin el User-Agent de la app 0$' 'agenda: peticiones sin cookies ni autorizacion y con el User-Agent de la app'
chk 'agenda: excepciones de script en las fases de agenda 0$' 'agenda: sin excepciones de script'

echo "$V $why" > "$EV/veredicto.txt"; log "VEREDICTO: $V $why"
