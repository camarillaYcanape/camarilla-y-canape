package org.camarillaycanape.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.DownloadListener;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/** Envoltorio sin servidor: la interfaz es el index.html empaquetado, dentro de un WebView. */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/assets/index.html";
    private static final int REQ_LOC = 7;

    private WebView web;
    private String pendingOrigin;
    private GeolocationPermissions.Callback pendingCb;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(Color.parseColor("#26351D"));
        getWindow().setNavigationBarColor(Color.parseColor("#F7F4E6"));
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        web.setLayoutParams(new ViewGroup.LayoutParams(-1, -1));
        web.setBackgroundColor(Color.parseColor("#F7F4E6"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setGeolocationEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " camarillaYcanape-Android/1.0 (+https://github.com/camarillaYcanape/camarilla-y-canape)");
        web.addJavascriptInterface(new Bridge(), "AndroidApp");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return loader.shouldInterceptRequest(r.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return false;
                String sc = u.getScheme();
                if ("https".equals(sc) || "http".equals(sc) || "mailto".equals(sc) || "geo".equals(sc)) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { /* sin app que lo abra */ }
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                if (!origin.contains(HOST)) { cb.invoke(origin, false, false); return; }
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    cb.invoke(origin, true, false);
                } else {
                    pendingOrigin = origin;
                    pendingCb = cb;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOC);
                }
            }
        });

        web.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String ua, String cd, String mime, long len) {
                if (url.startsWith("blob:")) {
                    final String name = URLUtil.guessFileName(url, cd, mime);
                    final String js = "(async()=>{try{const r=await fetch('" + url + "');const t=await r.text();AndroidApp.saveText(t,'"
                            + name.replace("'", "") + "');}catch(e){AndroidApp.fail(String(e));}})()";
                    web.evaluateJavascript(js, null);
                }
            }
        });

        setContentView(web);
        if (b == null) web.loadUrl(START); else web.restoreState(b);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (code == REQ_LOC && pendingCb != null) {
            boolean ok = res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
            pendingCb.invoke(pendingOrigin, ok, false);
            pendingCb = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    /** Puente mínimo: solo guardar y abrir el .ics que genera la propia app. */
    private class Bridge {
        @JavascriptInterface
        public void saveText(final String text, final String rawName) {
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        String name = rawName.replaceAll("[^A-Za-z0-9._-]", "_");
                        if (!name.endsWith(".ics")) name = name + ".ics";
                        File dir = new File(getCacheDir(), "ics");
                        dir.mkdirs();
                        File f = new File(dir, name);
                        FileOutputStream o = new FileOutputStream(f);
                        o.write(text.getBytes(StandardCharsets.UTF_8));
                        o.close();
                        Uri uri = FileProvider.getUriForFile(MainActivity.this, "org.camarillaycanape.app.files", f);
                        Intent i = new Intent(Intent.ACTION_VIEW);
                        i.setDataAndType(uri, "text/calendar");
                        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(Intent.createChooser(i, "Abrir con"));
                    } catch (Exception e) {
                        Toast.makeText(MainActivity.this, "No se pudo abrir el archivo del calendario.", Toast.LENGTH_LONG).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void fail(final String why) {
            runOnUiThread(new Runnable() {
                public void run() {
                    Toast.makeText(MainActivity.this, "No se pudo guardar el archivo.", Toast.LENGTH_LONG).show();
                }
            });
        }
    }
}
