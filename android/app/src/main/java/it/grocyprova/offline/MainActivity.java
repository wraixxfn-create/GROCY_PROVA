package it.grocyprova.offline;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;

/**
 * Shell locale sul telefono: archiviazione privata SharedPreferences,
 * scatto delle 2 foto con miniatura a colori + scala di grigi per OCR,
 * e interrogazione HTTPS opzionale diretta a Open Food Facts senza alcun server intermedio.
 */
public final class MainActivity extends Activity {
    private WebView web;
    private SharedPreferences prefs;
    private static final int EXPORT = 100, IMPORT = 101, SCAN = 102, PHOTO_CAPTURE = 103, PHOTO_PICK = 104;
    private static final int MAX_BYTES = 12000000;
    private static final int MAX_HTTP_BYTES = 524288;
    private static final int PHOTO_MAX_SIDE = 1600;
    private static final int PACK_THUMB_SIDE = 184;
    private static final int EXPIRY_THUMB_SIDE = 300;
    private boolean scanning = false;
    private String photoKind = "pack";

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("dispensa", MODE_PRIVATE);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setBlockNetworkLoads(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportMultipleWindows(false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !request.getUrl().toString().startsWith("file:///android_asset/");
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !url.startsWith("file:///android_asset/");
            }
        });
        web.addJavascriptInterface(new LocalBridge(), "Android");
        web.setBackgroundColor(0xfff5f7f3);
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    public final class LocalBridge {
        @JavascriptInterface public String loadState() { return prefs.getString("state", ""); }

        @JavascriptInterface public boolean saveState(String json) {
            if (json == null || json.length() > MAX_BYTES) return false;
            try {
                JSONObject parsed = new JSONObject(json);
                if (!"grocy-locale".equals(parsed.optString("format")) || parsed.optInt("version") != 1) return false;
                return prefs.edit().putString("state", json).commit();
            } catch (Exception e) { return false; }
        }

        @JavascriptInterface public void exportBackup(final String json) {
            if (json == null || json.length() > MAX_BYTES) { result(false, "Backup troppo grande."); return; }
            if (!prefs.edit().putString("pendingExport", json).commit()) { result(false, "Impossibile preparare il backup."); return; }
            runOnUiThread(new Runnable() { public void run() {
                try {
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("application/json");
                    String date = new SimpleDateFormat("yyyy-MM-dd", Locale.ITALY).format(new Date());
                    i.putExtra(Intent.EXTRA_TITLE, "grocy-locale-" + date + ".json");
                    startActivityForResult(i, EXPORT);
                } catch (Exception e) { prefs.edit().remove("pendingExport").apply(); result(false, "Nessun gestore file disponibile."); }
            }});
        }

        @JavascriptInterface public void scanBarcode() {
            if (scanning) return;
            scanning = true;
            runOnUiThread(new Runnable() { public void run() {
                try {
                    java.io.File file = CameraOutputProvider.fileFor(MainActivity.this);
                    if (file.exists() && !file.delete()) throw new Exception("File temporaneo non libero.");
                    Intent i = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    i.putExtra(MediaStore.EXTRA_OUTPUT, CameraOutputProvider.OUTPUT);
                    i.setClipData(ClipData.newRawUri("", CameraOutputProvider.OUTPUT));
                    i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivityForResult(i, SCAN);
                } catch (Exception e) {
                    scanning = false;
                    result(false, "Nessuna fotocamera disponibile.");
                }
            }});
        }

        @JavascriptInterface public void capturePhoto(final String kind) {
            photoKind = kindOf(kind);
            runOnUiThread(new Runnable() { public void run() {
                try {
                    java.io.File file = CameraOutputProvider.fileFor(MainActivity.this);
                    if (file.exists() && !file.delete()) throw new Exception("File temporaneo non libero.");
                    Intent i = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    i.putExtra(MediaStore.EXTRA_OUTPUT, CameraOutputProvider.OUTPUT);
                    i.setClipData(ClipData.newRawUri("", CameraOutputProvider.OUTPUT));
                    i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivityForResult(i, PHOTO_CAPTURE);
                } catch (Exception e) {
                    photoError("Nessuna fotocamera disponibile: scegli una foto dalla galleria.");
                }
            }});
        }

        @JavascriptInterface public void pickPhoto(final String kind) {
            photoKind = kindOf(kind);
            runOnUiThread(new Runnable() { public void run() {
                try {
                    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("image/*");
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivityForResult(i, PHOTO_PICK);
                } catch (Exception e) {
                    photoError("Nessun selettore di foto disponibile.");
                }
            }});
        }

        @JavascriptInterface public void importBackup() {
            runOnUiThread(new Runnable() { public void run() {
                try {
                    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("*/*");
                    startActivityForResult(i, IMPORT);
                } catch (Exception e) { result(false, "Nessun gestore file disponibile."); }
            }});
        }

        /**
         * Richiesta HTTPS diretta a Open Food Facts (nessuna chiave API, nessun server nostro).
         * Accetta esclusivamente gli host ufficiali it.openfoodfacts.org e world.openfoodfacts.org.
         */
        @JavascriptInterface public void fetchJson(final String reqId, final String urlString) {
            if (reqId == null || urlString == null) return;
            new Thread(new Runnable() { public void run() {
                HttpsURLConnection conn = null;
                try {
                    URL url = new URL(urlString);
                    String host = url.getHost() == null ? "" : url.getHost().toLowerCase(Locale.US);
                    if (!"https".equalsIgnoreCase(url.getProtocol())
                            || (!"it.openfoodfacts.org".equals(host) && !"world.openfoodfacts.org".equals(host))) {
                        throw new Exception("Indirizzo non consentito.");
                    }
                    conn = (HttpsURLConnection) url.openConnection();
                    conn.setInstanceFollowRedirects(true);
                    conn.setConnectTimeout(3800);
                    conn.setReadTimeout(4200);
                    conn.setRequestMethod("GET");
                    conn.setRequestProperty("Accept", "application/json");
                    conn.setRequestProperty("User-Agent", "GrocyLocale/2.1 (Android; local-app)");
                    int status = conn.getResponseCode();
                    if (status < 200 || status >= 300) throw new Exception("HTTP " + status);
                    InputStream in = conn.getInputStream();
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    try {
                        byte[] buf = new byte[4096];
                        int n;
                        while ((n = in.read(buf)) != -1) {
                            if (out.size() + n > MAX_HTTP_BYTES) throw new Exception("Risposta troppo grande.");
                            out.write(buf, 0, n);
                        }
                    } finally { in.close(); }
                    emitHttp(reqId, true, out.toString("UTF-8"));
                } catch (Exception e) {
                    emitHttp(reqId, false, e.getMessage() == null ? "Errore di rete" : e.getMessage());
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }}).start();
        }
    }

    private static String kindOf(String kind) {
        return ("label".equals(kind) || "expiry".equals(kind)) ? "label" : "pack";
    }

    private void emitHttp(final String reqId, final boolean ok, final String body) {
        emit("window.onNativeHttp && window.onNativeHttp(" + JSONObject.quote(reqId) + "," + ok + "," + JSONObject.quote(body) + ")");
    }

    private void result(final boolean ok, final String message) {
        emit("window.onNativeResult && window.onNativeResult(" + ok + "," + JSONObject.quote(message) + ")");
    }

    private void photoError(final String message) {
        emit("window.onNativePhotoError && window.onNativePhotoError(" + JSONObject.quote(message) + ")");
    }

    @Override protected void onActivityResult(int request, int code, Intent data) {
        super.onActivityResult(request, code, data);
        if (request == SCAN) {
            scanning = false;
            final boolean captured = code == RESULT_OK;
            new Thread(new Runnable() { public void run() { readLabel(captured); } }).start();
            return;
        }
        if (request == PHOTO_CAPTURE) {
            final boolean captured = code == RESULT_OK;
            final String kind = photoKind;
            new Thread(new Runnable() { public void run() { deliverCaptured(kind, captured); } }).start();
            return;
        }
        if (request == PHOTO_PICK) {
            final String kind = photoKind;
            final Uri uri = (code == RESULT_OK && data != null) ? data.getData() : null;
            new Thread(new Runnable() { public void run() { deliverPicked(kind, uri); } }).start();
            return;
        }
        if (code != RESULT_OK || data == null || data.getData() == null) {
            if (request == EXPORT) prefs.edit().remove("pendingExport").apply();
            return;
        }
        final Uri uri = data.getData();
        final int operation = request;
        new Thread(new Runnable() { public void run() {
            try {
                if (operation == EXPORT) {
                    String json = prefs.getString("pendingExport", null);
                    if (json == null) throw new Exception("Backup non disponibile, riprova.");
                    OutputStream out = getContentResolver().openOutputStream(uri, "wt");
                    if (out == null) throw new Exception("File non scrivibile.");
                    try { out.write(json.getBytes("UTF-8")); out.flush(); } finally { out.close(); }
                    prefs.edit().remove("pendingExport").apply();
                    result(true, "Backup salvato nel file scelto.");
                } else if (operation == IMPORT) {
                    InputStream in = getContentResolver().openInputStream(uri);
                    if (in == null) throw new Exception("File non leggibile.");
                    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                    try {
                        byte[] buffer = new byte[8192]; int n;
                        while ((n = in.read(buffer)) != -1) {
                            if (bytes.size() + n > MAX_BYTES) throw new Exception("Il backup supera la dimensione massima.");
                            bytes.write(buffer, 0, n);
                        }
                    } finally { in.close(); }
                    final String text = bytes.toString("UTF-8");
                    emit("window.onNativeBackup(" + JSONObject.quote(text) + ")");
                }
            } catch (Exception e) { result(false, "Operazione non riuscita: " + e.getMessage()); }
        }}).start();
    }

    private void readLabel(boolean captured) {
        java.io.File file = CameraOutputProvider.fileFor(this);
        try {
            if (!captured) {
                emit("window.onNativeScan && window.onNativeScan(null)");
                return;
            }
            if (!file.exists() || file.length() == 0) throw new Exception("La fotocamera non ha salvato la foto. Riprova.");
            Bitmap bitmap = decodePhoto(file);
            String payload = "window.onNativeScan && window.onNativeScan({width:" + bitmap.getWidth()
                    + ",height:" + bitmap.getHeight() + ",data:\"" + grayBase64(bitmap) + "\"})";
            bitmap.recycle();
            emit(payload);
        } catch (Exception e) {
            final String message = e.getMessage() == null ? "Foto non leggibile." : e.getMessage();
            emit("window.onNativeScanError && window.onNativeScanError(" + JSONObject.quote(message) + ")");
        } finally {
            if (file.exists()) file.delete();
        }
    }

    private void deliverCaptured(String kind, boolean captured) {
        java.io.File file = CameraOutputProvider.fileFor(this);
        try {
            if (!captured) { emitPhotoCancelled(); return; }
            if (!file.exists() || file.length() == 0) throw new Exception("La fotocamera non ha salvato la foto. Riprova.");
            Bitmap bitmap = decodePhoto(file);
            emitPhoto(kind, bitmap);
            bitmap.recycle();
        } catch (Exception e) {
            photoError(e.getMessage() == null ? "Foto non leggibile." : e.getMessage());
        } finally {
            if (file.exists()) file.delete();
        }
    }

    private void deliverPicked(String kind, Uri uri) {
        Bitmap bitmap = null;
        try {
            if (uri == null) { emitPhotoCancelled(); return; }
            bitmap = decodePhoto(uri);
            emitPhoto(kind, bitmap);
        } catch (Exception e) {
            photoError(e.getMessage() == null ? "Foto non leggibile." : e.getMessage());
        } finally {
            if (bitmap != null) bitmap.recycle();
        }
    }

    private void emitPhotoCancelled() {
        emit("window.onNativePhoto && window.onNativePhoto(null)");
    }

    private void emitPhoto(String kind, Bitmap bitmap) {
        String k = kindOf(kind);
        int thumbSide = "pack".equals(k) ? PACK_THUMB_SIDE : EXPIRY_THUMB_SIDE;
        String thumb = colorThumbDataUrl(bitmap, thumbSide, 74);
        String payload = "window.onNativePhoto && window.onNativePhoto({kind:" + JSONObject.quote(k)
                + ",width:" + bitmap.getWidth() + ",height:" + bitmap.getHeight()
                + ",thumb:" + JSONObject.quote(thumb)
                + ",data:\"" + grayBase64(bitmap) + "\"})";
        emit(payload);
    }

    private void emit(final String javascript) {
        runOnUiThread(new Runnable() { public void run() {
            if (web != null) web.evaluateJavascript(javascript, null);
        }});
    }

    private Bitmap decodePhoto(java.io.File file) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(file.getAbsolutePath(), bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw new Exception("Foto non leggibile.");
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, PHOTO_MAX_SIDE);
        options.inPreferredConfig = Bitmap.Config.ARGB_8888;
        Bitmap bitmap = BitmapFactory.decodeFile(file.getAbsolutePath(), options);
        if (bitmap == null) throw new Exception("Foto non leggibile.");
        int orientation = ExifInterface.ORIENTATION_NORMAL;
        try { orientation = new ExifInterface(file.getAbsolutePath()).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL); }
        catch (Exception ignored) { }
        return rotate(bitmap, orientation);
    }

    private Bitmap decodePhoto(Uri uri) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        InputStream in = getContentResolver().openInputStream(uri);
        if (in == null) throw new Exception("Foto non leggibile.");
        try { BitmapFactory.decodeStream(in, null, bounds); } finally { in.close(); }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw new Exception("La foto scelta non è un’immagine.");
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, PHOTO_MAX_SIDE);
        options.inPreferredConfig = Bitmap.Config.ARGB_8888;
        in = getContentResolver().openInputStream(uri);
        if (in == null) throw new Exception("Foto non leggibile.");
        Bitmap bitmap;
        try { bitmap = BitmapFactory.decodeStream(in, null, options); } finally { in.close(); }
        if (bitmap == null) throw new Exception("Foto non leggibile.");
        int orientation = ExifInterface.ORIENTATION_NORMAL;
        InputStream exifStream = null;
        try {
            exifStream = getContentResolver().openInputStream(uri);
            if (exifStream != null) orientation = new ExifInterface(exifStream).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
        } catch (Exception ignored) { }
        finally { if (exifStream != null) try { exifStream.close(); } catch (Exception ignored) { } }
        return rotate(bitmap, orientation);
    }

    private static int sampleSize(int width, int height, int max) {
        int sample = 1;
        while (Math.max(width, height) / sample > max) sample *= 2;
        return sample;
    }

    private static Bitmap rotate(Bitmap source, int orientation) {
        int degrees = orientation == ExifInterface.ORIENTATION_ROTATE_90 ? 90
                : orientation == ExifInterface.ORIENTATION_ROTATE_180 ? 180
                : orientation == ExifInterface.ORIENTATION_ROTATE_270 ? 270 : 0;
        if (degrees == 0) return source;
        Matrix matrix = new Matrix();
        matrix.postRotate(degrees);
        Bitmap rotated = Bitmap.createBitmap(source, 0, 0, source.getWidth(), source.getHeight(), matrix, true);
        if (rotated != source) source.recycle();
        return rotated;
    }

    private static String colorThumbDataUrl(Bitmap source, int maxSide, int quality) {
        Bitmap scaled = null;
        try {
            int w = source.getWidth(), h = source.getHeight();
            int longest = Math.max(w, h);
            if (longest > maxSide) {
                int tw = Math.max(1, Math.round((float) w * maxSide / longest));
                int th = Math.max(1, Math.round((float) h * maxSide / longest));
                scaled = Bitmap.createScaledBitmap(source, tw, th, true);
            } else {
                scaled = source;
            }
            ByteArrayOutputStream jpeg = new ByteArrayOutputStream();
            scaled.compress(Bitmap.CompressFormat.JPEG, quality, jpeg);
            return "data:image/jpeg;base64," + Base64.encodeToString(jpeg.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return "";
        } finally {
            if (scaled != null && scaled != source) scaled.recycle();
        }
    }

    private static String grayBase64(Bitmap bitmap) {
        int width = bitmap.getWidth(), height = bitmap.getHeight();
        int[] pixels = new int[width * height];
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height);
        byte[] gray = new byte[width * height];
        for (int i = 0; i < gray.length; i++) {
            int c = pixels[i];
            gray[i] = (byte) ((((c >> 16) & 0xff) * 77 + ((c >> 8) & 0xff) * 150 + (c & 0xff) * 29) >> 8);
        }
        return Base64.encodeToString(gray, Base64.NO_WRAP);
    }

    @Override public void onBackPressed() {
        web.evaluateJavascript("window.handleAndroidBack ? window.handleAndroidBack() : false", new ValueCallback<String>() { public void onReceiveValue(String value) {
            if (!"true".equals(value)) MainActivity.super.onBackPressed();
        }});
    }

    @Override protected void onDestroy() {
        scanning = false;
        if (web != null) { web.removeJavascriptInterface("Android"); web.destroy(); web = null; }
        super.onDestroy();
    }
}
