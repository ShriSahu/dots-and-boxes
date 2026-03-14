import { createContext, useContext } from 'react';
import type { ThemeName } from '../types/game.types';

export interface ThemeTokens {
  bg: string;
  bgCard: string;
  paperLine: string;
  marginLine: string;
  dot: string;
  dotShadow: string;
  p1: string;
  p2: string;
  p1Light: string;
  p2Light: string;
  text: string;
  textMuted: string;
  border: string;
  shadow: string;
  fontHandwritten: string;
  fontRegular: string;
  fontSemiBold: string;
}

export const THEMES: Record<ThemeName, ThemeTokens> = {
  parchment: {
    bg: '#f5f0e8',
    bgCard: 'rgba(255,252,245,0.92)',
    paperLine: 'rgba(160,150,120,0.35)',
    marginLine: 'rgba(200,80,80,0.22)',
    dot: '#2a2418',
    dotShadow: 'rgba(42,36,24,0.25)',
    p1: '#1a3a6b',
    p2: '#8b1a1a',
    p1Light: 'rgba(26,58,107,0.18)',
    p2Light: 'rgba(139,26,26,0.18)',
    text: '#2a2418',
    textMuted: '#7a6f5a',
    border: 'rgba(90,80,60,0.22)',
    shadow: 'rgba(42,36,24,0.12)',
    fontHandwritten: 'Caveat_700Bold',
    fontRegular: 'Caveat_400Regular',
    fontSemiBold: 'Caveat_600SemiBold',
  },
  neon: {
    bg: '#0a0a14',
    bgCard: 'rgba(20,20,40,0.95)',
    paperLine: 'rgba(0,212,255,0.08)',
    marginLine: 'rgba(255,0,110,0.15)',
    dot: '#e0e0ff',
    dotShadow: 'rgba(0,212,255,0.4)',
    p1: '#00d4ff',
    p2: '#ff006e',
    p1Light: 'rgba(0,212,255,0.15)',
    p2Light: 'rgba(255,0,110,0.15)',
    text: '#e0e0ff',
    textMuted: '#8080aa',
    border: 'rgba(0,212,255,0.25)',
    shadow: 'rgba(0,212,255,0.2)',
    fontHandwritten: 'Caveat_700Bold',
    fontRegular: 'Caveat_400Regular',
    fontSemiBold: 'Caveat_600SemiBold',
  },
  chalkboard: {
    bg: '#1a2e10',
    bgCard: 'rgba(26,46,16,0.96)',
    paperLine: 'rgba(245,245,200,0.08)',
    marginLine: 'rgba(255,138,101,0.18)',
    dot: '#f5f5dc',
    dotShadow: 'rgba(245,245,200,0.3)',
    p1: '#fff176',
    p2: '#ff8a65',
    p1Light: 'rgba(255,241,118,0.18)',
    p2Light: 'rgba(255,138,101,0.18)',
    text: '#f5f5dc',
    textMuted: '#aab890',
    border: 'rgba(245,245,200,0.2)',
    shadow: 'rgba(0,0,0,0.4)',
    fontHandwritten: 'Caveat_700Bold',
    fontRegular: 'Caveat_400Regular',
    fontSemiBold: 'Caveat_600SemiBold',
  },
  blueprint: {
    bg: '#002060',
    bgCard: 'rgba(0,30,100,0.96)',
    paperLine: 'rgba(255,255,255,0.08)',
    marginLine: 'rgba(255,204,0,0.18)',
    dot: '#e8f0ff',
    dotShadow: 'rgba(255,255,255,0.3)',
    p1: '#ffffff',
    p2: '#ffcc00',
    p1Light: 'rgba(255,255,255,0.15)',
    p2Light: 'rgba(255,204,0,0.18)',
    text: '#e8f0ff',
    textMuted: '#8899cc',
    border: 'rgba(255,255,255,0.2)',
    shadow: 'rgba(0,0,0,0.5)',
    fontHandwritten: 'Caveat_700Bold',
    fontRegular: 'Caveat_400Regular',
    fontSemiBold: 'Caveat_600SemiBold',
  },
};

export const THEME_META: Record<ThemeName, { label: string; cost: number; emoji: string }> = {
  parchment:  { label: 'Parchment',  cost: 0,   emoji: '📜' },
  neon:       { label: 'Neon',       cost: 150,  emoji: '💡' },
  chalkboard: { label: 'Chalkboard', cost: 200,  emoji: '🖊️' },
  blueprint:  { label: 'Blueprint',  cost: 250,  emoji: '📐' },
};

export interface ThemeContextValue {
  themeName: ThemeName;
  theme: ThemeTokens;
  setTheme: (name: ThemeName) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  themeName: 'parchment',
  theme: THEMES.parchment,
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}
