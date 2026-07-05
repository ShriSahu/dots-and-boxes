import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Pressable, useWindowDimensions, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useTheme } from '../src/hooks/useTheme';
import { initAudio, playSound } from '../src/services/audio';
import { useHexEngine } from '../src/hooks/useHexEngine';
import HexBoard from '../src/components/HexBoard';
import type { HexConfig, HexResult } from '../src/types/hex.types';
import { getAnonymousUid } from '../src/services/firebase';
import { awardCoins } from '../src/services/coins';

export default function HexGameScreen() {
  const params = useLocalSearchParams<{ config: string }>();
  const config: HexConfig = JSON.parse(params.config as string);
  const { theme } = useTheme();
  const { width } = useWindowDimensions();

  const [toast, setToast]   = useState<{ text: string; color: string } | null>(null);
  const [result, setResult] = useState<HexResult | null>(null);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevGameOver = useRef(false);
  const coinsAwarded = useRef(false);
  const confettiRef  = useRef<any>(null);

  const s = makeStyles(theme);

  useEffect(() => { initAudio(); }, []);

  const showToast = useCallback((text: string, color: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, color });
    toastOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(toastOpacity, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start(() => { toastTimer.current = setTimeout(() => setToast(null), 50); });
  }, [toastOpacity]);

  const { state, isAIThinking, playMove, resetGame } = useHexEngine(config, {
    onMove: () => playSound('click'),
    onTurnSwitch: (next) => {
      if (config.mode === '2player') {
        const name = next === 1 ? config.p1Name : config.p2Name;
        const color = next === 1 ? theme.p1 : theme.p2;
        showToast(`${name}'s turn`, color);
      }
    },
  });

  useEffect(() => {
    if (state.isGameOver && !prevGameOver.current) {
      prevGameOver.current = true;
      const winner: HexResult['winner'] = state.winner === 1 ? 'p1' : 'p2';
      setResult({ winner, p1Name: config.p1Name, p2Name: config.p2Name });
      playSound('win');
      setTimeout(() => confettiRef.current?.start(), 200);

      if (config.mode === 'ai' && !coinsAwarded.current) {
        coinsAwarded.current = true;
        const delta = winner === 'p1' ? 10 : 1;
        const reason: 'win' | 'participation' = winner === 'p1' ? 'win' : 'participation';
        setCoinsEarned(delta);
        getAnonymousUid().then(uid => awardCoins(uid, delta, reason, null));
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    if (!state.isGameOver) { prevGameOver.current = false; coinsAwarded.current = false; }
  }, [state.isGameOver]); // eslint-disable-line

  const handleCellTap = (row: number, col: number) => {
    if (isAIThinking || state.isGameOver) return;
    if (config.mode === 'ai' && state.currentPlayer === 2) return;
    Haptics.selectionAsync();
    playMove({ row, col });
  };

  const handleNewGame = () => { setResult(null); resetGame(); };

  const handleShare = useCallback(() => {
    if (!result) return;
    const winner = result.winner === 'p1' ? result.p1Name : result.p2Name;
    Share.share({ message: `${winner} connected their sides to win Hex! 🔷` });
  }, [result]);

  const boardDisabled = isAIThinking || state.isGameOver || (config.mode === 'ai' && state.currentPlayer === 2);
  const turnName  = state.currentPlayer === 1 ? config.p1Name : config.p2Name;
  const turnColor = state.currentPlayer === 1 ? theme.p1 : theme.p2;

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]}>
      <View style={s.header}>
        <TouchableOpacity style={[s.iconBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]} onPress={() => router.back()}>
          <Text style={[s.iconBtnText, { color: theme.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text, fontFamily: theme.fontHandwritten }]}>Hex</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={[s.statusWrap, { borderColor: theme.border, backgroundColor: theme.bgCard }]}>
        <Text style={[s.statusHeadline, { color: state.isGameOver ? theme.text : turnColor, fontFamily: theme.fontSemiBold }]}>
          {state.isGameOver ? 'Game over' : isAIThinking ? `${config.p2Name} is thinking…` : `${turnName}'s turn`}
        </Text>
        <Text style={[s.statusSubline, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
          {config.p1Name} connects top ↕ bottom · {config.p2Name} connects left ↔ right
        </Text>
      </View>

      <View style={s.boardWrap}>
        <HexBoard state={state} onCellTap={handleCellTap} disabled={boardDisabled} />
      </View>

      {toast && (
        <Animated.View pointerEvents="none" style={[s.toast, { opacity: toastOpacity, borderColor: toast.color, backgroundColor: theme.bgCard }]}>
          <Text style={[s.toastText, { color: toast.color, fontFamily: theme.fontSemiBold }]}>{toast.text}</Text>
        </Animated.View>
      )}

      {result && (
        <Pressable style={[s.overlay, { backgroundColor: 'rgba(42,36,24,0.55)' }]}>
          <View style={[s.resultCard, { backgroundColor: theme.bg, borderColor: theme.border, shadowColor: theme.text }]}>
            <Text style={s.resultEmoji}>🔷</Text>
            <Text style={[s.resultTitle, { color: theme.text, fontFamily: theme.fontHandwritten }]}>
              {result.winner === 'p1' ? result.p1Name : result.p2Name} Wins!
            </Text>
            {config.mode === 'ai' && coinsEarned > 0 && (
              <Text style={{ color: theme.textMuted, fontFamily: theme.fontRegular, fontSize: 16 }}>
                🪙 +{coinsEarned} coins earned
              </Text>
            )}
            <TouchableOpacity style={[s.resultBtnSecondary, { borderColor: theme.border }]} onPress={handleShare}>
              <Text style={[s.resultBtnSecondaryText, { color: theme.textMuted, fontFamily: theme.fontSemiBold }]}>Share Result</Text>
            </TouchableOpacity>
            <View style={s.resultBtns}>
              <TouchableOpacity style={[s.resultBtnSecondary, { borderColor: theme.border }]} onPress={() => router.back()}>
                <Text style={[s.resultBtnSecondaryText, { color: theme.textMuted, fontFamily: theme.fontSemiBold }]}>← Menu</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.resultBtnPrimary, { backgroundColor: theme.text, shadowColor: theme.text }]} onPress={handleNewGame} activeOpacity={0.82}>
                <Text style={[s.resultBtnPrimaryText, { color: theme.bg, fontFamily: theme.fontHandwritten }]}>Play Again →</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      )}

      <View pointerEvents="none" style={{ position: 'absolute', width: '100%', height: '100%' }}>
        <ConfettiCannon
          ref={confettiRef} count={120} origin={{ x: width / 2, y: -20 }} autoStart={false} fadeOut
          colors={[theme.p1, theme.p2, '#f5c842', '#4ECDC4', '#ffffff']} fallSpeed={3500}
        />
      </View>
    </SafeAreaView>
  );
}

