/**
 * pdf.js v6 uses the newer Map/WeakMap `getOrInsertComputed` helpers. Some
 * Android WebView builds lag behind desktop Chromium and do not expose them,
 * which made every PDF import fail on device with:
 *   TypeError: q(...).getOrInsertComputed is not a function
 */
export function installMapHelpers(target: typeof globalThis = globalThis): void {
  const mapProto = target.Map?.prototype as unknown as Record<string, unknown> | undefined;
  const weakProto = target.WeakMap?.prototype as unknown as Record<string, unknown> | undefined;

  const install = (proto: Record<string, unknown> | undefined) => {
    if (!proto) return;
    if (typeof proto.getOrInsert !== 'function') {
      Object.defineProperty(proto, 'getOrInsert', {
        configurable: true,
        writable: true,
        value: function getOrInsert(this: Map<unknown, unknown>, key: unknown, value: unknown) {
          if (this.has(key)) return this.get(key);
          this.set(key, value);
          return value;
        },
      });
    }
    if (typeof proto.getOrInsertComputed !== 'function') {
      Object.defineProperty(proto, 'getOrInsertComputed', {
        configurable: true,
        writable: true,
        value: function getOrInsertComputed(
          this: Map<unknown, unknown>,
          key: unknown,
          compute: (key: unknown) => unknown,
        ) {
          if (this.has(key)) return this.get(key);
          const value = compute(key);
          this.set(key, value);
          return value;
        },
      });
    }
  };

  install(mapProto);
  install(weakProto);
}
