import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Pressable, ActivityIndicator, useWindowDimensions, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useTheme } from '../src/hooks/useTheme';
import { useOnlineHex } from '../src/hooks/useOnlineHex';
import HexBoard from '../src/components/HexBoard';
import { recordOnlineResult } from '../src/services/coins';
import { initAudio, playSound } from '../src/services/audio';
import type { HexResult } from '../src/types/hex.types';

export default function HexOnlineScreen() {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ roomCode: string; isHost: string; myUid: string }>();

  const roomCode = params.roomCode as string;
  const isHost   = params.isHost === 'true';
  const myUid    = params.myUid as string;

  const [toast, setToast]     = useState<{ text: string; color: string } | null>(null);
  const [result, setResult]   = useState<HexResult | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [rematchWaiting, setRematchWaiting] = useState(false);
  const [coinsEarned, setCoinsEarned] = useState(0);

  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevGameOver = useRef(false);
  const coinsAwarded = useRef(false);
  const confettiRef  = useRef<any>(null);

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

  const myColor = isHost ? theme.p1 : theme.p2;

  const {
    room, state, isMyTurn, isSubmitting, opponentName, myName,
    playMove, abandon, requestRematch, opponentReconnecting, graceSecondsRemaining,
  } = useOnlineHex(roomCode, myUid, isHost, 11, {
    onMove: () => playSound('click'),
    onTurnSwitch: () => {
      const nextIsMe = room?.currentPlayerUid === myUid;
      const nextName = nextIsMe ? myName : opponentName;
      const nextColor = room?.currentPlayerUid === room?.host.uid ? theme.p1 : theme.p2;
      showToast(`${nextName}'s turn`, nextColor);
    },
    onOpponentDisconnected: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setDisconnected(true);
    },
  });

  const p1Name = room?.host.name  ?? 'Player 1';
  const p2Name = room?.guest.name ?? 'Player 2';

  useEffect(() => {
    if (state.isGameOver && !prevGameOver.current) {
      prevGameOver.current = true;
      const winner: HexResult['winner'] = state.winner === 1 ? 'p1' : 'p2';
      setResult({ winner, p1Name, p2Name });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      playSound('win');
      if (winner === (isHost ? 'p1' : 'p2')) setTimeout(() => confettiRef.current?.start(), 200);

      if (!coinsAwarded.current && myUid) {
        coinsAwarded.current = true;
        const myPlayer = isHost ? 'p1' : 'p2';
        const outcomeResult: 'win' | 'loss' = winner === myPlayer ? 'win' : 'loss';
        const opponentUid = room ? (isHost ? room.guest.uid : room.host.uid) : null;
        recordOnlineResult(myUid, outcomeResult, roomCode, false, opponentUid).then(setCoinsEarned);
      }
    }
    if (!state.isGameOver) prevGameOver.current = false;
  }, [state.isGameOver]); // eslint-disable-line

  useEffect(() => {
    if (room?.rematchRoomCode) {
      router.replace({
        pathname: '/hex-online',
        params: { roomCode: room.rematchRoomCode, isHost: isHost ? 'false' : 'true', myUid },
      });
    }
  }, [room?.rematchRoomCode]); // eslint-disable-line

  const handleCellTap = (row: number, col: number) => {
    if (!isMyTurn || state.isGameOver || isSubmitting) return;
    Haptics.selectionAsync();
    playMove({ row, col });
  };

  const handleRematch = async () => { setRematchWaiting(true); await requestRematch(); };
  const handleLeave = () => { abandon(); router.back(); };

  const handleShare = useCallback(() => {
    if (!result) return;
    const winner = result.winner === 'p1' ? result.p1Name : result.p2Name;
    Share.share({ message: `${winner} connected their sides to win Hex! 🔷` });
  }, [result]);

  const boardDisabled = !isMyTurn || state.isGameOver || isSubmitting;

  if (!room || room.status === 'waiting') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
        <View style={styles.waitCenter}>
          <ActivityIndicator size="large" color={theme.p1} />
          <Text style={[styles.waitText, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>Waiting for opponent…</Text>
          <TouchableOpacity style={[styles.leaveBtn, { borderColor: theme.border }]} onPress={handleLeave}>
            <Text style={[styles.leaveBtnText, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>Leave Room</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity style={[styles.iconBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]} onPress={handleLeave}>
          <Text style={[styles.iconBtnText, { color: theme.text }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.text, fontFamily: theme.fontHandwritten }]}>Hex</Text>
          <Text style={[styles.headerSub, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>Room {roomCode}</Text>
        </View>
        <View style={[styles.iconBtn, { backgroundColor: isMyTurn ? theme.p1Light : theme.bgCard, borderColor: isMyTurn ? myColor : theme.border }]}>
          <Text style={[styles.iconBtnText, { color: isMyTurn ? myColor : theme.textMuted }]}>{isMyTurn ? '●' : '○'}</Text>
        </View>
      </View>

      {!state.isGameOver && (
        <View style={[styles.turnBanner, { backgroundColor: isMyTurn ? theme.p1Light : theme.bgCard, borderColor: isMyTurn ? myColor : theme.border }]}>
          <Text style={[styles.turnBannerText, { color: isMyTurn ? myColor : theme.textMuted, fontFamily: theme.fontSemiBold }]}>
            {isMyTurn ? '▶ Your turn' : `${opponentName} is thinking…`}
          </Text>
        </View>
      )}

      {opponentReconnecting && !state.isGameOver && !disconnected && (
        <View style={[styles.afkBanner, { backgroundColor: '#ff9500', borderColor: '#ff6b00' }]}>
          <Text style={[styles.afkText, { color: '#fff', fontFamily: theme.fontRegular }]}>
            📵 {opponentName} disconnected — reconnecting… ({graceSecondsRemaining}s)
          </Text>
        </View>
      )}

      <View style={styles.boardWrap}>
        <HexBoard state={state} onCellTap={handleCellTap} disabled={boardDisabled} />
      </View>

      {toast && (
        <Animated.View pointerEvents="none" style={[styles.toast, { opacity: toastOpacity, borderColor: toast.color, backgroundColor: theme.bgCard }]}>
          <Text style={[styles.toastText, { color: toast.color, fontFamily: theme.fontSemiBold }]}>{toast.text}</Text>
        </Animated.View>
      )}

      {disconnected && !result && (
        <Pressable style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
          <View style={[styles.resultCard, { backgroundColor: theme.bg, borderColor: theme.border }]}>
            <Text style={{ fontSize: 48, lineHeight: 56 }}>📵</Text>
            <Text style={[styles.resultTitle, { color: theme.text, fontFamily: theme.fontHandwritten }]}>Opponent Left</Text>
            <TouchableOpacity style={[styles.resultBtnPrimary, { backgroundColor: theme.text }]} onPress={() => router.back()}>
              <Text style={[styles.resultBtnPrimaryText, { color: theme.bg, fontFamily: theme.fontHandwritten }]}>Back to Menu</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      )}

      {result && (
        <Pressable style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
          <View style={[styles.resultCard, { backgroundColor: theme.bg, borderColor: theme.border }]}>
            <Text style={{ fontSize: 52, lineHeight: 60 }}>🔷</Text>
            <Text style={[styles.resultTitle, { color: theme.text, fontFamily: theme.fontHandwritten }]}>
              {result.winner === 'p1' ? result.p1Name : result.p2Name} Wins!
            </Text>
            <Text style={{ color: theme.textMuted, fontFamily: theme.fontRegular, fontSize: 16 }}>🪙 +{coinsEarned} coins earned</Text>

            <TouchableOpacity style={[styles.resultBtnSecondary, { borderColor: theme.border }]} onPress={handleShare}>
              <Text style={[styles.resultBtnSecondaryText, { color: theme.textMuted, fontFamily: theme.fontSemiBold }]}>Share Result</Text>
            </TouchableOpacity>

            <View style={styles.resultBtns}>
              <TouchableOpacity style={[styles.resultBtnSecondary, { borderColor: theme.border }]} onPress={() => router.back()}>
                <Text style={[styles.resultBtnSecondaryText, { color: theme.textMuted, fontFamily: theme.fontSemiBold }]}>← Menu</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.resultBtnPrimary, { backgroundColor: rematchWaiting ? theme.bgCard : theme.text, borderWidth: rematchWaiting ? 2 : 0, borderColor: theme.border }]}
                onPress={handleRematch} disabled={rematchWaiting}
              >
                {rematchWaiting
                  ? <ActivityIndicator color={theme.textMuted} />
                  : <Text style={[styles.resultBtnPrimaryText, { color: theme.bg, fontFamily: theme.fontHandwritten }]}>Rematch →</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      )}

      <View pointerEvents="none" style={{ position: 'absolute', width: '100%', height: '100%' }}>
        <ConfettiCannon ref={confettiRef} count={120} origin={{ x: width / 2, y: -20 }} autoStart={false} fadeOut
          colors={[theme.p1, theme.p2, '#f5c842', '#4ECDC4', '#ffffff']} fallSpeed={3500} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  waitCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  waitText: { fontSize: 18, marginTop: 12 },
  leaveBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10, marginTop: 16 },
  leaveBtnText: { fontSize: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '700' },
  headerSub: { fontSize: 12, marginTop: 1 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1.5 },
  iconBtnText: { fontSize: 20, fontWeight: '700' },
  turnBanner: { marginHorizontal: 16, marginBottom: 6, borderWidth: 1.5, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 14, alignItems: 'center' },
  turnBannerText: { fontSize: 16, fontWeight: '600' },
  afkBanner: { marginHorizontal: 16, marginBottom: 6, borderWidth: 1.5, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 14, alignItems: 'center' },
  afkText: { fontSize: 13 },
  boardWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', bottom: 48, alignSelf: 'center', borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 9 },
  toastText: { fontSize: 17, fontWeight: '600' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  resultCard: { borderRadius: 20, borderWidth: 2, padding: 28, width: '82%', alignItems: 'center', gap: 10 },
  resultTitle: { fontSize: 28, fontWeight: '700', textAlign: 'center' },
  resultBtns: { flexDirection: 'row', gap: 12, marginTop: 16 },
  resultBtnSecondary: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, borderWidth: 2 },
  resultBtnSecondaryText: { fontSize: 17, fontWeight: '600' },
  resultBtnPrimary: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, minWidth: 120, alignItems: 'center' },
  resultBtnPrimaryText: { fontSize: 20, fontWeight: '700' },
});
