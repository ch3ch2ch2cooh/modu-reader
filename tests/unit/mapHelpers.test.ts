import { describe, expect, it } from 'vitest';
import { installMapHelpers } from '../../src/lib/mapHelpers';

class FakeMap {
  private store = new Map<unknown, unknown>();
  has(key: unknown) {
    return this.store.has(key);
  }
  get(key: unknown) {
    return this.store.get(key);
  }
  set(key: unknown, value: unknown) {
    this.store.set(key, value);
    return this;
  }
}

describe('installMapHelpers', () => {
  it('installs getOrInsert and getOrInsertComputed compatible with pdf.js', () => {
    const fakeGlobal = { Map: FakeMap, WeakMap: FakeMap } as unknown as typeof globalThis;
    installMapHelpers(fakeGlobal);

    const map = new FakeMap() as unknown as Map<string, number> & {
      getOrInsert(key: string, value: number): number;
      getOrInsertComputed(key: string, compute: (key: string) => number): number;
    };

    expect(map.getOrInsert('a', 1)).toBe(1);
    expect(map.getOrInsert('a', 2)).toBe(1);

    let calls = 0;
    expect(
      map.getOrInsertComputed('b', () => {
        calls += 1;
        return 7;
      }),
    ).toBe(7);
    expect(
      map.getOrInsertComputed('b', () => {
        calls += 1;
        return 9;
      }),
    ).toBe(7);
    expect(calls).toBe(1);
  });
});
