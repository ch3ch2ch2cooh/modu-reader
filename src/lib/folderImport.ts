import { Capacitor, registerPlugin } from '@capacitor/core';

export interface FolderBookFile {
  name: string;
  uri: string;
  size: number;
}

interface FolderImportPlugin {
  pickFolder(): Promise<{ folder: string; files: FolderBookFile[] }>;
  readFile(options: { uri: string }): Promise<{ data: string }>;
}

const FolderImport = registerPlugin<FolderImportPlugin>('FolderImport');

export function canPickFolder(): boolean {
  return Capacitor.isNativePlatform();
}

export async function pickBookFolder(): Promise<{ folder: string; files: FolderBookFile[] }> {
  if (!canPickFolder()) {
    throw new Error('从文件夹导入仅支持安卓客户端');
  }
  return FolderImport.pickFolder();
}

function base64ToBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes]);
}

export async function readBookFileAsFile(uri: string, name: string): Promise<File> {
  const { data } = await FolderImport.readFile({ uri });
  const blob = base64ToBlob(data);
  return new File([blob], name, { type: 'application/octet-stream' });
}
