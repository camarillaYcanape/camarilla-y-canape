#!/usr/bin/env bash
# Emulador con Android 16 (API 36, el nivel de destino): bordes de pantalla, boton Atras y arranque basico.
set -u
PKG=org.camarillaycanape.app
EV=${EVIDENCE:-evidence}; mkdir -p "$EV"
DBG=$1
log(){ echo "[$(date +%H:%M:%S)] $*" | tee -a "$EV/e2e36-log.txt"; }
timeout 120 adb wait-for-device; timeout 120 adb shell 'while [ -z "$(getprop sys.boot_completed)" ]; do sleep 2; done'
adb shell settings put global window_animation_scale 0; adb shell settings put global transition_animation_scale 0
log "Dispositivo: Android $(adb shell getprop ro.build.version.release) API $(adb shell getprop ro.build.version.sdk)"
adb install -r "$DBG" | tee -a "$EV/e2e36-log.txt"
log "targetSdk instalado: $(adb shell dumpsys package $PKG | grep -m1 targetSdk)"
adb shell pm grant $PKG android.permission.ACCESS_FINE_LOCATION
start_app(){ for try in 1 2 3; do adb shell am force-stop $PKG; timeout 60 adb shell am start -W -n $PKG/.MainActivity >/dev/null; sleep 9
  PID=$(adb shell pidof $PKG | tr -d '\r'); log "pid=$PID"; [ -n "$PID" ] && break; log "la app no arranco (intento $try)"; adb logcat -d | grep -E "Killing [0-9]+:$PKG" | tail -2 | tee -a "$EV/e2e36-log.txt"; done
  adb forward tcp:9222 localabstract:webview_devtools_remote_$PID; }
start_app
adb exec-out screencap -p > "$EV/20-api36-inicio.png"
node_e2e(){ MODE=$1 EVIDENCE=$EV timeout 240 node android/e2e.mjs 2>&1 | tee -a "$EV/e2e36-log.txt" > /tmp/last36.txt; }
node_e2e api36
adb exec-out screencap -p > "$EV/21-api36-agenda.png"
log "foco antes de Atras: $(adb shell dumpsys window | grep -m1 mCurrentFocus)"
adb shell input keyevent KEYCODE_BACK; sleep 2
node_e2e api36back
adb shell input keyevent KEYCODE_BACK; sleep 3
log "tras Atras en la pagina inicial, proceso vivo: $(adb shell pidof $PKG | tr -d '\r' | wc -c) (0 = cerrada); foco: $(adb shell dumpsys window | grep -m1 mCurrentFocus)"
adb logcat -d -s AndroidRuntime:E | tail -10 | tee -a "$EV/e2e36-log.txt"
python3 - <<'PY' 2>&1 | tee -a "$EV/e2e36-log.txt"
from PIL import Image
im=Image.open(__import__('os').environ.get('EVIDENCE','evidence')+'/20-api36-inicio.png').convert('RGB')
w,h=im.size
top=im.getpixel((w//2,3)); 
def near(c,t,d=12): return all(abs(a-b)<=d for a,b in zip(c,t))
print('pixel superior (barra de estado) oliva:', near(top,(0x26,0x35,0x1D)), top)
# primera fila bajo la barra: debe ser contenido, no oliva infinito
rows=[im.getpixel((w//2,y)) for y in range(0,300)]
oliva=sum(1 for c in rows[:120] if near(c,(0x26,0x35,0x1D)))
print('filas oliva en los primeros 120 px (barra, no tapa el contenido):', oliva, '(esperado: entre 20 y 130)')
PY
V=PASS; why=""
chk(){ grep -qE "$1" "$EV/e2e36-log.txt" || { V=FAIL; why="$why | falta: $2"; }; }
chk 'API 36' 'emulador Android 16'
chk 'targetSdk=36' 'targetSdk 36'
chk 'api36 cabecera visible bajo la barra de estado true' 'contenido no tapado por barra de estado'
chk 'api36 agenda tarjetas [0-9]+ esperadas [0-9]+ SI' 'agenda carga'
chk 'api36 Atras vuelve a la ruta anterior true' 'Atras navega en la web'
chk 'oliva:.*True' 'barra de estado pintada'
chk 'proceso vivo: 0 ' 'Atras en la raiz cierra la app'
echo "$V $why" > "$EV/veredicto-api36.txt"; log "VEREDICTO API36: $V $why"
