import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import HowToPlayModal from '../src/components/HowToPlayModal';
import { HEX_HOW_TO_PLAY } from '../src/constants/howToPlay';
import type { HexBoardSize, HexConfig, HexMode } from '../src/types/hex.types';

const SIZES: HexBoardSize[] = [9, 11, 13];

export default function HexSetupScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [mode, setMode]     = useState<HexMode>('2player');
  const [p1Name, setP1Name] = useState('');
  const [p2Name, setP2Name] = useState('');
  const [boardSize, setBoardSize] = useState<HexBoardSize>(11);
  const [showHelp, setShowHelp] = useState(false);

  const startGame = () => {
    if (mode === 'online') {
      router.push('/hex-lobby');
      return;
    }
    const config: HexConfig = {
      mode,
      p1Name: p1Name.trim() || 'Player 1',
      p2Name: mode === 'ai' ? 'AI Bot' : (p2Name.trim() || 'Player 2'),
      boardSize,
    };
    router.push({ pathname: '/hex', params: { config: JSON.stringify(config) } });
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <TouchableOpacity style={[s.backBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]} onPress={() => router.back()}>
            <Text style={[s.backText, { color: theme.text }]}>←</Text>
          </TouchableOpacity>
          <Text style={[s.title, { color: theme.text, fontFamily: theme.fontHandwritten }]}>Hex</Text>
          <TouchableOpacity style={[s.backBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]} onPress={() => setShowHelp(true)}>
            <Text style={[s.backText, { color: theme.text, fontSize: 18 }]}>?</Text>
          </TouchableOpacity>
        </View>

        <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Text style={[s.cardTitle, { color: theme.textMuted, fontFamily: theme.fontSemiBold }]}>Game Mode</Text>
          <View style={s.row}>
            {(['2player', 'ai', 'online'] as HexMode[]).map(m => {
              const label = m === '2player' ? '2 Players' : m === 'ai' ? 'vs AI' : 'Online';
              const icon  = m === '2player' ? '👥' : m === 'ai' ? '🤖' : '🌐';
              return (
                <TouchableOpacity
                  key={m}
                  style={[s.modeBtn, { borderColor: theme.border }, mode === m && { borderColor: theme.p1, backgroundColor: theme.p1Light }]}
                  onPress={() => setMode(m)}
                >
                  <Text style={s.modeIcon}>{icon}</Text>
                  <Text style={[s.modeText, { color: mode === m ? theme.p1 : theme.text, fontFamily: theme.fontSemiBold }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {mode !== 'online' && (
          <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <Text style={[s.cardTitle, { color: theme.textMuted, fontFamily: theme.fontSemiBold }]}>Player Names</Text>
            <Text style={[s.inputLabel, { color: theme.p1 }]}>Player 1 (top ↕ bottom)</Text>
            <TextInput
              style={[s.input, { borderBottomColor: theme.p1, color: theme.text, fontFamily: theme.fontHandwritten }]}
              value={p1Name} onChangeText={setP1Name} placeholder="Your name…" placeholderTextColor={theme.border} maxLength={16}
            />
            <View style={{ height: 12 }} />
            <Text style={[s.inputLabel, { color: mode === 'ai' ? theme.textMuted : theme.p2 }]}>
              {mode === 'ai' ? 'AI Opponent (left ↔ right)' : 'Player 2 (left ↔ right)'}
            </Text>
            <TextInput
              style={[s.input, { borderBottomColor: theme.p2, color: theme.text, fontFamily: theme.fontHandwritten, opacity: mode === 'ai' ? 0.5 : 1 }]}
              value={mode === 'ai' ? 'AI Bot 🤖' : p2Name} onChangeText={setP2Name}
              placeholder="Opponent's name…" placeholderTextColor={theme.border} maxLength={16}
              editable={mode !== 'ai'}
            />
          </View>
        )}

        {mode !== 'online' && (
          <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <Text style={[s.cardTitle, { color: theme.textMuted, fontFamily: theme.fontSemiBold }]}>Board Size</Text>
            <View style={s.row}>
              {SIZES.map(sz => (
                <TouchableOpacity
                  key={sz}
                  style={[s.diffBtn, { borderColor: theme.border }, boardSize === sz && { borderColor: theme.p2, backgroundColor: theme.p2Light }]}
                  onPress={() => setBoardSize(sz)}
                >
                  <Text style={[s.modeText, { color: boardSize === sz ? theme.p2 : theme.text, fontFamily: theme.fontSemiBold }]}>{sz}×{sz}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {mode === 'online' && (
          <View style={[s.card, { backgroundColor: theme.p1Light, borderColor: theme.p1 }]}>
            <Text style={{ color: theme.p1, fontFamily: theme.fontRegular, fontSize: 15, lineHeight: 22 }}>
              🌐  Online Hex rooms use an 11×11 board. You'll set your name in the next screen.
            </Text>
          </View>
        )}

        <TouchableOpacity style={[s.startBtn, { backgroundColor: theme.text }]} onPress={startGame} activeOpacity={0.82}>
          <Text style={[s.startBtnText, { color: theme.bg, fontFamily: theme.fontHandwritten }]}>Start Game →</Text>
        </TouchableOpacity>
      </ScrollView>
      {showHelp && (
        <HowToPlayModal title="Hex" steps={HEX_HOW_TO_PLAY} onClose={() => setShowHelp(false)} />
      )}
    </SafeAreaView>
  );
}

function makeStyles(theme: any) {
  return StyleSheet.create({
    safe: { flex: 1 },
    scroll: { alignItems: 'center', padding: 20, gap: 14 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 4 },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1.5 },
    backText: { fontSize: 24, fontWeight: '700' },
    title: { fontSize: 26, fontWeight: '700', textAlign: 'center' },
    card: { borderWidth: 1.5, borderRadius: 12, padding: 18, width: '100%' },
    cardTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
    row: { flexDirection: 'row', gap: 8 },
    modeBtn: { flex: 1, alignItems: 'center', padding: 12, borderWidth: 2, borderRadius: 10, gap: 4 },
    modeIcon: { fontSize: 26 },
    modeText: { fontSize: 15, fontWeight: '600' },
    diffBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderWidth: 2, borderRadius: 10 },
    inputLabel: { fontFamily: 'Caveat_400Regular', fontSize: 14, marginBottom: 2 },
    input: { fontSize: 20, borderBottomWidth: 2, paddingVertical: 4, paddingHorizontal: 2, backgroundColor: 'transparent' },
    startBtn: { borderRadius: 10, paddingVertical: 14, paddingHorizontal: 48, marginTop: 8 },
    startBtnText: { fontSize: 26, fontWeight: '700', letterSpacing: 0.5 },
  });
}
