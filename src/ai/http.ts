import { Capacitor, CapacitorHttp } from '@capacitor/core';

export class ApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`HTTP ${status}: ${body.slice(0, 300)}`);
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

function parseMaybeJson(data: unknown): unknown {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }
  return data;
}

/**
 * On Android use the native HTTP bridge (no CORS, no mixed content limits).
 * In the browser fall back to fetch so the same code works during development.
 */
export async function requestJson<T>(options: RequestOptions): Promise<T> {
  const method = options.method ?? 'POST';
  const headers = { 'Content-Type': 'application/json', ...(options.headers ?? {}) };

  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.request({
      url: options.url,
      method,
      headers,
      data: options.body === undefined ? undefined : JSON.stringify(options.body),
      connectTimeout: 20_000,
      readTimeout: options.timeoutMs ?? 120_000,
    });
    const data = parseMaybeJson(response.data);
    if (response.status >= 400) {
      throw new ApiError(response.status, typeof data === 'string' ? data : JSON.stringify(data));
    }
    return data as T;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 120_000);
  try {
    const response = await fetch(options.url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new ApiError(response.status, text);
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timer);
  }
}
