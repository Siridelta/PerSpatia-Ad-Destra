import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ThemeColors {
  // 卡片颜色
  cardBackground: string;
  cardBorder: string;
  cardText: string;
  cardAccent: string;
  
  // 画布背景颜色
  canvasBackground: string;
  canvasGrid: string;
  
  // 文字颜色
  primaryText: string;
  secondaryText: string;
  accentText: string;
}

export interface ThemeFonts {
  primary: string;
  code: string;
  size: number;
}

interface SettingsStore {
  // 主题设置
  colors: ThemeColors;
  fonts: ThemeFonts;
  
  // 设置面板状态
  isSettingsPanelOpen: boolean;
  
  // 操作方法
  setColor: (key: keyof ThemeColors, value: string) => void;
  setFont: (key: keyof ThemeFonts, value: string | number) => void;
  resetToDefaults: () => void;
  toggleSettingsPanel: () => void;
  closeSettingsPanel: () => void;
}

// 默认主题配置
const defaultColors: ThemeColors = {
  cardBackground: 'rgba(9, 14, 28, 0.5)',
  cardBorder: 'rgba(125, 225, 234, 0.3)',
  cardText: '#ffffff',
  cardAccent: '#7de1ea',
  
  canvasBackground: '#0a0e1a',
  canvasGrid: 'rgba(125, 225, 234, 0.1)',
  
  primaryText: '#ffffff',
  secondaryText: 'rgba(125, 225, 234, 0.7)',
  accentText: '#7de1ea',
};

const defaultFonts: ThemeFonts = {
  primary: 'JetBrains Mono, monospace',
  code: 'JetBrains Mono, monospace',
  size: 14,
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      colors: defaultColors,
      fonts: defaultFonts,
      isSettingsPanelOpen: false,
      
      setColor: (key, value) =>
        set((state) => ({
          colors: { ...state.colors, [key]: value },
        })),
      
      setFont: (key, value) =>
        set((state) => ({
          fonts: { ...state.fonts, [key]: value },
        })),
      
      resetToDefaults: () =>
        set({
          colors: defaultColors,
          fonts: defaultFonts,
        }),
      
      toggleSettingsPanel: () =>
        set((state) => ({
          isSettingsPanelOpen: !state.isSettingsPanelOpen,
        })),
      
      closeSettingsPanel: () =>
        set({ isSettingsPanelOpen: false }),
    }),
    {
      name: 'julia-canvas-settings',
      version: 1,
    }
  )
); 