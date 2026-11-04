import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AISettings, ReaderPrefs } from '../types';

export const DEFAULT_PREFS: ReaderPrefs = {
  fontFamily: 'serif',
  fontSize: 19,
  lineHeight: 1.85,
  paragraphSpacing: 0.9,
  margin: 22,
  themeId: 'paper',
  pageMode: 'paginated',
  volumeKeys: true,
  showSettingsOnOpen: true,
};

export const DEFAULT_AI: AISettings = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  // Bing is the default search backend; the key still has to be provided.
  searchProvider: 'bing',
  searchKey: '',
  contextChars: 1200,
  temperature: 0.6,
  autoClassify: true,
};

interface SettingsState {
  prefs: ReaderPrefs;
  ai: AISettings;
  setPrefs: (patch: Partial<ReaderPrefs>) => void;
  resetPrefs: () => void;
  setAI: (patch: Partial<AISettings>) => void;
}

interface PersistedSettings {
  prefs?: Partial<ReaderPrefs>;
  ai?: Partial<AISettings>;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      prefs: DEFAULT_PREFS,
      ai: DEFAULT_AI,
      setPrefs: (patch) => set((s) => ({ prefs: { ...s.prefs, ...patch } })),
      resetPrefs: () => set({ prefs: DEFAULT_PREFS }),
      setAI: (patch) => set((s) => ({ ai: { ...s.ai, ...patch } })),
    }),
    {
      name: 'modu-settings',
      version: 3,
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as PersistedSettings;
        const ai = { ...DEFAULT_AI, ...(state.ai ?? {}) };
        const prefs = { ...DEFAULT_PREFS, ...(state.prefs ?? {}) };
        if (version < 2) {
          // v2 introduces Bing as the default search backend and auto-classify.
          if (state.ai?.searchProvider === 'none') ai.searchProvider = 'bing';
          ai.autoClassify = state.ai?.autoClassify ?? true;
        }
        return { prefs, ai } as SettingsState;
      },
    },
  ),
);
