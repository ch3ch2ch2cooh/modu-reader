import type { ThemeId } from '../types';

export interface Theme {
  id: ThemeId;
  name: string;
  bg: string;
  fg: string;
  muted: string;
  ui: string;
  border: string;
  isDark: boolean;
}

export const THEMES: Record<ThemeId, Theme> = {
  paper: {
    id: 'paper',
    name: '纸白',
    bg: '#f7f4ed',
    fg: '#26231f',
    muted: '#8c857a',
    ui: '#fffdf8',
    border: 'rgba(38,35,31,0.08)',
    isDark: false,
  },
  sepia: {
    id: 'sepia',
    name: '米黄',
    bg: '#f3e7cf',
    fg: '#493a28',
    muted: '#95805f',
    ui: '#fbf2e1',
    border: 'rgba(73,58,40,0.1)',
    isDark: false,
  },
  green: {
    id: 'green',
    name: '护眼',
    bg: '#e2ebdc',
    fg: '#2f3a2c',
    muted: '#6f7d68',
    ui: '#eef5e9',
    border: 'rgba(47,58,44,0.1)',
    isDark: false,
  },
  gray: {
    id: 'gray',
    name: '灰白',
    bg: '#eaeae8',
    fg: '#2b2b2b',
    muted: '#7c7c78',
    ui: '#f4f4f2',
    border: 'rgba(43,43,43,0.09)',
    isDark: false,
  },
  night: {
    id: 'night',
    name: '夜间',
    bg: '#1c1c1e',
    fg: '#c9c6be',
    muted: '#85827a',
    ui: '#242426',
    border: 'rgba(255,255,255,0.1)',
    isDark: true,
  },
  black: {
    id: 'black',
    name: '纯黑',
    bg: '#000000',
    fg: '#b6b3ab',
    muted: '#6f6d68',
    ui: '#101010',
    border: 'rgba(255,255,255,0.08)',
    isDark: true,
  },
};

export const FONT_STACKS = {
  serif: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif',
  sans: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  kai: '"LXGW WenKai", "Kaiti SC", "STKaiti", "KaiTi", serif',
} as const;

export const FONT_LABELS = {
  serif: '宋体',
  sans: '黑体',
  kai: '楷体',
} as const;

export const HIGHLIGHT_COLORS = {
  yellow: '#f2c14e',
  green: '#7cba8a',
  blue: '#6f9fd8',
  pink: '#d98aa6',
} as const;
