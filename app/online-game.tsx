import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Pressable, ActivityIndicator,
  useWindowDimensions, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useTheme } from '../src/hooks/useTheme';
import { useOnlineGame } from '../src/hooks/useOnlineGame';
import GameBoard from '../src/components/GameBoard';
import ScoreBar from '../src/components/ScoreBar';
import { recordOnlineResult } from '../src/services/coins';
import { initAudio, playSound } from '../src/services/audio';
import { saveActiveRoom, clearActiveRoom } from '../src/utils/storage';
import { leaveSpectator } from '../src/services/gameRoom';
import { getChainCelebration } from '../src/utils/chainFeedback';
import { fireChainHaptics, CHAIN_CONFETTI_COUNTS } from '../src/utils/chainHaptics';
import type { GameConfig, GameResult, LineId, GridSize } from '../src/types/game.types';

export default function OnlineGameScreen() {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{
    roomCode: string;
    isHost: string;
    myUid: string;
    gridSize: string;
    spectate?: string;
  }>();

  const roomCode = params.roomCode as string;
  const isHost   = params.isHost === 'true';
  const myUid    = params.myUid as string;
  const gridSize = (parseInt(params.gridSize ?? '4', 10)) as GridSize;
  const isSpectator = params.spectate === 'true';

  const [toast, setToast]             = useState<{ text: string; color: string } | null>(null);
  const [result, setResult]           = useState<GameResult | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [rematchWaiting, setRematchWaiting] = useState(false);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [newBoxes, setNewBoxes]       = useState<string[]>([]);
  const [afkWarning, setAfkWarning]   = useState(false);

  const toastOpacity  = useRef(new Animated.Value(0)).current;
  const coinAnim      = useRef(new Animated.Value(0)).current;
  const toastTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevGameOver  = useRef(false);
  const coinsAwarded  = useRef(false);
  const confettiRef   = useRef<any>(null);
  const [activeChainTier, setActiveChainTier] = useState<0 | 1 | 2>(0);
  const prevLastLine  = useRef<string>('');
  const lastMoveTimeRef = useRef(Date.now());

  // ── Init audio ─────────────────────────────────────────────────────────────
  useEffect(() => {
    initAudio();
  }, []);

  // ── Persist active room so a killed/reopened app can offer to rejoin ──────
  // Spectators don't occupy a seat, so there's nothing to "rejoin" for them.
  useEffect(() => {
    if (!roomCode || !myUid || isSpectator) return;
    saveActiveRoom({ roomCode, isHost, myUid, gridSize });
    return () => { clearActiveRoom(); };
  }, [roomCode, isHost, myUid, gridSize, isSpectator]);

  // ── Spectators: leave the spectators list on unmount ──────────────────────
  useEffect(() => {
    if (!isSpectator) return;
    return () => { leaveSpectator(roomCode, myUid); };
  }, [roomCode, myUid, isSpectator]);

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

  // Seat-correct colors: p1/host is always theme.p1, p2/guest is always theme.p2,
  // regardless of which seat the local player occupies.
  const myColor = isHost ? theme.p1 : theme.p2;
  const myLight = isHost ? theme.p1Light : theme.p2Light;

  const {
    room, state, isMyTurn, isSubmitting, opponentName, myName, lastLine, drawLine,
    abandon, requestRematch, timerRemaining, opponentReconnecting, graceSecondsRemaining,
  } =
    useOnlineGame(roomCode, myUid, isHost, gridSize, {
      onBoxClaimed: (count, player, boxKeys, line) => {
        playSound(count >= 3 ? 'chain' : 'pop');
        const celebration = getChainCelebration(count);
        fireChainHaptics(celebration.hapticPulses);
        const name  = player === 1 ? (isHost ? myName : opponentName) : (isHost ? opponentName : myName);
        const color = player === 1 ? theme.p1 : theme.p2;
        showToast(`${celebration.label}${name} +${count} box${count > 1 ? 'es' : ''}!`, color);
        if (celebration.tier > 0) setActiveChainTier(celebration.tier);
        setNewBoxes(boxKeys);
        setTimeout(() => setNewBoxes([]), 700);
      },
      onTurnSwitch: () => {
        const nextIsMe  = room?.currentPlayerUid === myUid;
        const nextName  = nextIsMe ? myName : opponentName;
        const nextColor = room?.currentPlayerUid === room?.host.uid ? theme.p1 : theme.p2;
        showToast(`${nextName}'s turn`, nextColor);
      },
      onOpponentDisconnected: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setDisconnected(true);
      },
      onAutoSkip: (playerName) => {
        showToast(`Time's up — ${playerName} skipped`, theme.textMuted);
      },
    }, isSpectator);

  // Build config for GameBoard / ScoreBar
  const config: GameConfig = {
    mode: 'online',
    gridSize,
    p1Name: room?.host.name  ?? 'Player 1',
    p2Name: room?.guest.name ?? 'Player 2',
    difficulty: 'medium',
    timerSeconds: 0,
  };

  // ── Detect opponent moves via lastLine changes ─────────────────────────────
  useEffect(() => {
    if (!lastLine) return;
    const key = `${lastLine.type}-${lastLine.row}-${lastLine.col}`;
    if (key !== prevLastLine.current) {
      prevLastLine.current = key;
      if (!isMyTurn) { // only play click for opponent's moves (mine already played on tap)
        playSound('click');
      }
    }
  }, [lastLine]);

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

      // Play win/draw sound
      if (winner !== 'draw') {
        playSound('win');
      } else {
        playSound('draw');
      }

      // Fire confetti if local player wins (spectators have no side, so skip)
      if (!isSpectator && winner === (isHost ? 'p1' : 'p2')) {
        setTimeout(() => confettiRef.current?.start(), 200);
      }

      // Award coins — spectators never played, so no result to record
      if (!isSpectator && !coinsAwarded.current && myUid) {
        coinsAwarded.current = true;
        const myPlayer = isHost ? 'p1' : 'p2';
        const outcomeResult: 'win' | 'draw' | 'loss' =
          winner === myPlayer ? 'win' : winner === 'draw' ? 'draw' : 'loss';
        const opponentUid = room ? (isHost ? room.guest.uid : room.host.uid) : null;

        recordOnlineResult(myUid, outcomeResult, roomCode, room?.ranked ?? false, opponentUid).then(coins => {
          setCoinsEarned(coins);
          coinAnim.setValue(0);
          Animated.sequence([
            Animated.timing(coinAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            Animated.delay(600),
            Animated.timing(coinAnim, { toValue: 2, duration: 400, useNativeDriver: true }),
          ]).start();
        });
      }
    }
    if (!state.isGameOver) prevGameOver.current = false;
  }, [state.isGameOver]); // eslint-disable-line

  // ── Watch for rematch room code (players only — spectators just stay put) ──
  useEffect(() => {
    if (isSpectator) return;
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
  }, [room?.rematchRoomCode, isSpectator]); // eslint-disable-line

  // ── AFK: reset timer on new moves ─────────────────────────────────────────
  useEffect(() => {
    if (room?.moveCount) lastMoveTimeRef.current = Date.now();
  }, [room?.moveCount]);

  // ── AFK watcher (players only — a spectator must never abandon the room) ──
  useEffect(() => {
    if (isSpectator) return;
    if (state.isGameOver || result || disconnected || opponentReconnecting || !room || room.status !== 'active') return;
    if (isMyTurn) {
      // Reset timer whenever it becomes my turn
      lastMoveTimeRef.current = Date.now();
      setAfkWarning(false);
      return;
    }
    const check = setInterval(() => {
      const elapsed = (Date.now() - lastMoveTimeRef.current) / 1000;
      if (elapsed > 300) {        // 5 minutes — auto-leave
        clearInterval(check);
        abandon();
        router.back();
      } else if (elapsed > 120) { // 2 minutes — show warning
        setAfkWarning(true);
      }
    }, 10000);
    return () => clearInterval(check);
  }, [isMyTurn, state.isGameOver, result, disconnected, opponentReconnecting, room?.status, isSpectator]);

  const handleLineTap = (line: LineId) => {
    if (!isMyTurn || state.isGameOver || isSubmitting) return;
    Haptics.selectionAsync();
    playSound('click');
    drawLine(line);
  };

  const handleRematch = async () => {
    setRematchWaiting(true);
    await requestRematch();
  };

  const handleLeave = () => {
    // Spectators must never end the room for the actual players.
    if (!isSpectator) abandon();
    router.back();
  };

  const handleShare = useCallback(() => {
    if (!result) return;
    const trunc = (s: string) => s.length > 12 ? s.slice(0, 12) + '…' : s;
    const p1 = trunc(result.p1Name);
    const p2 = trunc(result.p2Name);
    let message: string;
    if (result.winner === 'draw') {
      message = `${p1} and ${p2} tied ${result.scores.p1}–${result.scores.p2} in Dots & Boxes! 🤝`;
    } else {
      const winner = result.winner === 'p1' ? p1 : p2;
      const loser  = result.winner === 'p1' ? p2 : p1;
      const ws = result.winner === 'p1' ? result.scores.p1 : result.scores.p2;
      const ls = result.winner === 'p1' ? result.scores.p2 : result.scores.p1;
      message = `${winner} beat ${loser} ${ws}–${ls} in Dots & Boxes! 🎉`;
    }
    Share.share({ message });
  }, [result]);

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
            {isSpectator ? '👀 Spectating' : (room?.ranked ? 'Ranked' : 'Online')}  ·  Room {roomCode}
            {!isSpectator && (room?.spectators?.length ?? 0) > 0 ? `  ·  👀 ${room!.spectators!.length}` : ''}
          </Text>
        </View>

        {!isSpectator && (
          <View style={[styles.iconBtn, {
            backgroundColor: isMyTurn ? myLight : theme.bgCard,
            borderColor: isMyTurn ? myColor : theme.border,
          }]}>
            <Text style={[styles.iconBtnText, { color: isMyTurn ? myColor : theme.textMuted }]}>
              {isMyTurn ? '●' : '○'}
            </Text>
          </View>
        )}
        {isSpectator && <View style={{ width: 44 }} />}
      </View>

      {/* ── Turn indicator ── */}
      {!state.isGameOver && (
        <View style={[styles.turnBanner, {
          backgroundColor: isMyTurn ? myLight : theme.bgCard,
          borderColor: isMyTurn ? myColor : theme.border,
        }]}>
          <Text style={[styles.turnBannerText, {
            color: isMyTurn ? myColor : theme.textMuted,
            fontFamily: theme.fontSemiBold,
          }]}>
            {isSpectator
              ? `${room?.currentPlayerUid === room?.host.uid ? room?.host.name : room?.guest.name}'s turn`
              : (isMyTurn ? '▶ Your turn' : `${opponentName} is thinking…`)}
          </Text>
        </View>
      )}

      {/* ── Reconnecting banner — opponent's heartbeat has gone stale ── */}
      {opponentReconnecting && !state.isGameOver && !disconnected && (
        <View style={[styles.afkBanner, { backgroundColor: '#ff9500', borderColor: '#ff6b00' }]}>
          <Text style={[styles.afkText, { color: '#fff', fontFamily: theme.fontRegular }]}>
            📵 {opponentName} disconnected — reconnecting… ({graceSecondsRemaining}s)
          </Text>
        </View>
      )}

      {/* ── AFK warning banner ── */}
      {afkWarning && !state.isGameOver && !opponentReconnecting && (
        <View style={[styles.afkBanner, { backgroundColor: '#ff9500', borderColor: '#ff6b00' }]}>
          <Text style={[styles.afkText, { color: '#fff', fontFamily: theme.fontRegular }]}>
            Opponent hasn't moved in a while…
          </Text>
        </View>
      )}

      {/* ── Score bar ── */}
      <View style={styles.scoreWrap}>
        <ScoreBar
          state={state}
          config={config}
          isAIThinking={false}
          timerRemaining={timerRemaining}
          timerMax={room?.timerSeconds ?? 15}
        />
      </View>

      {/* ── Board ── */}
      <View style={styles.boardWrap}>
        <GameBoard
          state={state}
          config={config}
          onLineTap={handleLineTap}
          disabled={boardDisabled}
          lastLine={lastLine}
          newBoxes={newBoxes}
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

            {/* Coin award (players only) */}
            {!isSpectator && (
              <View style={styles.coinRow}>
                <Text style={[styles.coinLabel, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
                  🪙 +{coinsEarned} coins earned
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.resultBtnSecondary, { borderColor: theme.border }]}
              onPress={handleShare}
            >
              <Text style={[styles.resultBtnSecondaryText, { color: theme.textMuted, fontFamily: theme.fontSemiBold }]}>
                Share Result
              </Text>
            </TouchableOpacity>

            <View style={styles.resultBtns}>
              <TouchableOpacity
                style={[styles.resultBtnSecondary, { borderColor: theme.border }]}
                onPress={() => router.back()}
              >
                <Text style={[styles.resultBtnSecondaryText, { color: theme.textMuted, fontFamily: theme.fontSemiBold }]}>
                  ← Menu
                </Text>
              </TouchableOpacity>

              {!isSpectator && (
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
              )}
            </View>

            {!isSpectator && rematchWaiting && (
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

      {/* ── Confetti — pointerEvents none so it never blocks the board ── */}
      <View pointerEvents="none" style={{ position: 'absolute', width: '100%', height: '100%' }}>
        <ConfettiCannon
          ref={confettiRef}
          count={120}
          origin={{ x: width / 2, y: -20 }}
          autoStart={false}
          fadeOut
          colors={[theme.p1, theme.p2, '#f5c842', '#4ECDC4', '#ffffff']}
          fallSpeed={3500}
        />
        {/* Chain-celebration bursts — scaled by chain length, fired from mid-board.
            Mounted only while active: react-native-confetti-cannon renders its first
            particle at rest (fully opaque) as soon as it mounts, even with
            autoStart={false}, so keeping these always-mounted left a stray colored
            square sitting at mid-board for the whole game. */}
        {activeChainTier === 1 && (
          <ConfettiCannon
            count={CHAIN_CONFETTI_COUNTS[1]}
            origin={{ x: width / 2, y: height * 0.4 }}
            autoStart
            fadeOut
            explosionSpeed={250}
            colors={[theme.p1, theme.p2, '#f5c842']}
            fallSpeed={1800}
            onAnimationEnd={() => setActiveChainTier(0)}
          />
        )}
        {activeChainTier === 2 && (
          <ConfettiCannon
            count={CHAIN_CONFETTI_COUNTS[2]}
            origin={{ x: width / 2, y: height * 0.4 }}
            autoStart
            fadeOut
            explosionSpeed={300}
            colors={[theme.p1, theme.p2, '#f5c842', '#4ECDC4', '#ffffff']}
            fallSpeed={2200}
            onAnimationEnd={() => setActiveChainTier(0)}
          />
        )}
      </View>

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

  afkBanner: {
    marginHorizontal: 16, marginBottom: 6,
    borderWidth: 1.5, borderRadius: 8,
    paddingVertical: 6, paddingHorizontal: 14, alignItems: 'center',
  },
  afkText: { fontSize: 13 },

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
