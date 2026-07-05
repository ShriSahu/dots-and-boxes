import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';

interface ArcadeGame {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  route: string;
  available: boolean;
}

const GAMES: ArcadeGame[] = [
  {
    id: 'dots-and-boxes',
    title: 'Dots & Boxes',
    subtitle: 'The classic pen & paper game',
    icon: '⬜',
    route: '/',
    available: true,
  },
  {
    id: 'ttt',
    title: 'Ultimate Tic-Tac-Toe',
    subtitle: '9 boards, one meta-game',
    icon: '⭕',
    route: '/ttt-setup',
    available: true,
  },
  {
    id: 'hex',
    title: 'Hex',
    subtitle: 'Connect your sides to win',
    icon: '⬡',
    route: '/hex-setup',
    available: true,
  },
  {
    id: 'spotbot',
    title: 'Spot the Bot',
    subtitle: 'Human or AI? Guess right.',
    icon: '🕵️',
    route: '/spotbot-setup',
    available: true,
  },
];

export default function ArcadeScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.header}>
          <TouchableOpacity style={[s.backBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]} onPress={() => router.back()}>
            <Text style={[s.backText, { color: theme.text }]}>←</Text>
          </TouchableOpacity>
          <View style={{ width: 44 }} />
        </View>

        <Text style={[s.title, { color: theme.text, fontFamily: theme.fontHandwritten }]}>Logic Arcade</Text>
        <Text style={[s.subtitle, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>Pick a game</Text>

        {GAMES.map(game => (
          <TouchableOpacity
            key={game.id}
            style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border, opacity: game.available ? 1 : 0.5 }]}
            onPress={() => game.available && router.push(game.route as any)}
            disabled={!game.available}
            activeOpacity={0.82}
          >
            <Text style={s.icon}>{game.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.cardTitle, { color: theme.text, fontFamily: theme.fontSemiBold }]}>{game.title}</Text>
              <Text style={[s.cardSubtitle, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
                {game.available ? game.subtitle : 'Coming soon'}
              </Text>
            </View>
            {game.available && <Text style={[s.chevron, { color: theme.textMuted }]}>→</Text>}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme: any) {
  return StyleSheet.create({
    safe: { flex: 1 },
    scroll: { padding: 20, gap: 14 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1.5 },
    backText: { fontSize: 24, fontWeight: '700' },
    title: { fontSize: 44, fontWeight: '700', textAlign: 'center', marginTop: 8 },
    subtitle: { fontSize: 16, textAlign: 'center', marginBottom: 8 },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 16,
      borderWidth: 1.5, borderRadius: 16, padding: 18,
      shadowOffset: { width: 2, height: 3 }, shadowOpacity: 1, shadowRadius: 8, elevation: 2,
    },
    icon: { fontSize: 36 },
    cardTitle: { fontSize: 19, fontWeight: '600' },
    cardSubtitle: { fontSize: 13, marginTop: 2 },
    chevron: { fontSize: 20 },
  });
}
