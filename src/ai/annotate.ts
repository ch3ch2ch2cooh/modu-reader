import type { AIAnnotation, AISettings } from '../types';
import { requestJson } from './http';
import { searchWeb, type SearchResult } from './search';

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

export interface AnnotateInput {
  bookTitle: string;
  author?: string;
  chapterTitle?: string;
  selected: string;
  before: string;
  after: string;
}

export interface AskAnnotationInput extends AnnotateInput {
  annotation: string;
  history: { question: string; answer: string }[];
  question: string;
}

function effortStyle(effort: AISettings['effort']): {
  maxTokens: number;
  temperature: number;
  instruction: string;
} {
  if (effort === 'medium') {
    return {
      maxTokens: 600,
      temperature: 0.5,
      instruction: '回答控制在 300 字以内，解释清楚即可。',
    };
  }
  if (effort === 'high') {
    return {
      maxTokens: 1200,
      temperature: 0.7,
      instruction: '尽量展开背景与不同解释，控制在 600 字以内。',
    };
  }
  return {
    maxTokens: 260,
    temperature: 0.35,
    instruction: '直接回答，控制在 120 字以内，不要展开，不要重复原文。',
  };
}

const SYSTEM_PROMPT = `你是一位严谨的中文图书注释助手，任务是解释读者在书中选中的一段文字。请遵守：
1. 先用一两句话给出直白的解释；
2. 再补充必要的背景、典故、人物关系或专业术语；
3. 如果提供了联网资料，要结合资料，并指出资料与原文可能不一致之处；
4. 不确定的内容要明确说明，禁止编造；
5. 使用中文，简洁分段，不要使用 Markdown 标题。`;

function buildUserPrompt(input: AnnotateInput, sources: SearchResult[]): string {
  const parts: string[] = [];
  parts.push(`书名：《${input.bookTitle}》`);
  if (input.author) parts.push(`作者：${input.author}`);
  if (input.chapterTitle) parts.push(`章节：${input.chapterTitle}`);
  parts.push('');
  parts.push('【上文】');
  parts.push(input.before.trim() || '（无）');
  parts.push('');
  parts.push('【需要注释的文字】');
  parts.push(input.selected.trim());
  parts.push('');
  parts.push('【下文】');
  parts.push(input.after.trim() || '（无）');

  if (sources.length > 0) {
    parts.push('');
    parts.push('【联网资料】');
    sources.forEach((s, i) => {
      parts.push(`[${i + 1}] ${s.title}（${s.url}）`);
      parts.push(s.snippet);
    });
  } else {
    parts.push('');
    parts.push('【联网资料】无，请基于可靠的常识作答，并注明不确定之处。');
  }

  parts.push('');
  parts.push('请为【需要注释的文字】写一段注释。');
  return parts.join('\n');
}

export async function annotatePassage(
  input: AnnotateInput,
  settings: AISettings,
): Promise<AIAnnotation> {
  if (!settings.apiKey.trim()) {
    throw new Error('尚未配置 DeepSeek API Key，请到「设置 → AI 注释」中填写。');
  }

  let sources: SearchResult[] = [];
  if (settings.searchProvider !== 'none' && settings.searchKey.trim()) {
    try {
      sources = await searchWeb(`${input.selected} ${input.bookTitle}`, settings);
    } catch {
      sources = [];
    }
  }

  const effort = effortStyle(settings.effort);
  const base = settings.baseUrl.trim().replace(/\/+$/, '');
  const data = await requestJson<ChatResponse>({
    url: `${base}/chat/completions`,
    headers: {
      Authorization: `Bearer ${settings.apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: {
      model: settings.model || 'deepseek-chat',
      messages: [
        { role: 'system', content: `${SYSTEM_PROMPT}\n6. ${effort.instruction}` },
        { role: 'user', content: buildUserPrompt(input, sources) },
      ],
      temperature: effort.temperature,
      max_tokens: effort.maxTokens,
      stream: false,
    },
    timeoutMs: 180_000,
  });

  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) {
    throw new Error(data.error?.message || 'DeepSeek 没有返回内容，请稍后重试。');
  }

  return {
    answer,
    model: settings.model || 'deepseek-chat',
    sources: sources.map((s) => ({ title: s.title, url: s.url, snippet: s.snippet })),
    createdAt: Date.now(),
  };
}

export async function askAnnotation(
  input: AskAnnotationInput,
  settings: AISettings,
): Promise<string> {
  if (!settings.apiKey.trim()) {
    throw new Error('尚未配置 DeepSeek API Key，请到「设置 → AI 注释」中填写。');
  }
  const effort = effortStyle(settings.effort);
  const parts: string[] = [];
  parts.push(`书名：《${input.bookTitle}》`);
  if (input.author) parts.push(`作者：${input.author}`);
  if (input.chapterTitle) parts.push(`章节：${input.chapterTitle}`);
  parts.push('');
  parts.push('【原文选段】');
  parts.push(input.selected.trim());
  if (input.before.trim() || input.after.trim()) {
    parts.push('【上下文】');
    parts.push(`${input.before.trim()} …… ${input.after.trim()}`.trim());
  }
  parts.push('');
  parts.push('【已有注释】');
  parts.push(input.annotation.trim());
  if (input.history.length > 0) {
    parts.push('');
    parts.push('【之前的问答】');
    for (const item of input.history.slice(-6)) {
      parts.push(`问：${item.question}`);
      parts.push(`答：${item.answer}`);
    }
  }
  parts.push('');
  parts.push(`【新的追问】${input.question.trim()}`);
  parts.push('');
  parts.push('请只回答这个追问，必要时引用原文，不要重复已有注释。');

  const base = settings.baseUrl.trim().replace(/\/+$/, '');
  const data = await requestJson<ChatResponse>({
    url: `${base}/chat/completions`,
    headers: {
      Authorization: `Bearer ${settings.apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: {
      model: settings.model || 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `你是一位中文图书阅读助手，熟悉文学、历史与文本细读。基于用户给出的原文选段、已有注释和问答历史回答追问；不确定的地方要说明，禁止编造。${effort.instruction}`,
        },
        { role: 'user', content: parts.join('\n') },
      ],
      temperature: effort.temperature,
      max_tokens: effort.maxTokens,
      stream: false,
    },
    timeoutMs: 120_000,
  });
  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error(data.error?.message || 'AI 没有返回内容，请稍后重试。');
  return answer;
}

export async function testDeepSeek(settings: AISettings): Promise<string> {
  if (!settings.apiKey.trim()) throw new Error('请先填写 API Key');
  const base = settings.baseUrl.trim().replace(/\/+$/, '');
  const data = await requestJson<ChatResponse>({
    url: `${base}/chat/completions`,
    headers: {
      Authorization: `Bearer ${settings.apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: {
      model: settings.model || 'deepseek-chat',
      messages: [{ role: 'user', content: '只回复两个字：可用' }],
      max_tokens: 10,
      stream: false,
    },
    timeoutMs: 30_000,
  });
  return data.choices?.[0]?.message?.content?.trim() || '连接成功';
}
