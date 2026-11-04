package com.modu.reader;

import android.view.KeyEvent;
import com.getcapacitor.Bridge;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Captures the hardware volume keys while the reader is open and forwards them
 * to the web layer for page turning. Disabled everywhere else so the keys keep
 * controlling the system volume.
 */
@CapacitorPlugin(name = "VolumeKeys")
public class VolumeKeysPlugin extends Plugin {

    private static VolumeKeysPlugin instance;
    private boolean enabled = false;

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        enabled = call.getBoolean("enabled", false);
        call.resolve();
    }

    static boolean isActive() {
        VolumeKeysPlugin plugin = instance;
        return plugin != null && plugin.enabled;
    }

    static boolean handleDown(int keyCode, int repeatCount) {
        VolumeKeysPlugin plugin = instance;
        if (plugin == null || !plugin.enabled) {
            return false;
        }
        if (keyCode != KeyEvent.KEYCODE_VOLUME_UP && keyCode != KeyEvent.KEYCODE_VOLUME_DOWN) {
            return false;
        }
        if (repeatCount == 0) {
            final String direction = keyCode == KeyEvent.KEYCODE_VOLUME_UP ? "up" : "down";
            JSObject data = new JSObject();
            data.put("direction", direction);
            plugin.notifyListeners("volumeKey", data);

            // Direct JS call is more reliable than the plugin listener bridge,
            // which may not be attached yet when the first key arrives.
            Bridge bridge = plugin.getBridge();
            if (bridge != null && bridge.getWebView() != null) {
                bridge
                    .getWebView()
                    .post(() ->
                        bridge
                            .getWebView()
                            .evaluateJavascript("window.__moduVolumeKey&&window.__moduVolumeKey('" + direction + "')", null)
                    );
            }
        }
        return true;
    }

    static boolean consumeKeyUp(int keyCode) {
        if (!isActive()) {
            return false;
        }
        return keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) {
            instance = null;
        }
        super.handleOnDestroy();
    }
}
