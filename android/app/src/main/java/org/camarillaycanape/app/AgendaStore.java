package org.camarillaycanape.app;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;

/**
 * Registro local de la agenda de ArtBarcelona (datos publicos de graf.cat).
 * - Se guarda en almacenamiento privado de la app y se consulta sin conexion.
 * - Solo se sustituye tras una descarga COMPLETA y VALIDADA; ante cualquier error se conserva lo anterior.
 * - Limite por instalacion (no global): 1 intento correcto al dia; tras un fallo, se puede reintentar a los 30 min.
 * - No envia datos personales ni ubicacion: solo peticiones GET publicas con el User-Agent de la app.
 */
final class AgendaStore {
    static final int SCHEMA = 1;
    static final long OK_INTERVAL_MS = 24L * 3600 * 1000;
    static final long FAIL_INTERVAL_MS = 30L * 60 * 1000;
    static final String DEFAULT_BASE = "https://graf.cat/";
    static final String UA = "camarillaYcanape-Android/1.0 (+https://github.com/camarillaYcanape/camarilla-y-canape)";
    private static final int MAX_BODY = 4 * 1024 * 1024;
    private static final long DEADLINE_MS = 120_000;

    private final File dir;
    private final String base;
    private final File cur, prev, tmp, meta;

    AgendaStore(File filesDir, String base) {
        this.dir = new File(filesDir, "agenda");
        this.dir.mkdirs();
        this.base = base.endsWith("/") ? base : base + "/";
        cur = new File(dir, "agenda-actual.json");
        prev = new File(dir, "agenda-previa.json");
        tmp = new File(dir, "agenda-nueva.tmp");
        meta = new File(dir, "agenda-estado.json");
    }

    static final class Result {
        final boolean ok; final String code; final String msg;
        Result(boolean ok, String code, String msg) { this.ok = ok; this.code = code; this.msg = msg; }
    }

    /** Solo pruebas (la llama un metodo del puente que la release ignora): olvida el limite de intentos. */
    synchronized void debugClearMeta() { meta.delete(); }

    // ---------- lectura ----------

    /** Registro valido guardado (actual; si esta danado, el anterior) o cadena vacia. */
    synchronized String load() {
        String s = readValid(cur);
        if (s == null) s = readValid(prev);
        return s == null ? "" : s;
    }

    private String readValid(File f) {
        try {
            if (!f.isFile() || f.length() > MAX_BODY) return null;
            String s = new String(readAll(new FileInputStream(f), MAX_BODY), StandardCharsets.UTF_8);
            JSONObject r = new JSONObject(s);
            if (r.getInt("v") != SCHEMA) return null;
            JSONArray items = r.getJSONArray("items");
            if (!sha(items.toString()).equals(r.getString("sha256"))) return null;
            if (items.length() != r.getInt("n")) return null;
            validateItems(items, 0, r.getLong("fetchedMs"));
            return s;
        } catch (Exception e) {
            return null;
        }
    }

    synchronized JSONObject status(long now) {
        JSONObject o = new JSONObject();
        try {
            String s = load();
            o.put("hasData", !s.isEmpty());
            if (!s.isEmpty()) {
                JSONObject r = new JSONObject(s);
                o.put("fetchedAt", r.getString("fetchedAt")).put("fetchedMs", r.getLong("fetchedMs")).put("count", r.getInt("n"));
            }
            JSONObject m = readMeta();
            long next = nextAllowed(m, now);
            o.put("allowed", now >= next).put("nextAllowedMs", next);
            if (m.has("lastError")) o.put("lastError", m.getString("lastError")).put("lastErrorMs", m.optLong("lastAttemptMs"));
        } catch (Exception e) { /* estado parcial */ }
        return o;
    }

    private JSONObject readMeta() {
        try { return new JSONObject(new String(readAll(new FileInputStream(meta), 65536), StandardCharsets.UTF_8)); }
        catch (Exception e) { return new JSONObject(); }
    }

