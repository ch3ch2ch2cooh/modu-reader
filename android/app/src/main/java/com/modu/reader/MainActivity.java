package com.modu.reader;

import android.os.Bundle;
import android.view.KeyEvent;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FolderImportPlugin.class);
        registerPlugin(VolumeKeysPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (VolumeKeysPlugin.handleDown(keyCode, event.getRepeatCount())) {
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public boolean onKeyUp(int keyCode, KeyEvent event) {
        if (VolumeKeysPlugin.consumeKeyUp(keyCode)) {
            return true;
        }
        return super.onKeyUp(keyCode, event);
    }
}
