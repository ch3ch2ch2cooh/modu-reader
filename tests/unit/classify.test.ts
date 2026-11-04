import { describe, expect, it } from 'vitest';
import {
  BOOK_CATEGORIES,
  classifyBook,
  guessCategoryByRules,
  normalizeCategory,
} from '../../src/ai/classify';
import { DEFAULT_AI } from '../../src/store/settings';

describe('book classification', () => {
  it('matches common Chinese subjects by keyword', () => {
    expect(guessCategoryByRules({ title: 'Python 编程从入门到实践' })).toBe('计算机');
    expect(guessCategoryByRules({ title: '中国近代史' })).toBe('历史');
    expect(guessCategoryByRules({ title: '聪明的投资者' })).toBe('经济');
    expect(guessCategoryByRules({ title: '苏东坡传' })).toBe('传记');
    expect(guessCategoryByRules({ title: '宇宙简史' })).toBe('科普');
    expect(guessCategoryByRules({ title: '科幻小说选集' })).toBe('小说');
  });

  it('falls back to 其他 for unknown books', () => {
    expect(guessCategoryByRules({ title: 'ZZZ Unknown Title' })).toBe('其他');
  });

  it('normalizes AI synonyms to the fixed taxonomy', () => {
    expect(normalizeCategory('科幻小说')).toBe('小说');
    expect(normalizeCategory('编程')).toBe('计算机');
    expect(normalizeCategory('个人成长')).toBe('心理');
    expect(normalizeCategory('历史类')).toBe('历史');
    expect(normalizeCategory('乱七八糟')).toBeNull();
    for (const category of BOOK_CATEGORIES) {
      expect(normalizeCategory(category)).toBe(category);
    }
  });

  it('uses the local rule when no API key is configured', async () => {
    const result = await classifyBook(
      { title: '算法导论', format: 'pdf' },
      { ...DEFAULT_AI, apiKey: '' },
    );
    expect(result.source).toBe('rule');
    expect(result.category).toBe('计算机');
  });
});