    private long nextAllowed(JSONObject m, long now) {
        long last = m.optLong("lastAttemptMs", 0);
        if (last == 0) return 0;
        if (now < last - 60_000) return 0; // reloj atrasado: no se bloquea para siempre
        return last + (m.optBoolean("lastOk", false) ? OK_INTERVAL_MS : FAIL_INTERVAL_MS);
    }

    // ---------- actualizacion ----------

    Result refresh(long now) {
        JSONObject prevCount;
        synchronized (this) {
            JSONObject m = readMeta();
            long next = nextAllowed(m, now);
            if (now < next) return new Result(false, "limite", "Limite de esta instalacion: una actualizacion al dia.");
            try {
                writeMeta(new JSONObject().put("lastAttemptMs", now).put("lastOk", false).put("lastError", "Intento sin terminar"));
            } catch (Exception e) { return new Result(false, "interno", "No se pudo guardar el estado."); }
        }
        try {
            JSONArray items = download(now);
            int prevActive = 0;
            String old = load();
            String today = day(now);
            if (!old.isEmpty()) {
                JSONArray oi = new JSONObject(old).getJSONArray("items");
                for (int i = 0; i < oi.length(); i++) if (oi.getJSONObject(i).getString("e").compareTo(today) >= 0) prevActive++;
            }
            validateItems(items, prevActive, now);
            JSONObject rec = new JSONObject();
            rec.put("v", SCHEMA).put("source", "ArtBarcelona (graf.cat)").put("fetchedMs", now).put("fetchedAt", iso(now))
               .put("n", items.length()).put("sha256", sha(items.toString())).put("items", items);
            commit(rec.toString());
            synchronized (this) { writeMeta(new JSONObject().put("lastAttemptMs", now).put("lastOk", true)); }
            return new Result(true, "ok", "Actualizado: " + items.length() + " entradas.");
        } catch (Fail f) {
            return fail(now, f.getMessage());
        } catch (Exception e) {
            return fail(now, "Error inesperado en la descarga.");
        }
    }

    private synchronized Result fail(long now, String msg) {
        try { writeMeta(new JSONObject().put("lastAttemptMs", now).put("lastOk", false).put("lastError", msg)); } catch (Exception ignore) { }
        tmp.delete();
        return new Result(false, "error", msg);
    }

    private static final class Fail extends Exception { Fail(String m) { super(m); } }

    private synchronized void writeMeta(JSONObject m) throws Exception { atomicWrite(meta, m.toString().getBytes(StandardCharsets.UTF_8)); }

    /** Escribe en temporal con fsync, comprueba y renombra; la copia anterior se conserva como "previa". */
    private synchronized void commit(String json) throws Exception {
        byte[] b = json.getBytes(StandardCharsets.UTF_8);
        FileOutputStream o = new FileOutputStream(tmp);
        try { o.write(b); o.flush(); o.getFD().sync(); } finally { o.close(); }
        if (readValid(tmp) == null) { tmp.delete(); throw new Fail("La copia descargada no paso la comprobacion final."); }
        if (cur.isFile() && readValid(cur) != null) {
            File p2 = new File(dir, "agenda-previa.tmp");
            copySync(cur, p2);
            if (!p2.renameTo(prev)) { p2.delete(); throw new Fail("No se pudo guardar la copia anterior."); }
        }
        if (!tmp.renameTo(cur)) { tmp.delete(); throw new Fail("No se pudo sustituir la copia."); }
    }

    private void atomicWrite(File dst, byte[] b) throws IOException {
        File t = new File(dst.getPath() + ".tmp");
        FileOutputStream o = new FileOutputStream(t);
        try { o.write(b); o.flush(); o.getFD().sync(); } finally { o.close(); }
        if (!t.renameTo(dst)) throw new IOException("rename");
    }

    private void copySync(File a, File b) throws IOException {
        byte[] x = readAll(new FileInputStream(a), MAX_BODY);
        FileOutputStream o = new FileOutputStream(b);
        try { o.write(x); o.flush(); o.getFD().sync(); } finally { o.close(); }
    }

