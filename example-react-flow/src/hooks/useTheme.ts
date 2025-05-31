import { useEffect } from 'react';
import { useSettingsStore } from '../store/settingsStore';

/**
 * 主题应用Hook - 将设置store中的主题应用到CSS变量
 */
export const useTheme = () => {
  const { colors, fonts } = useSettingsStore();

  useEffect(() => {
    const root = document.documentElement;
    
    // 应用颜色设置到CSS变量
    root.style.setProperty('--card-background', colors.cardBackground);
    root.style.setProperty('--card-border', colors.cardBorder);
    root.style.setProperty('--card-text', colors.cardText);
    root.style.setProperty('--card-accent', colors.cardAccent);
    
    root.style.setProperty('--canvas-background', colors.canvasBackground);
    root.style.setProperty('--canvas-grid', colors.canvasGrid);
    
    root.style.setProperty('--primary-text', colors.primaryText);
    root.style.setProperty('--secondary-text', colors.secondaryText);
    root.style.setProperty('--accent-text', colors.accentText);
    
    // 应用字体设置到CSS变量
    root.style.setProperty('--font-primary', fonts.primary);
    root.style.setProperty('--font-code', fonts.code);
    root.style.setProperty('--font-size', `${fonts.size}px`);
    
  }, [colors, fonts]);

  return { colors, fonts };
}; 