package com.modu.reader;

import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Lets the WebView pick a folder through the Storage Access Framework, list the
 * e-book files inside it and read them one at a time (as base64) for import.
 */
@CapacitorPlugin(name = "FolderImport")
public class FolderImportPlugin extends Plugin {

    private static final long MAX_BYTES = 80L * 1024 * 1024;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION |
            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION |
            Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        );
        startActivityForResult(call, intent, "folderPicked");
    }

    @ActivityCallback
    private void folderPicked(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        if (result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("未选择文件夹");
            return;
        }
        Uri treeUri = result.getData().getData();
        try {
            getContext()
                .getContentResolver()
                .takePersistableUriPermission(treeUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Exception ignored) {
            // Some providers do not support persistable grants; reading still works for this session.
        }

        try {
            DocumentFile root = DocumentFile.fromTreeUri(getContext(), treeUri);
            if (root == null) {
                call.reject("无法读取文件夹");
                return;
            }
            JSArray files = new JSArray();
            for (DocumentFile child : root.listFiles()) {
                if (!child.isFile()) {
                    continue;
                }
                String name = child.getName();
                if (name == null) {
                    continue;
                }
                String lower = name.toLowerCase(Locale.ROOT);
                if (
                    !(lower.endsWith(".epub") ||
                        lower.endsWith(".pdf") ||
                        lower.endsWith(".txt") ||
                        lower.endsWith(".mobi") ||
                        lower.endsWith(".azw") ||
                        lower.endsWith(".azw3") ||
                        lower.endsWith(".kf8"))
                ) {
                    continue;
                }
                JSObject item = new JSObject();
                item.put("name", name);
                item.put("uri", child.getUri().toString());
                item.put("size", child.length());
                files.put(item);
            }
            JSObject ret = new JSObject();
            ret.put("folder", root.getName() != null ? root.getName() : "文件夹");
            ret.put("files", files);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("读取文件夹失败: " + e.getMessage());
        }
    }

    @PluginMethod
    public void readFile(PluginCall call) {
        final String uriString = call.getString("uri");
        if (uriString == null) {
            call.reject("缺少文件 uri");
            return;
        }
        executor.execute(() -> {
            try {
                Uri uri = Uri.parse(uriString);
                InputStream input = getContext().getContentResolver().openInputStream(uri);
                if (input == null) {
                    call.reject("无法打开文件");
                    return;
                }
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buffer = new byte[64 * 1024];
                long total = 0;
                int read;
                while ((read = input.read(buffer)) != -1) {
                    total += read;
                    if (total > MAX_BYTES) {
                        input.close();
                        call.reject("文件超过 80MB，无法导入");
                        return;
                    }
                    out.write(buffer, 0, read);
                }
                input.close();
                String base64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
                JSObject ret = new JSObject();
                ret.put("data", base64);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("读取文件失败: " + e.getMessage());
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        super.handleOnDestroy();
    }
}