    // ---------- descarga ----------

    private JSONArray download(long t0) throws Exception {
        long deadline = System.currentTimeMillis() + DEADLINE_MS;
        // Lista de eventos (todas las paginas)
        List<JSONObject> events = new ArrayList<JSONObject>();
        int pages = 1, total = -1;
        for (int p = 1; p <= pages; p++) {
            Http h = get("wp-json/wp/v2/events?per_page=100&page=" + p + "&_fields=id,link,title,class_list", deadline);
            JSONArray a = parseArray(h.body);
            pages = Math.min(h.totalPages > 0 ? h.totalPages : 1, 5);
            if (h.total >= 0) total = h.total;
            for (int i = 0; i < a.length(); i++) events.add(a.getJSONObject(i));
        }
        if (total >= 0 && events.size() != total) throw new Fail("La lista de ArtBarcelona llego incompleta (" + events.size() + " de " + total + ").");
        // Nombres de salas
        Map<String, String> venues = new HashMap<String, String>();
        int vp = 1, vtot = -1;
        for (int p = 1; p <= vp; p++) {
            Http h = get("wp-json/wp/v2/event-venues?per_page=100&page=" + p + "&_fields=name,slug", deadline);
            JSONArray a = parseArray(h.body);
            vp = Math.min(h.totalPages > 0 ? h.totalPages : 1, 20);
            if (h.total >= 0) vtot = h.total;
            for (int i = 0; i < a.length(); i++) venues.put(a.getJSONObject(i).getString("slug"), decode(a.getJSONObject(i).getString("name")));
        }
        if (vtot >= 0 && venues.size() < Math.min(vtot, 1)) throw new Fail("Faltan los nombres de las salas.");
        JSONArray out = new JSONArray();
        int skipped = 0, considered = 0;
        Set<String> seen = new HashSet<String>();
        for (JSONObject ev : events) {
            String type = null, venue = null;
            JSONArray cl = ev.getJSONArray("class_list");
            for (int i = 0; i < cl.length(); i++) {
                String c = cl.getString(i);
                if (c.startsWith("event-category-")) {
                    String s = c.substring(15);
                    if (s.equals("exposicio")) type = "e"; else if (s.equals("inauguracio")) type = "i";
                    else if (s.equals("visita-guiada")) type = "v"; else if (s.equals("xerrada")) type = "x";
                } else if (c.startsWith("event-venue-")) venue = c.substring(12);
            }
            if (type == null) continue; // otras categorias: no se inventa su tipo
            considered++;
            String name = venue == null ? null : venues.get(venue);
            String link = ev.optString("link", "");
            String title = decode(ev.getJSONObject("title").optString("rendered", ""));
            if (name == null || title.isEmpty() || !link.startsWith("https://graf.cat/events/")) { skipped++; continue; }
            Http h = get("wp-json/wp/v2/events/" + ev.getInt("id") + "/occurrences", deadline);
            JSONArray oc = parseArray(h.body);
            if (oc.length() == 0) { skipped++; continue; }
            if (type.equals("e")) {
                String s = null, e = null;
                for (int i = 0; i < oc.length(); i++) {
                    String a = oc.getJSONObject(i).getString("start").substring(0, 10), b = oc.getJSONObject(i).getString("end").substring(0, 10);
                    if (s == null || a.compareTo(s) < 0) s = a;
                    if (e == null || b.compareTo(e) > 0) e = b;
                }
                add(out, seen, item(type, name, title, link, s, e, null, null));
            } else {
                for (int i = 0; i < oc.length(); i++) {
                    String st = oc.getJSONObject(i).getString("start"), en = oc.getJSONObject(i).getString("end");
                    add(out, seen, item(type, name, title, link, st.substring(0, 10), en.substring(0, 10), st.substring(11, 16), en.substring(11, 16)));
                }
            }
            Thread.sleep(120); // sin prisas: una peticion cada vez
        }
        if (considered > 0 && skipped * 4 > considered) throw new Fail("Demasiadas entradas incompletas en la fuente (" + skipped + " de " + considered + ").");
        List<JSONObject> l = new ArrayList<JSONObject>();
        for (int i = 0; i < out.length(); i++) l.add(out.getJSONObject(i));
        Collections.sort(l, new Comparator<JSONObject>() {
            public int compare(JSONObject a, JSONObject b) {
                return (a.optString("s") + a.optString("h1", "99") + a.optString("u")).compareTo(b.optString("s") + b.optString("h1", "99") + b.optString("u"));
            }
        });
        JSONArray sorted = new JSONArray();
        for (JSONObject o : l) sorted.put(o);
        return sorted;
    }

