package it.grocyprova.offline;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.ValueCallback;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONObject;

/** Local-only shell: no Internet permission, no remote WebView content. */
public final class MainActivity extends Activity {
    private WebView web;
    private SharedPreferences prefs;
    private static final int EXPORT = 100, IMPORT = 101, SCAN = 102;
    private static final int MAX_BYTES = 8000000;
    private static final int SCAN_MAX_SIDE = 1600;
    private boolean scanning = false;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("dispensa", MODE_PRIVATE);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false); // android_asset is still available.
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setBlockNetworkLoads(true);
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
        web.setBackgroundColor(0xfff7f8f4);
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    public final class LocalBridge {
        @JavascriptInterface public String loadState() { return prefs.getString("state", ""); }
        @JavascriptInterface public boolean saveState(String json) {
            if (json == null || json.length() > 2000000) return false;
            try {
                JSONObject parsed = new JSONObject(json);
                if (!"grocy-locale".equals(parsed.optString("format")) || parsed.optInt("version") != 1) return false;
                return prefs.edit().putString("state", json).commit();
            } catch (Exception e) { return false; }
        }
        @JavascriptInterface public void exportBackup(final String json) {
            if (json == null || json.length() > 2000000) { result(false, "Backup troppo grande."); return; }
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
                    result(false, "Nessuna fotocamera disponibile: inserisci il codice a mano.");
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
    }
    private void result(final boolean ok, final String message) {
        runOnUiThread(new Runnable() { public void run() {
            if (web != null) web.evaluateJavascript("window.onNativeResult && window.onNativeResult(" + ok + "," + JSONObject.quote(message) + ")", null);
        }});
    }
    @Override protected void onActivityResult(int request, int code, Intent data) {
        super.onActivityResult(request, code, data);
        if (request == SCAN) {
            scanning = false;
            final boolean captured = code == RESULT_OK;
            new Thread(new Runnable() { public void run() { readLabel(captured); } }).start();
            return;
        }
        if (code != RESULT_OK || data == null || data.getData() == null) {
            if (request == EXPORT) prefs.edit().remove("pendingExport").apply();
            return;
        }
        final Uri uri = data.getData();
        final int operation = request;
        // File providers may be slow: never block WebView's main thread.
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
                    runOnUiThread(new Runnable() { public void run() {
                        if (web != null) web.evaluateJavascript("window.onNativeBackup(" + JSONObject.quote(text) + ")", null);
                    }});
                }
            } catch (Exception e) { result(false, "Operazione non riuscita: " + e.getMessage()); }
        }}).start();
    }
    /** Converte lo scatto in scala di grigi e lo passa al lettore JavaScript. */
    private void readLabel(boolean captured) {
        java.io.File file = CameraOutputProvider.fileFor(this);
        try {
            if (!captured) {
                runOnUiThread(new Runnable() { public void run() {
                    if (web != null) web.evaluateJavascript("window.onNativeScan && window.onNativeScan(null)", null);
                }});
                return;
            }
            if (!file.exists() || file.length() == 0) throw new Exception("La fotocamera non ha salvato la foto. Riprova.");
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(file.getAbsolutePath(), bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw new Exception("Foto non leggibile.");
            int sample = 1;
            while (Math.max(bounds.outWidth, bounds.outHeight) / sample > SCAN_MAX_SIDE) sample *= 2;
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = sample;
            options.inPreferredConfig = Bitmap.Config.ARGB_8888;
            Bitmap bitmap = BitmapFactory.decodeFile(file.getAbsolutePath(), options);
            if (bitmap == null) throw new Exception("Foto non leggibile.");
            int width = bitmap.getWidth(), height = bitmap.getHeight();
            int[] pixels = new int[width * height];
            bitmap.getPixels(pixels, 0, width, 0, 0, width, height);
            byte[] gray = new byte[width * height];
            for (int i = 0; i < gray.length; i++) {
                int c = pixels[i];
                gray[i] = (byte) ((((c >> 16) & 0xff) * 77 + ((c >> 8) & 0xff) * 150 + (c & 0xff) * 29) >> 8);
            }
            bitmap.recycle();
            final String payload = "window.onNativeScan && window.onNativeScan({width:" + width + ",height:" + height + ",data:\"" + Base64.encodeToString(gray, Base64.NO_WRAP) + "\"})";
            runOnUiThread(new Runnable() { public void run() {
                if (web != null) web.evaluateJavascript(payload, null);
            }});
        } catch (Exception e) {
            final String message = e.getMessage() == null ? "Foto non leggibile." : e.getMessage();
            runOnUiThread(new Runnable() { public void run() {
                if (web != null) web.evaluateJavascript("window.onNativeScanError && window.onNativeScanError(" + JSONObject.quote(message) + ")", null);
            }});
        } finally {
            if (file.exists()) file.delete();
        }
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
