import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

interface VolumeKeyEvent {
  direction: 'up' | 'down';
}

interface VolumeKeysPlugin {
  setEnabled(options: { enabled: boolean }): Promise<void>;
  addListener(
    eventName: 'volumeKey',
    listener: (event: VolumeKeyEvent) => void,
  ): Promise<PluginListenerHandle>;
}

const VolumeKeys = registerPlugin<VolumeKeysPlugin>('VolumeKeys');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function hasVolumeKeySupport(): boolean {
  return Capacitor.isNativePlatform();
}

export async function setVolumeKeysEnabled(enabled: boolean): Promise<void> {
  if (!hasVolumeKeySupport()) return;
  const attempts = enabled ? 3 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await VolumeKeys.setEnabled({ enabled });
      return;
    } catch {
      if (attempt < attempts - 1) await sleep(350);
    }
  }
}

export async function onVolumeKey(
  listener: (event: VolumeKeyEvent) => void,
): Promise<PluginListenerHandle | undefined> {
  if (!hasVolumeKeySupport()) return undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await VolumeKeys.addListener('volumeKey', listener);
    } catch {
      await sleep(350);
    }
  }
  return undefined;
}
