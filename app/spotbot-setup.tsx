import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import HowToPlayModal from '../src/components/HowToPlayModal';
import { SPOTBOT_HOW_TO_PLAY } from '../src/constants/howToPlay';

export default function SpotBotSetupScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const [name, setName] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const start = () => {
    router.push({ pathname: '/spotbot', params: { name: name.trim() || 'Player' } });
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <TouchableOpacity style={[s.backBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]} onPress={() => router.back()}>
            <Text style={[s.backText, { color: theme.text }]}>←</Text>
          </TouchableOpacity>
          <Text style={[s.title, { color: theme.text, fontFamily: theme.fontHandwritten }]}>Spot the Bot</Text>
          <TouchableOpacity style={[s.backBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]} onPress={() => setShowHelp(true)}>
            <Text style={[s.backText, { color: theme.text, fontSize: 18 }]}>?</Text>
          </TouchableOpacity>
        </View>

        <View style={[s.card, { backgroundColor: theme.p1Light, borderColor: theme.p1 }]}>
          <Text style={{ color: theme.p1, fontFamily: theme.fontRegular, fontSize: 15, lineHeight: 22 }}>
            🕵️  You'll play a quick round of tic-tac-toe against someone — could be a real
            person, could be a bot. Afterwards, guess which one it was!
          </Text>
        </View>

        <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Text style={[s.cardTitle, { color: theme.textMuted, fontFamily: theme.fontSemiBold }]}>Your Name</Text>
          <TextInput
            style={[s.input, { borderBottomColor: theme.p1, color: theme.text, fontFamily: theme.fontHandwritten }]}
            value={name} onChangeText={setName} placeholder="Enter your name…" placeholderTextColor={theme.border} maxLength={16}
          />
        </View>

        <TouchableOpacity style={[s.startBtn, { backgroundColor: theme.text }]} onPress={start} activeOpacity={0.82}>
          <Text style={[s.startBtnText, { color: theme.bg, fontFamily: theme.fontHandwritten }]}>Find Opponent →</Text>
        </TouchableOpacity>
      </ScrollView>
      {showHelp && (
        <HowToPlayModal title="Spot the Bot" steps={SPOTBOT_HOW_TO_PLAY} onClose={() => setShowHelp(false)} />
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
    title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
    card: { borderWidth: 1.5, borderRadius: 12, padding: 18, width: '100%' },
    cardTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
    input: { fontSize: 20, borderBottomWidth: 2, paddingVertical: 4, paddingHorizontal: 2, backgroundColor: 'transparent' },
    startBtn: { borderRadius: 10, paddingVertical: 14, paddingHorizontal: 48, marginTop: 8 },
    startBtnText: { fontSize: 24, fontWeight: '700', letterSpacing: 0.5 },
  });
}
