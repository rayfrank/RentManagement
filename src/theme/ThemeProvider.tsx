import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeName = 'pearl' | 'sage' | 'sunset';

export type ThemePalette = {
  ink: string;
  muted: string;
  canvas: string;
  surface: string;
  line: string;
  brand: string;
  brandDark: string;
  brandPale: string;
  amber: string;
  amberPale: string;
  red: string;
  redPale: string;
  bluePale: string;
  glowOne: string;
  glowTwo: string;
};

export const themes: Record<ThemeName, { label: string; palette: ThemePalette }> = {
  pearl: {
    label: 'Pearl',
    palette: {
      ink: '#17212B', muted: '#65717E', canvas: '#C9D3DA', surface: '#FFFFFF', line: '#D9E5EE',
      brand: '#1677FF', brandDark: '#0756BD', brandPale: '#E2F0FF', amber: '#C77718', amberPale: '#FFF1D8',
      red: '#C14454', redPale: '#FCE7EA', bluePale: '#DFEEFF', glowOne: '#A9D8FF', glowTwo: '#DCC8FF',
    },
  },
  sage: {
    label: 'Sage',
    palette: {
      ink: '#172622', muted: '#687670', canvas: '#CBD5CF', surface: '#FFFFFF', line: '#D9E6DE',
      brand: '#176B52', brandDark: '#0C4B39', brandPale: '#DFF2E8', amber: '#C57A22', amberPale: '#FFF1D9',
      red: '#B84A43', redPale: '#FBE7E5', bluePale: '#E4EEF9', glowOne: '#A9E5CA', glowTwo: '#D7E7A8',
    },
  },
  sunset: {
    label: 'Sunset',
    palette: {
      ink: '#2D2224', muted: '#7A686B', canvas: '#D8CDCA', surface: '#FFFFFF', line: '#ECDDD8',
      brand: '#E35D49', brandDark: '#A63C31', brandPale: '#FFE5DF', amber: '#C66A22', amberPale: '#FFF0D7',
      red: '#B63C4B', redPale: '#FBE5E8', bluePale: '#E9EEFF', glowOne: '#FFC0A8', glowTwo: '#FFD6E7',
    },
  },
};

type ThemeContextValue = {
  theme: ThemeName;
  palette: ThemePalette;
  transparency: number;
  setTheme: (theme: ThemeName) => void;
  setTransparency: (transparency: number) => void;
};

const STORAGE_KEY = 'rentflow.theme';
const TRANSPARENCY_STORAGE_KEY = 'rentflow.transparency';
const ThemeContext = createContext<ThemeContextValue | null>(null);

const withOpacity = (hex: string, opacity: number) => {
  const value = hex.replace('#', '').slice(0, 6);
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity.toFixed(2)})`;
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>('pearl');
  const [transparency, setTransparencyState] = useState(0.58);

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(TRANSPARENCY_STORAGE_KEY)]).then(([savedTheme, savedTransparency]) => {
      if (savedTheme && savedTheme in themes) setThemeState(savedTheme as ThemeName);
      const parsedTransparency = Number(savedTransparency);
      if (Number.isFinite(parsedTransparency)) setTransparencyState(Math.min(0.95, Math.max(0.35, parsedTransparency)));
    }).catch(() => undefined);
  }, []);

  const palette = useMemo<ThemePalette>(() => {
    const base = themes[theme].palette;
    return {
      ...base,
      surface: withOpacity(base.surface, transparency),
      line: withOpacity(base.line, Math.min(transparency + 0.22, 1)),
    };
  }, [theme, transparency]);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    palette,
    transparency,
    setTheme: (nextTheme) => {
      setThemeState(nextTheme);
      AsyncStorage.setItem(STORAGE_KEY, nextTheme).catch(() => undefined);
    },
    setTransparency: (nextTransparency) => {
      const clamped = Math.min(0.95, Math.max(0.35, nextTransparency));
      setTransparencyState(clamped);
      AsyncStorage.setItem(TRANSPARENCY_STORAGE_KEY, String(clamped)).catch(() => undefined);
    },
  }), [palette, theme, transparency]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider.');
  return context;
}
