#!/usr/bin/env bash
# Prueba en un emulador Android real: actualizacion sobre version previa, funciones, modo sin red y humo de la APK firmada.
set -u
PKG=org.camarillaycanape.app
EV=${EVIDENCE:-evidence}; mkdir -p "$EV"
DBG=$1; REL=$2; DBGPREV=$3; RELPREV=$4
log(){ echo "[$(date +%H:%M:%S)] $*" | tee -a "$EV/e2e-log.txt"; }
node_e2e(){ MODE=$1 EVIDENCE=$EV MARK=${2:-} node android/e2e.mjs 2>&1 | tee -a "$EV/e2e-log.txt"; }
start_app(){ adb shell am force-stop $PKG; adb shell am start -W -n $PKG/.MainActivity >/dev/null; sleep 9
  PID=$(adb shell pidof $PKG | tr -d '\r'); log "pid=$PID"; adb forward tcp:9222 localabstract:webview_devtools_remote_$PID; }
adb wait-for-device; adb shell 'while [ -z "$(getprop sys.boot_completed)" ]; do sleep 2; done'
adb shell settings put global window_animation_scale 0; adb shell settings put global transition_animation_scale 0
log "Dispositivo: $(adb shell getprop ro.product.model) Android $(adb shell getprop ro.build.version.release) API $(adb shell getprop ro.build.version.sdk)"
log "WebView: $(adb shell dumpsys webviewupdate | grep -m1 -i 'current webview package' )"
adb shell settings put secure location_mode 3 || true
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
sleep 3
PID=$(adb shell pidof $PKG | tr -d '\r'); if [ -z "$PID" ]; then log "la app se cerro tras conceder el permiso: la reabro"; adb shell am start -W -n $PKG/.MainActivity >/dev/null; sleep 9; PID=$(adb shell pidof $PKG | tr -d '\r'); fi
adb forward tcp:9222 localabstract:webview_devtools_remote_$PID
node_e2e rest
adb logcat -d -s AndroidRuntime:E | tail -15 | tee -a "$EV/e2e-log.txt"
adb shell run-as $PKG ls -la cache/ics 2>&1 | tee -a "$EV/e2e-log.txt"
adb exec-out screencap -p > "$EV/09-final-debug.png"

log "== Sin conexion (modo avion + wifi y datos apagados)"
adb shell cmd connectivity airplane-mode enable 2>&1 | tee -a "$EV/e2e-log.txt"
adb shell svc wifi disable; adb shell svc data disable; sleep 4
log "ping 8.8.8.8: $(adb shell ping -c1 -W2 8.8.8.8 2>&1 | tail -1)"
start_app; node_e2e offline
adb shell cmd connectivity airplane-mode disable; adb shell svc wifi enable; adb shell svc data enable

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
V=PASS; why=""
chk(){ grep -qE "$1" "$EV/e2e-log.txt" || { V=FAIL; why="$why | falta: $2"; }; }
chk 'marcador leido tras actualizar sobrevive' 'dato sobrevive a la actualizacion'
chk 'compartir -> ventana.*ChooserActivity' 'selector de compartir'
chk 'avisos: notificacion publicada.*Prueba de aviso' 'aviso recibido'
chk 'agenda tarjetas 41' 'agenda'
chk 'sin red: agenda tarjetas 41' 'agenda sin red'
chk 'pid release(tras reintento)?=[0-9]+' 'release firmada abre'
echo "$V $why" > "$EV/veredicto.txt"; log "VEREDICTO: $V $why"