    private static JSONObject item(String y, String g, String t, String u, String s, String e, String h1, String h2) throws Exception {
        JSONObject o = new JSONObject();
        o.put("y", y).put("g", g).put("t", t).put("u", u).put("f", "A").put("s", s).put("e", e);
        if (h1 != null) o.put("h1", h1).put("h2", h2);
        return o;
    }

    private static void add(JSONArray out, Set<String> seen, JSONObject o) {
        String k = o.optString("y") + "|" + o.optString("u") + "|" + o.optString("s") + "|" + o.optString("h1");
        if (seen.add(k)) out.put(o);
    }

    private static JSONArray parseArray(String s) throws Fail {
        try { return new JSONArray(s); } catch (Exception e) { throw new Fail("La respuesta de la fuente no tiene el formato esperado."); }
    }

    private static final class Http { String body; int total = -1, totalPages = -1; }

    private Http get(String path, long deadline) throws Exception {
        if (System.currentTimeMillis() > deadline) throw new Fail("La descarga tardo demasiado.");
        HttpURLConnection c = (HttpURLConnection) new URL(base + path).openConnection();
        try {
            c.setConnectTimeout(15000); c.setReadTimeout(20000);
            c.setRequestProperty("User-Agent", UA);
            c.setRequestProperty("Accept", "application/json");
            c.setInstanceFollowRedirects(false);
            int code;
            try { code = c.getResponseCode(); } catch (IOException e) { throw new Fail("No se pudo conectar con graf.cat (sin conexion o fuera de servicio)."); }
            if (code != 200) throw new Fail("graf.cat respondio con el codigo " + code + ".");
            Http h = new Http();
            h.total = c.getHeaderFieldInt("X-WP-Total", -1);
            h.totalPages = c.getHeaderFieldInt("X-WP-TotalPages", -1);
            try { h.body = new String(readAll(c.getInputStream(), MAX_BODY), StandardCharsets.UTF_8); }
            catch (IOException e) { throw new Fail("La descarga se corto o es demasiado grande."); }
            return h;
        } finally { c.disconnect(); }
    }

    // ---------- validacion ----------

    /** Lanza si el conjunto no es una agenda aceptable. prevActive = entradas vigentes de la copia anterior. */
    static void validateItems(JSONArray items, int prevActive, long now) throws Exception {
        int n = items.length();
        if (n < 1 || n > 500) throw new Fail("Cantidad de entradas fuera de lo razonable (" + n + ").");
        String today = day(now);
        int active = 0;
        for (int i = 0; i < n; i++) {
            JSONObject o = items.getJSONObject(i);
            String y = o.getString("y");
            if (!(y.equals("e") || y.equals("i") || y.equals("v") || y.equals("x"))) throw new Fail("Tipo de entrada desconocido.");
            String g = o.getString("g"), t = o.getString("t"), u = o.getString("u");
            if (g.isEmpty() || g.length() > 200 || t.isEmpty() || t.length() > 400) throw new Fail("Texto vacio o demasiado largo.");
            if (g.matches("(?s).*&(#?[A-Za-z0-9]+);.*") || t.matches("(?s).*&(#?[A-Za-z0-9]+);.*") || g.contains("<") || t.contains("<")) throw new Fail("Texto con codigos HTML sin decodificar.");
            if (!u.startsWith("https://graf.cat/events/") || u.length() > 300) throw new Fail("Enlace no valido.");
            String s = o.getString("s"), e = o.getString("e");
            if (!isDate(s) || !isDate(e) || s.compareTo(e) > 0) throw new Fail("Fechas no validas.");
            if (o.has("h1") && (!isHour(o.getString("h1")) || !isHour(o.getString("h2")))) throw new Fail("Horas no validas.");
            if (e.compareTo(today) >= 0) active++;
        }
        if (active == 0) throw new Fail("Todas las entradas ya han terminado.");
        if (prevActive >= 10 && active * 10 < prevActive * 3) throw new Fail("La nueva copia trae muchas menos entradas vigentes (" + active + " frente a " + prevActive + ").");
    }

