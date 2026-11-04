import type { AISettings } from '../types';
import { requestJson } from './http';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface TavilyResponse {
  results?: { title?: string; url?: string; content?: string }[];
}

interface BingResponse {
  webPages?: { value?: { name?: string; url?: string; snippet?: string }[] };
}

export async function searchWeb(query: string, ai: AISettings): Promise<SearchResult[]> {
  if (ai.searchProvider === 'none' || !ai.searchKey.trim()) return [];
  const clean = query.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!clean) return [];

  if (ai.searchProvider === 'tavily') {
    const data = await requestJson<TavilyResponse>({
      url: 'https://api.tavily.com/search',
      headers: { Authorization: `Bearer ${ai.searchKey.trim()}` },
      body: {
        query: clean,
        search_depth: 'basic',
        max_results: 4,
        include_answer: false,
        include_raw_content: false,
      },
      timeoutMs: 30_000,
    });
    return (data.results ?? [])
      .filter((r) => r.url)
      .map((r) => ({
        title: r.title ?? r.url ?? '',
        url: r.url ?? '',
        snippet: (r.content ?? '').slice(0, 700),
      }));
  }

  const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(clean)}&count=4&mkt=zh-CN`;
  const data = await requestJson<BingResponse>({
    url,
    method: 'GET',
    headers: { 'Ocp-Apim-Subscription-Key': ai.searchKey.trim() },
    timeoutMs: 30_000,
  });
  return (data.webPages?.value ?? []).map((r) => ({
    title: r.name ?? '',
    url: r.url ?? '',
    snippet: (r.snippet ?? '').slice(0, 700),
  }));
}
