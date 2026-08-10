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
      ink: '#17212B', muted: '#65717E', canvas: '#EFF6FC', surface: '#FFFFFFE8', line: '#D9E5EE',
      brand: '#1677FF', brandDark: '#0756BD', brandPale: '#E2F0FF', amber: '#C77718', amberPale: '#FFF1D8',
      red: '#C14454', redPale: '#FCE7EA', bluePale: '#DFEEFF', glowOne: '#A9D8FF', glowTwo: '#DCC8FF',
    },
  },
  sage: {
    label: 'Sage',
    palette: {
      ink: '#172622', muted: '#687670', canvas: '#F1F6F2', surface: '#FFFFFFE8', line: '#D9E6DE',
      brand: '#176B52', brandDark: '#0C4B39', brandPale: '#DFF2E8', amber: '#C57A22', amberPale: '#FFF1D9',
      red: '#B84A43', redPale: '#FBE7E5', bluePale: '#E4EEF9', glowOne: '#A9E5CA', glowTwo: '#D7E7A8',
    },
  },
  sunset: {
    label: 'Sunset',
    palette: {
      ink: '#2D2224', muted: '#7A686B', canvas: '#FFF4F0', surface: '#FFFFFFE8', line: '#ECDDD8',
      brand: '#E35D49', brandDark: '#A63C31', brandPale: '#FFE5DF', amber: '#C66A22', amberPale: '#FFF0D7',
      red: '#B63C4B', redPale: '#FBE5E8', bluePale: '#E9EEFF', glowOne: '#FFC0A8', glowTwo: '#FFD6E7',
    },
  },
};

type ThemeContextValue = {
  theme: ThemeName;
  palette: ThemePalette;
  setTheme: (theme: ThemeName) => void;
};

const STORAGE_KEY = 'rentflow.theme';
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>('pearl');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved && saved in themes) setThemeState(saved as ThemeName);
    }).catch(() => undefined);
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    palette: themes[theme].palette,
    setTheme: (nextTheme) => {
      setThemeState(nextTheme);
      AsyncStorage.setItem(STORAGE_KEY, nextTheme).catch(() => undefined);
    },
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider.');
  return context;
}
