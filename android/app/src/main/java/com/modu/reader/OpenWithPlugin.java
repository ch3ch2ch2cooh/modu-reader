package com.modu.reader;

import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/** Receives ACTION_VIEW intents (system "open with") and hands the bytes to JS. */
@CapacitorPlugin(name = "OpenWith")
public class OpenWithPlugin extends Plugin {

    private static final int MAX_BYTES = 80 * 1024 * 1024;
    private static byte[] pendingBytes;
    private static String pendingName;
    private static String pendingMime;

    static void setPendingIntent(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        Uri uri = intent.getData();
        if (uri == null) return;
        try {
            String mime = intent.getType();
            if (mime == null) mime = context.getContentResolver().getType(uri);
            String name = null;
            try (Cursor cursor = context.getContentResolver().query(uri, null, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (index >= 0) name = cursor.getString(index);
                }
            }
            if (name == null) name = uri.getLastPathSegment();
            if (name == null || name.isEmpty()) name = "打开的书";

            try (InputStream input = context.getContentResolver().openInputStream(uri)) {
                if (input == null) return;
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                byte[] buffer = new byte[64 * 1024];
                int read;
                int total = 0;
                while ((read = input.read(buffer)) != -1) {
                    total += read;
                    if (total > MAX_BYTES) {
                        pendingBytes = null;
                        return;
                    }
                    output.write(buffer, 0, read);
                }
                pendingBytes = output.toByteArray();
                pendingName = name;
                pendingMime = mime;
            }
        } catch (Exception ignored) {
            pendingBytes = null;
        }
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        if (pendingBytes == null) {
            call.resolve();
            return;
        }
        JSObject result = new JSObject();
        result.put("name", pendingName);
        result.put("mime", pendingMime);
        result.put("data", Base64.encodeToString(pendingBytes, Base64.NO_WRAP));
        pendingBytes = null;
        pendingName = null;
        pendingMime = null;
        call.resolve(result);
    }
}
