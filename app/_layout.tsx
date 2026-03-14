import { Stack } from 'expo-router';
import {
  useFonts,
  Caveat_400Regular,
  Caveat_600SemiBold,
  Caveat_700Bold,
} from '@expo-google-fonts/caveat';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeContext, THEMES, ThemeTokens } from '../src/hooks/useTheme';
import type { ThemeName } from '../src/types/game.types';

SplashScreen.preventAutoHideAsync();

const THEME_KEY = 'db_active_theme';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Caveat_400Regular,
    Caveat_600SemiBold,
    Caveat_700Bold,
  });

  const [themeName, setThemeNameState] = useState<ThemeName>('parchment');
  const [themeLoaded, setThemeLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(val => {
      if (val && val in THEMES) setThemeNameState(val as ThemeName);
      setThemeLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (fontsLoaded && themeLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded, themeLoaded]);

  const setTheme = (name: ThemeName) => {
    setThemeNameState(name);
    AsyncStorage.setItem(THEME_KEY, name);
  };

  if (!fontsLoaded || !themeLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#f5f0e8' }} />;
  }

  const theme: ThemeTokens = THEMES[themeName];

  return (
    <ThemeContext.Provider value={{ themeName, theme, setTheme }}>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.bg },
          animation: 'fade',
        }}
      />
    </ThemeContext.Provider>
  );
}