function makeStyles(theme: any) {
  return StyleSheet.create({
    safe: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
    headerTitle: { fontSize: 26, fontWeight: '700' },
    iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1.5 },
    iconBtnText: { fontSize: 22, fontWeight: '700' },
    statusWrap: { marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1.5 },
    statusHeadline: { fontSize: 17, fontWeight: '600' },
    statusSubline: { marginTop: 2, fontSize: 12 },
    boardWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    toast: { position: 'absolute', bottom: 48, alignSelf: 'center', borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 9 },
    toastText: { fontSize: 17, fontWeight: '600' },
    overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    resultCard: {
      borderRadius: 20, borderWidth: 2, padding: 28, width: '82%', alignItems: 'center', gap: 10,
      shadowOffset: { width: 4, height: 6 }, shadowOpacity: 0.18, shadowRadius: 0, elevation: 12,
    },
    resultEmoji: { fontSize: 52, lineHeight: 60 },
    resultTitle: { fontSize: 30, fontWeight: '700', textAlign: 'center' },
    resultBtns: { flexDirection: 'row', gap: 12, marginTop: 16 },
    resultBtnSecondary: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, borderWidth: 2 },
    resultBtnSecondaryText: { fontSize: 17, fontWeight: '600' },
    resultBtnPrimary: {
      paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10,
      shadowOffset: { width: 3, height: 4 }, shadowOpacity: 0.25, shadowRadius: 0, elevation: 4,
    },
    resultBtnPrimaryText: { fontSize: 20, fontWeight: '700' },
  });
}
