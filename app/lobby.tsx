import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { getAnonymousUid } from '../src/services/firebase';
import { ensureUserProfile } from '../src/services/coins';
import { createRoom, joinRoom, subscribeToRoom, abandonRoom } from '../src/services/gameRoom';
import type { GridSize, OnlineRoom } from '../src/types/game.types';

type LobbyView = 'menu' | 'create-settings' | 'waiting' | 'join-input';

const GRID_SIZES: GridSize[] = [3, 4, 5, 6];
const GRID_LABELS = ['3×3', '4×4', '5×5', '6×6'];

export default function LobbyScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [view, setView]           = useState<LobbyView>('menu');
  const [playerName, setName]     = useState('');
  const [gridSize, setGrid]       = useState<GridSize>(4);
  const [joinCode, setJoinCode]   = useState('');
  const [roomCode, setRoomCode]   = useState('');
  const [myUid, setMyUid]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [waitSeconds, setWaitSeconds] = useState(300);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    getAnonymousUid().then(setMyUid);
    return () => { unsubRef.current?.(); };
  }, []);

  // ── Waiting room countdown ────────────────────────────────────────────────
  useEffect(() => {
    if (view !== 'waiting') return;
    setWaitSeconds(300);
    let remaining = 300;
    const countdown = setInterval(() => {
      remaining -= 1;
      setWaitSeconds(remaining);
      if (remaining <= 0) {
        clearInterval(countdown);
        handleCancelWait();
        setError('No one joined in time. Share your code and try again!');
      }
    }, 1000);
    return () => clearInterval(countdown);
  }, [view]);

  // ── Create room ──────────────────────────────────────────────────────────
  const handleCreate = async () => {
    const name = playerName.trim() || 'Player 1';
    setLoading(true);
    setError('');
    try {
      await ensureUserProfile(myUid, name);
      const code = await createRoom(myUid, name, gridSize);
      setRoomCode(code);
      setView('waiting');

      unsubRef.current = subscribeToRoom(code, (room: OnlineRoom) => {
        if (room.status === 'active' && room.guest.uid) {
          unsubRef.current?.();
          router.replace({
            pathname: '/online-game',
            params: {
              roomCode: code,
              isHost: 'true',
              myUid,
              gridSize: String(gridSize),
            },
          });
        }
        if (room.status === 'abandoned') {
          setError('Room was abandoned.');
          setView('menu');
        }
      });
    } catch (e: any) {
      setError(e.message ?? 'Failed to create room.');
    } finally {
      setLoading(false);
    }
  };

  // ── Join room ────────────────────────────────────────────────────────────
  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) { setError('Enter a 6-character room code.'); return; }
    const name = playerName.trim() || 'Player 2';
    setLoading(true);
    setError('');
    try {
      await ensureUserProfile(myUid, name);
      const room = await joinRoom(code, myUid, name);
      router.replace({
        pathname: '/online-game',
        params: {
          roomCode: code,
          isHost: 'false',
          myUid,
          gridSize: String(room.gridSize),
        },
      });
    } catch (e: any) {
      setError(e.message ?? 'Failed to join room.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelWait = async () => {
    unsubRef.current?.();
    if (roomCode) {
      abandonRoom(roomCode);
    }
    setView('menu');
    setRoomCode('');
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={[s.backText, { color: theme.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: theme.text }]}>
          <Text style={{ color: theme.p1 }}>Play</Text>
          <Text style={{ color: theme.textMuted }}> Online</Text>
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={s.body}>

        {/* ── Menu ── */}
        {view === 'menu' && (
          <>
            <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              <Text style={[s.cardTitle, { color: theme.textMuted }]}>Your Name</Text>
              <TextInput
                style={[s.input, { borderBottomColor: theme.p1, color: theme.text, fontFamily: theme.fontHandwritten }]}
                value={playerName}
                onChangeText={setName}
                placeholder="Enter your name…"
                placeholderTextColor={theme.border}
                maxLength={16}
              />
            </View>

            <TouchableOpacity
              style={[s.bigBtn, { backgroundColor: theme.p1 }]}
              onPress={() => setView('create-settings')}
            >
              <Text style={s.bigBtnIcon}>🎮</Text>
              <View>
                <Text style={[s.bigBtnTitle, { color: '#fff' }]}>Create Room</Text>
                <Text style={[s.bigBtnSub, { color: 'rgba(255,255,255,0.75)' }]}>Share the code with a friend</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.bigBtn, { backgroundColor: theme.p2 }]}
              onPress={() => setView('join-input')}
            >
              <Text style={s.bigBtnIcon}>🔗</Text>
              <View>
                <Text style={[s.bigBtnTitle, { color: '#fff' }]}>Join Room</Text>
                <Text style={[s.bigBtnSub, { color: 'rgba(255,255,255,0.75)' }]}>Enter a friend's room code</Text>
              </View>
            </TouchableOpacity>

            {error ? <Text style={[s.error, { color: theme.p2 }]}>{error}</Text> : null}
          </>
        )}

        {/* ── Create settings ── */}
        {view === 'create-settings' && (
          <>
            <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              <Text style={[s.cardTitle, { color: theme.textMuted }]}>Grid Size</Text>
              <View style={s.gridRow}>
                {GRID_SIZES.map((g, i) => (
                  <TouchableOpacity
                    key={g}
                    style={[
                      s.gridBtn,
                      { borderColor: theme.border },
                      gridSize === g && { borderColor: theme.p1, backgroundColor: theme.p1Light },
                    ]}
                    onPress={() => setGrid(g)}
                  >
                    <Text style={[s.gridBtnText, { color: gridSize === g ? theme.p1 : theme.text }]}>
                      {GRID_LABELS[i]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {error ? <Text style={[s.error, { color: theme.p2 }]}>{error}</Text> : null}

            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: theme.p1 }, loading && { opacity: 0.6 }]}
              onPress={handleCreate}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={[s.actionBtnText, { fontFamily: theme.fontHandwritten }]}>Create Room →</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={() => { setView('menu'); setError(''); }}>
              <Text style={[s.cancelText, { color: theme.textMuted }]}>← Back</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Waiting for opponent ── */}
        {view === 'waiting' && (
          <View style={s.waitWrap}>
            <Text style={[s.waitLabel, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
              Share this code with your friend
            </Text>
            <View style={[s.codeBox, { backgroundColor: theme.bgCard, borderColor: theme.p1 }]}>
              <Text style={[s.codeText, { color: theme.p1, fontFamily: theme.fontHandwritten }]}>
                {roomCode}
              </Text>
            </View>
            <TouchableOpacity
              style={[s.copyBtn, { borderColor: theme.p1 }]}
              onPress={() => Share.share({ message: `Join my Dots & Boxes game! Code: ${roomCode}` })}
            >
              <Text style={[s.copyBtnText, { color: theme.p1, fontFamily: theme.fontSemiBold }]}>
                Share Code
              </Text>
            </TouchableOpacity>
            <ActivityIndicator size="large" color={theme.p1} style={{ marginTop: 24 }} />
            <Text style={[s.waitSub, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
              Waiting for opponent… ({Math.floor(waitSeconds / 60)}:{String(waitSeconds % 60).padStart(2, '0')} left)
            </Text>
            <TouchableOpacity
              style={[s.cancelBtn, { borderColor: theme.border }]}
              onPress={handleCancelWait}
            >
              <Text style={[s.cancelText, { color: theme.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Join room ── */}
        {view === 'join-input' && (
          <>
            <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              <Text style={[s.cardTitle, { color: theme.textMuted }]}>Room Code</Text>
              <TextInput
                style={[s.codeInput, { borderColor: theme.p2, color: theme.p2, fontFamily: theme.fontHandwritten }]}
                value={joinCode}
                onChangeText={t => setJoinCode(t.toUpperCase())}
                placeholder="ABC123"
                placeholderTextColor={theme.border}
                maxLength={6}
                autoCapitalize="characters"
                autoFocus
              />
            </View>

            {error ? <Text style={[s.error, { color: theme.p2 }]}>{error}</Text> : null}

            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: theme.p2 }, loading && { opacity: 0.6 }]}
              onPress={handleJoin}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={[s.actionBtnText, { fontFamily: theme.fontHandwritten }]}>Join →</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={() => { setView('menu'); setError(''); }}>
              <Text style={[s.cancelText, { color: theme.textMuted }]}>← Back</Text>
            </TouchableOpacity>
          </>
        )}

      </View>
    </SafeAreaView>
  );
}

function makeStyles(theme: any) {
  return StyleSheet.create({
    safe:  { flex: 1 },
    header: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10,
    },
    backBtn: {
      width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
      borderRadius: 22, backgroundColor: theme.bgCard, borderWidth: 1.5, borderColor: theme.border,
    },
    backText:  { fontSize: 24, fontFamily: theme.fontHandwritten, fontWeight: '700' },
    title:     { fontFamily: theme.fontHandwritten, fontSize: 28, fontWeight: '700' },
    body:      { flex: 1, padding: 20, gap: 14 },
    card: {
      borderWidth: 1.5, borderRadius: 12, padding: 18,
      shadowColor: theme.shadow, shadowOffset: { width: 2, height: 3 },
      shadowOpacity: 1, shadowRadius: 8, elevation: 2,
    },
    cardTitle: { fontFamily: theme.fontSemiBold, fontSize: 16, fontWeight: '600', marginBottom: 10 },
    input: {
      fontSize: 22, borderBottomWidth: 2,
      paddingVertical: 4, paddingHorizontal: 2, backgroundColor: 'transparent',
    },
    bigBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 16,
      borderRadius: 12, padding: 18,
      shadowOffset: { width: 2, height: 3 }, shadowOpacity: 0.25, shadowRadius: 0, elevation: 4,
    },
    bigBtnIcon:  { fontSize: 36 },
    bigBtnTitle: { fontFamily: theme.fontHandwritten, fontSize: 24, fontWeight: '700' },
    bigBtnSub:   { fontFamily: theme.fontRegular, fontSize: 13, marginTop: 2 },
    gridRow:     { flexDirection: 'row', gap: 8 },
    gridBtn: {
      flex: 1, alignItems: 'center', paddingVertical: 10,
      borderWidth: 2, borderRadius: 8,
    },
    gridBtnText: { fontFamily: theme.fontSemiBold, fontSize: 17, fontWeight: '600' },
    actionBtn: {
      borderRadius: 10, paddingVertical: 14, alignItems: 'center',
      shadowOffset: { width: 3, height: 4 }, shadowOpacity: 0.25, shadowRadius: 0, elevation: 4,
    },
    actionBtnText: { fontSize: 24, fontWeight: '700', color: '#fff' },
    waitWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    waitLabel:   { fontSize: 16, textAlign: 'center' },
    codeBox: {
      borderWidth: 3, borderRadius: 16, paddingHorizontal: 36, paddingVertical: 16,
      marginTop: 8,
    },
    codeText:  { fontSize: 52, fontWeight: '700', letterSpacing: 8 },
    copyBtn: {
      borderWidth: 1.5, borderRadius: 8,
      paddingHorizontal: 24, paddingVertical: 10, marginTop: 8,
    },
    copyBtnText: { fontSize: 16, fontWeight: '600' },
    waitSub:   { fontSize: 15, marginTop: 8 },
    cancelBtn: {
      marginTop: 24, borderWidth: 1.5, borderRadius: 8,
      paddingHorizontal: 24, paddingVertical: 10,
    },
    cancelText: { fontFamily: theme.fontRegular, fontSize: 16, textAlign: 'center', marginTop: 8 },
    codeInput: {
      fontFamily: theme.fontHandwritten, fontSize: 40, fontWeight: '700',
      borderWidth: 2, borderRadius: 10, textAlign: 'center',
      paddingVertical: 10, letterSpacing: 6,
    },
    error: { fontFamily: theme.fontRegular, fontSize: 14, textAlign: 'center' },
  });
}
