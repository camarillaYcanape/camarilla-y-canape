#!/usr/bin/env bash
# Prueba en un emulador Android real: APK de depuracion (mismo codigo) + humo de la APK firmada.
set -u
PKG=org.camarillaycanape.app
EV=${EVIDENCE:-evidence}; mkdir -p "$EV"
DBG=$1; REL=$2
log(){ echo "[$(date +%H:%M:%S)] $*" | tee -a "$EV/e2e-log.txt"; }
adb wait-for-device; adb shell 'while [ -z "$(getprop sys.boot_completed)" ]; do sleep 2; done'
adb shell settings put global window_animation_scale 0; adb shell settings put global transition_animation_scale 0
log "Dispositivo: $(adb shell getprop ro.product.model) Android $(adb shell getprop ro.build.version.release) API $(adb shell getprop ro.build.version.sdk)"
log "WebView: $(adb shell dumpsys webviewupdate | grep -m1 -i 'current webview package' )"
adb install -r "$DBG" | tee -a "$EV/e2e-log.txt"
adb shell pm grant $PKG android.permission.ACCESS_FINE_LOCATION
adb shell pm grant $PKG android.permission.ACCESS_COARSE_LOCATION
adb shell settings put secure location_mode 3 || true
adb emu geo fix 2.1649 41.3917 || true
adb shell am start -n $PKG/.MainActivity; sleep 10
PID=$(adb shell pidof $PKG | tr -d '\r'); log "pid=$PID"
adb forward tcp:9222 localabstract:webview_devtools_remote_$PID
adb exec-out screencap -p > "$EV/01-inicio.png"
EVIDENCE=$EV node android/e2e.mjs 2>&1 | tee -a "$EV/e2e-log.txt"
adb shell run-as $PKG ls -la cache/ics 2>&1 | tee -a "$EV/e2e-log.txt"
adb shell dumpsys window | grep -m2 -E 'mCurrentFocus|mFocusedApp' | tee -a "$EV/e2e-log.txt"
adb exec-out screencap -p > "$EV/09-final-debug.png"
adb shell input keyevent KEYCODE_BACK; sleep 1
adb uninstall $PKG >/dev/null
log "Humo de la APK firmada (release)"
adb logcat -c
adb install --no-incremental -r "$REL" | tee -a "$EV/e2e-log.txt"
adb shell am start -W -n $PKG/.MainActivity | tee -a "$EV/e2e-log.txt"; sleep 12
log "pid release=$(adb shell pidof $PKG | tr -d '\r')"
adb logcat -d -s AndroidRuntime:E chromium:E | tail -30 | tee -a "$EV/e2e-log.txt"
adb exec-out screencap -p > "$EV/10-release-inicio.png"
adb shell dumpsys window | grep -m1 mCurrentFocus | tee -a "$EV/e2e-log.txt"
