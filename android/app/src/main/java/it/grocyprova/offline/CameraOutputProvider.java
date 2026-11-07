package it.grocyprova.offline;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.os.ParcelFileDescriptor;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Fornisce all'app fotocamera di sistema un file temporaneo in cui salvare lo
 * scatto dell'etichetta. Nessun permesso di archiviazione: il file vive nella
 * cache privata dell'app e viene cancellato dopo la lettura.
 */
public final class CameraOutputProvider extends ContentProvider {
    public static final String AUTHORITY = "it.grocyprova.offline.capture";
    public static final Uri OUTPUT = Uri.parse("content://" + AUTHORITY + "/etichetta.jpg");
    public static final String FILE_NAME = "etichetta.jpg";

    public static File fileFor(android.content.Context context) {
        File dir = new File(context.getCacheDir(), "scan");
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, FILE_NAME);
    }

    @Override public boolean onCreate() { return true; }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (getContext() == null) throw new FileNotFoundException("Contesto non disponibile.");
        return ParcelFileDescriptor.open(fileFor(getContext()),
                ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_READ_WRITE | ParcelFileDescriptor.MODE_TRUNCATE);
    }

    @Override public String getType(Uri uri) { return "image/jpeg"; }

    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        // Alcune app fotocamera leggono nome e dimensione prima di scrivere.
        if (getContext() == null) return null;
        MatrixCursor cursor = new MatrixCursor(new String[] {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
        cursor.addRow(new Object[] {FILE_NAME, fileFor(getContext()).length()});
        return cursor;
    }
    @Override public Uri insert(Uri uri, ContentValues values) { return null; }
    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { return 0; }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { return 0; }
}