    private static boolean isDate(String s) {
        if (s.length() != 10 || s.charAt(4) != '-' || s.charAt(7) != '-') return false;
        try {
            int y = Integer.parseInt(s.substring(0, 4)), m = Integer.parseInt(s.substring(5, 7)), d = Integer.parseInt(s.substring(8, 10));
            return y >= 2020 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
        } catch (NumberFormatException ex) { return false; }
    }

    private static boolean isHour(String s) {
        if (s.length() != 5 || s.charAt(2) != ':') return false;
        try { int h = Integer.parseInt(s.substring(0, 2)), m = Integer.parseInt(s.substring(3, 5)); return h < 24 && m < 60; }
        catch (NumberFormatException ex) { return false; }
    }

    // ---------- utilidades ----------

    static String day(long ms) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("Europe/Madrid"));
        return f.format(new Date(ms));
    }

    static String iso(long ms) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("Europe/Madrid"));
        return f.format(new Date(ms));
    }

    private static String sha(String s) throws Exception {
        byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
        StringBuilder b = new StringBuilder();
        for (byte x : d) b.append(String.format("%02x", x));
        return b.toString();
    }

    private static byte[] readAll(InputStream in, int max) throws IOException {
        try {
            ByteArrayOutputStream o = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int r;
            while ((r = in.read(buf)) > 0) {
                o.write(buf, 0, r);
                if (o.size() > max) throw new IOException("demasiado grande");
            }
            return o.toByteArray();
        } finally { in.close(); }
    }

    /** Quita etiquetas y decodifica las entidades HTML habituales de WordPress. */
    static String decode(String s) {
        s = s.replaceAll("<[^>]*>", "");
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            int j = c == '&' ? s.indexOf(';', i) : -1;
            if (j > i && j - i <= 10) {
                String e = s.substring(i + 1, j);
                String r = null;
                try {
                    if (e.startsWith("#x") || e.startsWith("#X")) r = new String(Character.toChars(Integer.parseInt(e.substring(2), 16)));
                    else if (e.startsWith("#")) r = new String(Character.toChars(Integer.parseInt(e.substring(1))));
                } catch (Exception ex) { r = null; }
                if (r == null) {
                    if (e.equals("amp")) r = "&"; else if (e.equals("lt")) r = "<"; else if (e.equals("gt")) r = ">";
                    else if (e.matches("[A-Za-z](acute|grave|uml|circ|tilde|cedil)")) {
                        String m = e.endsWith("acute") ? "\u0301" : e.endsWith("grave") ? "\u0300" : e.endsWith("uml") ? "\u0308" : e.endsWith("circ") ? "\u0302" : e.endsWith("tilde") ? "\u0303" : "\u0327";
                        r = java.text.Normalizer.normalize(e.charAt(0) + m, java.text.Normalizer.Form.NFC);
                    }
                    else if (e.equals("quot")) r = "\""; else if (e.equals("apos")) r = "'"; else if (e.equals("nbsp")) r = " ";
                    else if (e.equals("hellip")) r = "\u2026"; else if (e.equals("ndash")) r = "\u2013"; else if (e.equals("mdash")) r = "\u2014";
                }
                if (r != null) { b.append(r); i = j; continue; }
            }
            b.append(c);
        }
        return b.toString().replaceAll("\\s+", " ").trim();
    }
}
