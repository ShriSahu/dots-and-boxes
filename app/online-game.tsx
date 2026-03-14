import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, Animated, Pressable, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../src/hooks/useTheme';
import { useOnlineGame } from '../src/hooks/useOnlineGame';
import GameBoard from '../src/components/GameBoard';
import ScoreBar from '../src/components/ScoreBar';
import { awardCoins } from '../src/services/coins';
import type { GameConfig, GameResult, LineId, GridSize } from '../src/types/game.types';

export default function OnlineGameScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{
    roomCode: string;
    isHost: string;
    myUid: string;
    gridSize: string;
  }>();

  const roomCode = params.roomCode as string;
  const isHost   = params.isHost === 'true';
  const myUid    = params.myUid as string;
  const gridSize = (parseInt(params.gridSize ?? '4', 10)) as GridSize;

  const [toast, setToast]             = useState<{ text: string; color: string } | null>(null);
  const [result, setResult]           = useState<GameResult | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [rematchWaiting, setRematchWaiting] = useState(false);
  const [coinsEarned, setCoinsEarned] = useState(0);

  const toastOpacity  = useRef(new Animated.Value(0)).current;
  const coinAnim      = useRef(new Animated.Value(0)).current;
  const toastTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevGameOver  = useRef(false);
  const coinsAwarded  = useRef(false);

  const showToast = useCallback((text: string, color: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, color });
    toastOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(1400),
      Animated.timing(toastOpacity, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start(() => {
      toastTimer.current = setTimeout(() => setToast(null), 50);
    });
  }, [toastOpacity]);

  const { room, state, isMyTurn, isSubmitting, opponentName, myName, drawLine, abandon, requestRematch } =
    useOnlineGame(roomCode, myUid, isHost, gridSize, {
      onBoxClaimed: (count, player) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const name  = player === 1 ? (isHost ? myName : opponentName) : (isHost ? opponentName : myName);
        const color = player === 1 ? theme.p1 : theme.p2;
        showToast(`${name} +${count} box${count > 1 ? 'es' : ''}!`, color);
      },
      onTurnSwitch: () => {
        const nextName  = room?.currentPlayerUid === myUid ? myName : opponentName;
        const nextColor = room?.currentPlayerUid === (isHost ? room?.host.uid : room?.guest.uid)
          ? theme.p1 : theme.p2;
        showToast(`${nextName}'s turn`, nextColor);
      },
      onOpponentDisconnected: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setDisconnected(true);
      },
    });

  // Build config for GameBoard / ScoreBar
  const config: GameConfig = {
    mode: 'online',
    gridSize,
    p1Name: room?.host.name  ?? 'Player 1',
    p2Name: room?.guest.name ?? 'Player 2',
    difficulty: 'medium',
    timerSeconds: 0,
  };

  // ── Game over ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (state.isGameOver && !prevGameOver.current) {
      prevGameOver.current = true;
      const { scores } = state;
      const winner: GameResult['winner'] =
        scores.p1 > scores.p2 ? 'p1' :
        scores.p2 > scores.p1 ? 'p2' : 'draw';

      setResult({ winner, scores, p1Name: config.p1Name, p2Name: config.p2Name });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Award coins
      if (!coinsAwarded.current && myUid) {
        coinsAwarded.current = true;
        const myPlayer = isHost ? 'p1' : 'p2';
        let delta = 1; // participation
        let reason: 'win' | 'draw' | 'participation' = 'participation';
        if (winner === myPlayer)       { delta = 25; reason = 'win'; }
        else if (winner === 'draw')    { delta = 3;  reason = 'draw'; }

        setCoinsEarned(delta);
        awardCoins(myUid, delta, reason, roomCode);

        // Float coin animation
        coinAnim.setValue(0);
        Animated.sequence([
          Animated.timing(coinAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.delay(600),
          Animated.timing(coinAnim, { toValue: 2, duration: 400, useNativeDriver: true }),
        ]).start();
      }
    }
    if (!state.isGameOver) prevGameOver.current = false;
  }, [state.isGameOver]); // eslint-disable-line

  // ── Watch for rematch room code ───────────────────────────────────────────
  useEffect(() => {
    if (room?.rematchRoomCode) {
      router.replace({
        pathname: '/online-game',
        params: {
          roomCode: room.rematchRoomCode,
          isHost: isHost ? 'false' : 'true', // roles swap
          myUid,
          gridSize: String(gridSize),
        },
      });
    }
  }, [room?.rematchRoomCode]); // eslint-disable-line

  const handleLineTap = (line: LineId) => {
    if (!isMyTurn || state.isGameOver || isSubmitting) return;
    Haptics.selectionAsync();
    drawLine(line);
  };

  const handleRematch = async () => {
    setRematchWaiting(true);
    await requestRematch();
  };

  const handleLeave = () => {
    abandon();
    router.back();
  };

  const boardDisabled = !isMyTurn || state.isGameOver || isSubmitting;

  // Coin float animation values
  const coinTranslateY = coinAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0, -60, -60],
  });
  const coinOpacity = coinAnim.interpolate({
    inputRange: [0, 0.3, 1, 1.5, 2],
    outputRange: [0, 1, 1, 1, 0],
  });

  // ── Waiting for opponent ──────────────────────────────────────────────────
  if (!room || room.status === 'waiting') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
        <View style={styles.waitCenter}>
          <ActivityIndicator size="large" color={theme.p1} />
          <Text style={[styles.waitText, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
            Waiting for opponent…
          </Text>
          <TouchableOpacity style={[styles.leaveBtn, { borderColor: theme.border }]} onPress={handleLeave}>
            <Text style={[styles.leaveBtnText, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
              Leave Room
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
          onPress={handleLeave}
        >
          <Text style={[styles.iconBtnText, { color: theme.text }]}>←</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.text, fontFamily: theme.fontHandwritten }]}>
            <Text style={{ color: theme.p1 }}>Dots</Text>
            <Text style={{ color: theme.textMuted }}> & </Text>
            <Text style={{ color: theme.p2 }}>Boxes</Text>
          </Text>
          <Text style={[styles.headerSub, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
            Online  ·  Room {roomCode}
          </Text>
        </View>

        <View style={[styles.iconBtn, {
          backgroundColor: isMyTurn ? theme.p1Light : theme.bgCard,
          borderColor: isMyTurn ? theme.p1 : theme.border,
        }]}>
          <Text style={[styles.iconBtnText, { color: isMyTurn ? theme.p1 : theme.textMuted }]}>
            {isMyTurn ? '●' : '○'}
          </Text>
        </View>
      </View>

      {/* ── Turn indicator ── */}
      {!state.isGameOver && (
        <View style={[styles.turnBanner, {
          backgroundColor: isMyTurn ? theme.p1Light : theme.bgCard,
          borderColor: isMyTurn ? theme.p1 : theme.border,
        }]}>
          <Text style={[styles.turnBannerText, {
            color: isMyTurn ? theme.p1 : theme.textMuted,
            fontFamily: theme.fontSemiBold,
          }]}>
            {isMyTurn ? '▶ Your turn' : `${opponentName} is thinking…`}
          </Text>
        </View>
      )}

      {/* ── Score bar ── */}
      <View style={styles.scoreWrap}>
        <ScoreBar
          state={state}
          config={config}
          isAIThinking={false}
          timerRemaining={0}
          timerMax={0}
        />
      </View>

      {/* ── Board ── */}
      <View style={styles.boardWrap}>
        <GameBoard
          state={state}
          config={config}
          onLineTap={handleLineTap}
          disabled={boardDisabled}
        />
      </View>

      {/* ── Toast ── */}
      {toast && (
        <Animated.View
          pointerEvents="none"
          style={[styles.toast, {
            opacity: toastOpacity,
            borderColor: toast.color,
            backgroundColor: theme.bgCard,
          }]}
        >
          <Text style={[styles.toastText, { color: toast.color, fontFamily: theme.fontSemiBold }]}>
            {toast.text}
          </Text>
        </Animated.View>
      )}

      {/* ── Disconnected overlay ── */}
      {disconnected && !result && (
        <Pressable style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
          <View style={[styles.resultCard, { backgroundColor: theme.bg, borderColor: theme.border }]}>
            <Text style={{ fontSize: 48, lineHeight: 56 }}>📵</Text>
            <Text style={[styles.resultTitle, { color: theme.text, fontFamily: theme.fontHandwritten }]}>
              Opponent Left
            </Text>
            <Text style={[styles.resultSub, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
              Your opponent disconnected from the game.
            </Text>
            <TouchableOpacity
              style={[styles.resultBtnPrimary, { backgroundColor: theme.text }]}
              onPress={() => router.back()}
            >
              <Text style={[styles.resultBtnPrimaryText, { color: theme.bg, fontFamily: theme.fontHandwritten }]}>
                Back to Menu
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      )}

      {/* ── Game over overlay ── */}
      {result && (
        <Pressable style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
          <View style={[styles.resultCard, { backgroundColor: theme.bg, borderColor: theme.border }]}>
            <Text style={{ fontSize: 52, lineHeight: 60 }}>
              {result.winner === 'draw' ? '🤝' : '🎉'}
            </Text>

            <Text style={[styles.resultTitle, { color: theme.text, fontFamily: theme.fontHandwritten }]}>
              {result.winner === 'draw'
                ? "It's a Draw!"
                : `${result.winner === 'p1' ? result.p1Name : result.p2Name} Wins!`}
            </Text>

            <View style={styles.resultScoreRow}>
              <Text style={[styles.resultScoreName, { color: theme.p1 }]}>{result.p1Name}</Text>
              <Text style={[styles.resultScoreNums, { color: theme.text, fontFamily: theme.fontHandwritten }]}>
                <Text style={{ color: theme.p1 }}>{result.scores.p1}</Text>
                <Text style={{ color: theme.textMuted }}>  —  </Text>
                <Text style={{ color: theme.p2 }}>{result.scores.p2}</Text>
              </Text>
              <Text style={[styles.resultScoreName, { color: theme.p2 }]}>{result.p2Name}</Text>
            </View>

            {/* Coin award */}
            <View style={styles.coinRow}>
              <Text style={[styles.coinLabel, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
                🪙 +{coinsEarned} coins earned
              </Text>
            </View>

            <View style={styles.resultBtns}>
              <TouchableOpacity
                style={[styles.resultBtnSecondary, { borderColor: theme.border }]}
                onPress={() => router.back()}
              >
                <Text style={[styles.resultBtnSecondaryText, { color: theme.textMuted, fontFamily: theme.fontSemiBold }]}>
                  ← Menu
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.resultBtnPrimary, {
                  backgroundColor: rematchWaiting ? theme.bgCard : theme.text,
                  borderWidth: rematchWaiting ? 2 : 0,
                  borderColor: theme.border,
                }]}
                onPress={handleRematch}
                disabled={rematchWaiting}
              >
                {rematchWaiting
                  ? <ActivityIndicator color={theme.textMuted} />
                  : <Text style={[styles.resultBtnPrimaryText, { color: theme.bg, fontFamily: theme.fontHandwritten }]}>
                      Rematch →
                    </Text>
                }
              </TouchableOpacity>
            </View>

            {rematchWaiting && (
              <Text style={[styles.rematchNote, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
                Waiting for opponent to accept…
              </Text>
            )}
          </View>

          {/* Floating coin animation */}
          {coinsEarned > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.coinFloat,
                { opacity: coinOpacity, transform: [{ translateY: coinTranslateY }] },
              ]}
            >
              <Text style={[styles.coinFloatText, { color: '#f5c842', fontFamily: theme.fontHandwritten }]}>
                +{coinsEarned} 🪙
              </Text>
            </Animated.View>
          )}
        </Pressable>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1 },
  waitCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  waitText:  { fontSize: 18, marginTop: 12 },
  leaveBtn:  { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10, marginTop: 16 },
  leaveBtnText: { fontSize: 16 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10,
  },
  headerCenter: { alignItems: 'center' },
  headerTitle:  { fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  headerSub:    { fontSize: 12, marginTop: 1 },
  iconBtn: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    borderRadius: 22, borderWidth: 1.5,
  },
  iconBtnText: { fontSize: 20, fontWeight: '700' },

  turnBanner: {
    marginHorizontal: 16, marginBottom: 6,
    borderWidth: 1.5, borderRadius: 8,
    paddingVertical: 7, paddingHorizontal: 14, alignItems: 'center',
  },
  turnBannerText: { fontSize: 16, fontWeight: '600' },

  scoreWrap:  { paddingHorizontal: 16, marginBottom: 8 },
  boardWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center' },

  toast: {
    position: 'absolute', bottom: 48, alignSelf: 'center',
    borderWidth: 1.5, borderRadius: 20,
    paddingHorizontal: 20, paddingVertical: 9,
    shadowOffset: { width: 2, height: 3 }, shadowOpacity: 1, shadowRadius: 6, elevation: 6,
  },
  toastText: { fontSize: 18, fontWeight: '600' },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  resultCard: {
    borderRadius: 20, borderWidth: 2, padding: 28,
    width: '82%', alignItems: 'center', gap: 10,
    shadowOffset: { width: 4, height: 6 }, shadowOpacity: 0.18, shadowRadius: 0, elevation: 12,
  },
  resultTitle: { fontSize: 36, fontWeight: '700', textAlign: 'center' },
  resultSub:   { fontSize: 15, textAlign: 'center', marginTop: 4 },
  resultScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  resultScoreName: { fontFamily: 'Caveat_600SemiBold', fontSize: 16, fontWeight: '600' },
  resultScoreNums: { fontSize: 30, fontWeight: '700' },
  coinRow:     { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  coinLabel:   { fontSize: 16 },
  resultBtns:  { flexDirection: 'row', gap: 12, marginTop: 16 },
  resultBtnSecondary: {
    paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: 10, borderWidth: 2,
  },
  resultBtnSecondaryText: { fontSize: 18, fontWeight: '600' },
  resultBtnPrimary: {
    paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, minWidth: 120, alignItems: 'center',
    shadowOffset: { width: 3, height: 4 }, shadowOpacity: 0.25, shadowRadius: 0, elevation: 4,
  },
  resultBtnPrimaryText: { fontSize: 20, fontWeight: '700' },
  rematchNote: { fontSize: 13, marginTop: 8 },
  coinFloat: {
    position: 'absolute', bottom: '35%', alignSelf: 'center',
  },
  coinFloatText: { fontSize: 36, fontWeight: '700' },
});
