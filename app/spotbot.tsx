import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../src/hooks/useTheme';
import { getAnonymousUid } from '../src/services/firebase';
import { ensureUserProfile, awardCoins } from '../src/services/coins';
import {
  joinSpotBotQueue, cancelSpotBotQueue, subscribeToMySpotBotMatch,
  subscribeToSpotBotWaitingPool, attemptSpotBotMatch,
} from '../src/services/spotbotQueue';
import { useSpotBotLocalRound } from '../src/hooks/useSpotBotLocalRound';
import { useSpotBotOnlineRound } from '../src/hooks/useSpotBotOnlineRound';
import ClassicTTTBoard from '../src/components/ClassicTTTBoard';
import { recordSpotBotGuess, loadSpotBotScore } from '../src/utils/spotBotStorage';
import type { SpotBotOpponentKind, SpotBotPhase, SpotBotScore } from '../src/types/spotbot.types';

const QUEUE_TIMEOUT_MS = 6000;

export default function SpotBotScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const params = useLocalSearchParams<{ name: string }>();
  const myName = (params.name as string) || 'Player';

  const [phase, setPhase] = useState<SpotBotPhase>('queueing');
  const [opponentKind, setOpponentKind] = useState<SpotBotOpponentKind | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(true);
  const [myUid, setMyUid] = useState('');
  const [guess, setGuess] = useState<SpotBotOpponentKind | null>(null);
  const [score, setScore] = useState<SpotBotScore>({ correctGuesses: 0, totalGuesses: 0 });
  const [coinsEarned, setCoinsEarned] = useState(0);

  const resolvedRef = useRef(false);
  const timeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsubPoolRef    = useRef<(() => void) | null>(null);
  const unsubMatchRef   = useRef<(() => void) | null>(null);
  const uidRef = useRef('');

  // ── Enter the queue on mount, race a human match against a timeout ────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const uid = await getAnonymousUid();
      if (cancelled) return;
      uidRef.current = uid;
      setMyUid(uid);
      await ensureUserProfile(uid, myName);
      loadSpotBotScore().then(setScore);

      await joinSpotBotQueue(uid, myName);
      if (cancelled) return;

      const resolveHuman = (code: string, host: boolean) => {
        if (resolvedRef.current) return;
        resolvedRef.current = true;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        unsubPoolRef.current?.();
        unsubMatchRef.current?.();
        setOpponentKind('human');
        setRoomCode(code);
        setIsHost(host);
        setPhase('playing');
      };

      const resolveBot = () => {
        if (resolvedRef.current) return;
        resolvedRef.current = true;
        unsubPoolRef.current?.();
        unsubMatchRef.current?.();
        cancelSpotBotQueue(uid);
        setOpponentKind('bot');
        setPhase('playing');
      };

      timeoutRef.current = setTimeout(resolveBot, QUEUE_TIMEOUT_MS);
      unsubPoolRef.current  = subscribeToSpotBotWaitingPool(uid, partnerUid => attemptSpotBotMatch(uid, partnerUid));
      unsubMatchRef.current = subscribeToMySpotBotMatch(uid, resolveHuman);
    })();

    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      unsubPoolRef.current?.();
      unsubMatchRef.current?.();
      if (!resolvedRef.current && uidRef.current) cancelSpotBotQueue(uidRef.current);
    };
  }, []); // eslint-disable-line

  const localRound  = useSpotBotLocalRound({ onGameOver: () => setPhase('guessing') });
  const onlineRound = useSpotBotOnlineRound(roomCode, myUid, isHost, {
    onGameOver: () => setPhase('guessing'),
    onOpponentDisconnected: () => setPhase('guessing'),
  });

  const active = opponentKind === 'human' ? onlineRound : localRound;
  const cells  = opponentKind === 'human' ? onlineRound.state.cells : localRound.state.cells;
  const isOver = opponentKind === 'human' ? onlineRound.state.isOver : localRound.state.isOver;
  const result = opponentKind === 'human' ? onlineRound.state.result : localRound.state.result;
  const currentPlayer = opponentKind === 'human' ? onlineRound.state.currentPlayer : localRound.state.currentPlayer;

  const myPlayerNum = opponentKind === 'human' ? (isHost ? 1 : 2) : 1;
  const isMyTurn = opponentKind === 'human' ? onlineRound.isMyTurn : currentPlayer === 1;
  const boardDisabled = !isMyTurn || isOver
    || (opponentKind === 'human' && onlineRound.isSubmitting)
    || (opponentKind === 'bot' && localRound.isOpponentThinking);

  const handleCellTap = (cell: number) => {
    if (boardDisabled) return;
    Haptics.selectionAsync();
    if (opponentKind === 'human') onlineRound.playMove(cell);
    else localRound.playMove(cell);
  };

  const handleGuess = useCallback(async (g: SpotBotOpponentKind) => {
    setGuess(g);
    const correct = g === opponentKind;
    const newScore = await recordSpotBotGuess(correct);
    setScore(newScore);
    if (correct) {
      setCoinsEarned(3);
      getAnonymousUid().then(uid => awardCoins(uid, 3, 'participation', null));
    }
    Haptics.notificationAsync(correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    setPhase('result');
  }, [opponentKind]);

  const handlePlayAgain = () => {
    router.replace({ pathname: '/spotbot', params: { name: myName } });
  };

  const myOutcome: 'win' | 'loss' | 'draw' =
    result === 3 ? 'draw' : result === myPlayerNum ? 'win' : 'loss';

  if (phase === 'queueing') {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]}>
        <View style={s.center}>
          <ActivityIndicator size="large" color={theme.p1} />
          <Text style={[s.centerText, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
            Finding an opponent…
          </Text>
          <Text style={[s.centerSub, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
            (human or bot — you won't know which yet)
          </Text>
          <TouchableOpacity style={[s.leaveBtn, { borderColor: theme.border }]} onPress={() => router.back()}>
            <Text style={[s.leaveBtnText, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]}>
      <View style={s.header}>
        <TouchableOpacity style={[s.iconBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]} onPress={() => router.back()}>
          <Text style={[s.iconBtnText, { color: theme.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text, fontFamily: theme.fontHandwritten }]}>Spot the Bot</Text>
        <View style={{ width: 44 }} />
      </View>

      {phase === 'playing' && (
        <>
          <View style={[s.statusWrap, { borderColor: theme.border, backgroundColor: theme.bgCard }]}>
            <Text style={[s.statusHeadline, { color: theme.text, fontFamily: theme.fontSemiBold }]}>
              {isMyTurn ? 'Your turn' : "Opponent's turn"}
            </Text>
            <Text style={[s.statusSubline, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
              You are X · Opponent is O
            </Text>
          </View>
          <View style={s.boardWrap}>
            <ClassicTTTBoard cells={cells} onCellTap={handleCellTap} disabled={boardDisabled} />
          </View>
        </>
      )}

      {phase === 'guessing' && (
        <Pressable style={[s.overlay, { backgroundColor: 'rgba(42,36,24,0.55)' }]}>
          <View style={[s.card, { backgroundColor: theme.bg, borderColor: theme.border }]}>
            <Text style={{ fontSize: 44, lineHeight: 52 }}>
              {myOutcome === 'win' ? '🎉' : myOutcome === 'draw' ? '🤝' : '😅'}
            </Text>
            <Text style={[s.cardTitle, { color: theme.text, fontFamily: theme.fontHandwritten }]}>
              {myOutcome === 'win' ? 'You Won!' : myOutcome === 'draw' ? "It's a Draw" : 'You Lost'}
            </Text>
            <Text style={[s.guessPrompt, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
              Was your opponent a human or a bot?
            </Text>
            <View style={s.guessRow}>
              <TouchableOpacity style={[s.guessBtn, { backgroundColor: theme.p1 }]} onPress={() => handleGuess('human')}>
                <Text style={s.guessBtnIcon}>🧑</Text>
                <Text style={[s.guessBtnText, { color: '#fff' }]}>Human</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.guessBtn, { backgroundColor: theme.p2 }]} onPress={() => handleGuess('bot')}>
                <Text style={s.guessBtnIcon}>🤖</Text>
                <Text style={[s.guessBtnText, { color: '#fff' }]}>Bot</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      )}

      {phase === 'result' && (
        <Pressable style={[s.overlay, { backgroundColor: 'rgba(42,36,24,0.55)' }]}>
          <View style={[s.card, { backgroundColor: theme.bg, borderColor: theme.border }]}>
            <Text style={{ fontSize: 44, lineHeight: 52 }}>{guess === opponentKind ? '✅' : '❌'}</Text>
            <Text style={[s.cardTitle, { color: theme.text, fontFamily: theme.fontHandwritten }]}>
              {guess === opponentKind ? 'Correct!' : 'Not quite'}
            </Text>
            <Text style={[s.guessPrompt, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
              Your opponent was a {opponentKind === 'human' ? 'real human 🧑' : 'bot 🤖'}.
            </Text>
            {coinsEarned > 0 && (
              <Text style={{ color: theme.textMuted, fontFamily: theme.fontRegular, fontSize: 15 }}>
                🪙 +{coinsEarned} coins earned
              </Text>
            )}
            <Text style={[s.scoreText, { color: theme.p1, fontFamily: theme.fontSemiBold }]}>
              Spotting record: {score.correctGuesses}/{score.totalGuesses}
            </Text>
            <View style={s.resultBtns}>
              <TouchableOpacity style={[s.resultBtnSecondary, { borderColor: theme.border }]} onPress={() => router.push('/arcade')}>
                <Text style={[s.resultBtnSecondaryText, { color: theme.textMuted, fontFamily: theme.fontSemiBold }]}>← Menu</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.resultBtnPrimary, { backgroundColor: theme.text }]} onPress={handlePlayAgain} activeOpacity={0.82}>
                <Text style={[s.resultBtnPrimaryText, { color: theme.bg, fontFamily: theme.fontHandwritten }]}>Play Again →</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

function makeStyles(theme: any) {
  return StyleSheet.create({
    safe: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    centerText: { fontSize: 18, marginTop: 12 },
    centerSub: { fontSize: 13 },
    leaveBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10, marginTop: 16 },
    leaveBtnText: { fontSize: 16 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
    headerTitle: { fontSize: 22, fontWeight: '700' },
    iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1.5 },
    iconBtnText: { fontSize: 22, fontWeight: '700' },
    statusWrap: { marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1.5 },
    statusHeadline: { fontSize: 17, fontWeight: '600' },
    statusSubline: { marginTop: 2, fontSize: 13 },
    boardWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    card: {
      borderRadius: 20, borderWidth: 2, padding: 26, width: '84%', alignItems: 'center', gap: 10,
      shadowOffset: { width: 4, height: 6 }, shadowOpacity: 0.18, shadowRadius: 0, elevation: 12,
    },
    cardTitle: { fontSize: 28, fontWeight: '700', textAlign: 'center' },
    guessPrompt: { fontSize: 16, textAlign: 'center', marginTop: 2 },
    guessRow: { flexDirection: 'row', gap: 14, marginTop: 8 },
    guessBtn: { alignItems: 'center', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 26, gap: 4 },
    guessBtnIcon: { fontSize: 30 },
    guessBtnText: { fontSize: 17, fontWeight: '700' },
    scoreText: { fontSize: 15, marginTop: 6 },
    resultBtns: { flexDirection: 'row', gap: 12, marginTop: 12 },
    resultBtnSecondary: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, borderWidth: 2 },
    resultBtnSecondaryText: { fontSize: 17, fontWeight: '600' },
    resultBtnPrimary: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 },
    resultBtnPrimaryText: { fontSize: 20, fontWeight: '700' },
  });
}
