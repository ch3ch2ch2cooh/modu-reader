import type { AISettings, BookFormat } from '../types';
import { requestJson } from './http';

/** Fixed taxonomy keeps the bookshelf from growing one category per import. */
export const BOOK_CATEGORIES = [
  '小说',
  '文学',
  '历史',
  '哲学',
  '社科',
  '科普',
  '计算机',
  '经济',
  '心理',
  '传记',
  '艺术',
  '教育',
  '生活',
  '其他',
] as const;

export const CATEGORY_COLORS: Record<string, string> = {
  小说: '#8c5a6b',
  文学: '#9a5b34',
  历史: '#7a6a4f',
  哲学: '#5a6b8c',
  社科: '#4e6e5d',
  科普: '#3f6a6e',
  计算机: '#4a5b7a',
  经济: '#7d5a3a',
  心理: '#8a5a7a',
  传记: '#6b6b4f',
  艺术: '#a05a4a',
  教育: '#5d7a4a',
  生活: '#8a6a4a',
  其他: '#7d7a72',
};

const SYNONYMS: [RegExp, string][] = [
  [/科幻|武侠|言情|悬疑|推理|奇幻|玄幻|恐怖|青春|网络文学/, '小说'],
  [/编程|程序|开发|互联网|it|人工智能|机器学习|深度学习|数据科学/, '计算机'],
  [/科学|自然|宇宙|生命|医学|健康/, '科普'],
  [/社会|政治|法律|军事|人类学|文化研究/, '社科'],
  [/商业|金融|投资|理财|管理|营销|创业/, '经济'],
  [/成长|励志|情绪|人格|认知|self-help/i, '心理'],
  [/人物|回忆|自传|传记|生平/, '传记'],
  [/教材|教辅|考试|外语|语言学习/, '教育'],
  [/艺术|绘画|音乐|摄影|设计|美学/, '艺术'],
  [/历史|古代|近代|王朝|战争史/, '历史'],
  [/哲学|思想|伦理|宗教/, '哲学'],
  [/散文|诗歌|随笔|classic|novel|fiction|poetry/i, '文学'],
  [/生活|美食|旅行|健身|家居|养生/, '生活'],
];

export function normalizeCategory(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const text = String(raw).trim().replace(/类$/, '');
  if (!text) return null;
  if ((BOOK_CATEGORIES as readonly string[]).includes(text)) return text;
  for (const [pattern, category] of SYNONYMS) {
    if (pattern.test(text)) return category;
  }
  for (const category of BOOK_CATEGORIES) {
    if (text.includes(category)) return category;
  }
  return null;
}

export function guessCategoryByRules(input: {
  title: string;
  author?: string;
  chapters?: string[];
}): string {
  const haystack = [input.title, input.author ?? '', ...(input.chapters ?? []).slice(0, 12)]
    .join(' ')
    .toLowerCase();

  const rules: { category: string; keywords: string[] }[] = [
    {
      category: '计算机',
      keywords: [
        '编程',
        '代码',
        '算法',
        'python',
        'javascript',
        'typescript',
        'java',
        'c++',
        'linux',
        '数据库',
        '前端',
        '后端',
        '架构',
        '程序',
        '计算机',
        '机器学习',
        '深度学习',
        '人工智能',
      ],
    },
    {
      category: '经济',
      keywords: ['经济', '金融', '投资', '资本', '货币', '商业', '管理', '营销', '财务', '股票', '创业'],
    },
    {
      category: '心理',
      keywords: ['心理', '情绪', '认知', '人格', '焦虑', '自控', '习惯', '成长'],
    },
    {
      category: '历史',
      keywords: ['历史', '史记', '通鉴', '王朝', '战争', '帝国', '古代', '近代', '民国', '三国', '唐朝', '宋朝', '明朝', '清朝'],
    },
    {
      category: '哲学',
      keywords: ['哲学', '伦理', '存在', '形而上学', '逻辑', '庄子', '老子', '论语', '康德', '尼采'],
    },
    {
      category: '科普',
      keywords: ['科普', '宇宙', '物理', '化学', '生物', '基因', '数学', '天文', '量子', '进化', '科学'],
    },
    {
      category: '传记',
      keywords: ['传记', '自传', '回忆录', '生平', '传'],
    },
    {
      category: '艺术',
      keywords: ['艺术', '绘画', '音乐', '电影', '摄影', '设计', '美学'],
    },
    {
      category: '教育',
      keywords: ['教材', '教程', '考试', '教育', '英语', '单词', '语法'],
    },
    {
      category: '生活',
      keywords: ['菜谱', '烹饪', '旅行', '健身', '养生', '家居', '美食'],
    },
    {
      category: '小说',
      keywords: ['小说', '故事', '演义', '传奇', '悬疑', '科幻', '武侠', '言情'],
    },
    {
      category: '文学',
      keywords: ['文学', '散文', '诗歌', '随笔', 'novel', 'fiction', 'poetry'],
    },
  ];

  for (const rule of rules) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      return rule.category;
    }
  }
  return '其他';
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
}

export interface ClassifyResult {
  category: string;
  source: 'ai' | 'rule';
  reason?: string;
}

export async function classifyBook(
  input: {
    title: string;
    author?: string;
    format: BookFormat;
    chapters?: string[];
    sampleText?: string;
  },
  ai: AISettings,
): Promise<ClassifyResult> {
  const fallback = guessCategoryByRules(input);
  if (!ai.apiKey.trim()) {
    return { category: fallback, source: 'rule' };
  }

  const chapterList = (input.chapters ?? []).slice(0, 15).join(' / ');
  const sample = (input.sampleText ?? '').replace(/\s+/g, ' ').slice(0, 900);
  const prompt = [
    `书名：${input.title}`,
    input.author ? `作者：${input.author}` : '',
    `格式：${input.format.toUpperCase()}`,
    chapterList ? `章节：${chapterList}` : '',
    sample ? `正文节选：${sample}` : '',
    '',
    `可选分类：${BOOK_CATEGORIES.join('、')}`,
    '请判断这本书最合适的分类，必须从上面的分类中选一个。',
    '只输出 JSON：{"category":"分类","reason":"不超过20字的理由"}',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const base = ai.baseUrl.trim().replace(/\/+$/, '');
    const data = await requestJson<ChatResponse>({
      url: `${base}/chat/completions`,
      headers: {
        Authorization: `Bearer ${ai.apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: ai.model || 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: '你是严谨的中文图书分类助手，只按用户给定的分类列表归类，并输出 JSON。',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 80,
        response_format: { type: 'json_object' },
        stream: false,
      },
      timeoutMs: 25_000,
    });

    const content = data.choices?.[0]?.message?.content ?? '';
    const match = content.match(/\{[\s\S]*\}/);
    const parsed = match ? (JSON.parse(match[0]) as { category?: string; reason?: string }) : {};
    const category = normalizeCategory(parsed.category);
    if (!category) throw new Error('无法识别的分类');
    return { category, source: 'ai', reason: parsed.reason };
  } catch {
    return { category: fallback, source: 'rule' };
  }
}
