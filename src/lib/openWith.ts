import { Capacitor, registerPlugin } from '@capacitor/core';

interface PendingOpen {
  name: string;
  mime?: string;
  data: string;
}

interface OpenWithPlugin {
  getPending(): Promise<PendingOpen | undefined>;
}

const OpenWith = registerPlugin<OpenWithPlugin>('OpenWith');

function base64ToBytes(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return buffer;
}

export async function takeOpenedFile(): Promise<File | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const pending = await OpenWith.getPending();
    if (!pending?.data) return null;
    const bytes = base64ToBytes(pending.data);
    return new File([bytes], pending.name || '打开的书', {
      type: pending.mime || 'application/octet-stream',
    });
  } catch {
    return null;
  }
}
