import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { getAnonymousUid } from '../src/services/firebase';
import { ensureUserProfile } from '../src/services/coins';
import { createHexRoom, joinHexRoom, subscribeToHexRoom, abandonHexRoom } from '../src/services/hexRoom';
import type { HexOnlineRoom } from '../src/types/hex.types';

type LobbyView = 'menu' | 'waiting' | 'join-input';
const ONLINE_BOARD_SIZE = 11;

export default function HexLobbyScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [view, setView]         = useState<LobbyView>('menu');
  const [playerName, setName]   = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [myUid, setMyUid]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [waitSeconds, setWaitSeconds] = useState(300);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    getAnonymousUid().then(setMyUid);
    return () => { unsubRef.current?.(); };
  }, []);

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

  const handleCreate = async () => {
    const name = playerName.trim() || 'Player 1';
    setLoading(true);
    setError('');
    try {
      await ensureUserProfile(myUid, name);
      const code = await createHexRoom(myUid, name, ONLINE_BOARD_SIZE);
      setRoomCode(code);
      setView('waiting');

      unsubRef.current = subscribeToHexRoom(code, (room: HexOnlineRoom) => {
        if (room.status === 'active' && room.guest.uid) {
          unsubRef.current?.();
          router.replace({ pathname: '/hex-online', params: { roomCode: code, isHost: 'true', myUid } });
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

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) { setError('Enter a 6-character room code.'); return; }
    const name = playerName.trim() || 'Player 2';
    setLoading(true);
    setError('');
    try {
      await ensureUserProfile(myUid, name);
      const { isHost } = await joinHexRoom(code, myUid, name);
      router.replace({ pathname: '/hex-online', params: { roomCode: code, isHost: isHost ? 'true' : 'false', myUid } });
    } catch (e: any) {
      setError(e.message ?? 'Failed to join room.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelWait = async () => {
    unsubRef.current?.();
    if (roomCode) abandonHexRoom(roomCode);
    setView('menu');
    setRoomCode('');
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]}>
      <View style={s.header}>
        <TouchableOpacity style={[s.backBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]} onPress={() => router.back()}>
          <Text style={[s.backText, { color: theme.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: theme.text }]}>
          <Text style={{ color: theme.p1 }}>Hex</Text>
          <Text style={{ color: theme.textMuted }}> Online</Text>
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={s.body}>
        {view === 'menu' && (
          <>
            <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              <Text style={[s.cardTitle, { color: theme.textMuted }]}>Your Name</Text>
              <TextInput
                style={[s.input, { borderBottomColor: theme.p1, color: theme.text, fontFamily: theme.fontHandwritten }]}
                value={playerName} onChangeText={setName} placeholder="Enter your name…" placeholderTextColor={theme.border} maxLength={16}
              />
            </View>

            <TouchableOpacity style={[s.bigBtn, { backgroundColor: theme.p1 }]} onPress={handleCreate} disabled={loading}>
              <Text style={s.bigBtnIcon}>🔷</Text>
              <View>
                <Text style={[s.bigBtnTitle, { color: '#fff' }]}>Create Room</Text>
                <Text style={[s.bigBtnSub, { color: 'rgba(255,255,255,0.75)' }]}>Share the code with a friend</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[s.bigBtn, { backgroundColor: theme.p2 }]} onPress={() => setView('join-input')}>
              <Text style={s.bigBtnIcon}>🔗</Text>
              <View>
                <Text style={[s.bigBtnTitle, { color: '#fff' }]}>Join Room</Text>
                <Text style={[s.bigBtnSub, { color: 'rgba(255,255,255,0.75)' }]}>Enter a friend's room code</Text>
              </View>
            </TouchableOpacity>

            {error ? <Text style={[s.error, { color: theme.p2 }]}>{error}</Text> : null}
            {loading && <ActivityIndicator color={theme.p1} />}
          </>
        )}

        {view === 'waiting' && (
          <View style={s.waitWrap}>
            <Text style={[s.waitLabel, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>Share this code with your friend</Text>
            <View style={[s.codeBox, { backgroundColor: theme.bgCard, borderColor: theme.p1 }]}>
              <Text style={[s.codeText, { color: theme.p1, fontFamily: theme.fontHandwritten }]}>{roomCode}</Text>
            </View>
            <TouchableOpacity style={[s.copyBtn, { borderColor: theme.p1 }]} onPress={() => Share.share({ message: `Join my Hex game! Code: ${roomCode}` })}>
              <Text style={[s.copyBtnText, { color: theme.p1, fontFamily: theme.fontSemiBold }]}>Share Code</Text>
            </TouchableOpacity>
            <ActivityIndicator size="large" color={theme.p1} style={{ marginTop: 24 }} />
            <Text style={[s.waitSub, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
              Waiting for opponent… ({Math.floor(waitSeconds / 60)}:{String(waitSeconds % 60).padStart(2, '0')} left)
            </Text>
            <TouchableOpacity style={[s.cancelBtn, { borderColor: theme.border }]} onPress={handleCancelWait}>
              <Text style={[s.cancelText, { color: theme.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {view === 'join-input' && (
          <>
            <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              <Text style={[s.cardTitle, { color: theme.textMuted }]}>Your Name</Text>
              <TextInput
                style={[s.input, { borderBottomColor: theme.p2, color: theme.text, fontFamily: theme.fontHandwritten }]}
                value={playerName} onChangeText={setName} placeholder="Enter your name…" placeholderTextColor={theme.border} maxLength={16}
              />
            </View>
            <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              <Text style={[s.cardTitle, { color: theme.textMuted }]}>Room Code</Text>
              <TextInput
                style={[s.codeInput, { borderColor: theme.p2, color: theme.p2, fontFamily: theme.fontHandwritten }]}
                value={joinCode} onChangeText={t => setJoinCode(t.toUpperCase())}
                placeholder="ABC123" placeholderTextColor={theme.border} maxLength={6} autoCapitalize="characters" autoFocus
              />
            </View>

            {error ? <Text style={[s.error, { color: theme.p2 }]}>{error}</Text> : null}

            <TouchableOpacity style={[s.actionBtn, { backgroundColor: theme.p2 }, loading && { opacity: 0.6 }]} onPress={handleJoin} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={[s.actionBtnText, { fontFamily: theme.fontHandwritten }]}>Join →</Text>}
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
    safe: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1.5 },
    backText: { fontSize: 24, fontWeight: '700' },
    title: { fontSize: 28, fontWeight: '700' },
    body: { flex: 1, padding: 20, gap: 14 },
    card: { borderWidth: 1.5, borderRadius: 12, padding: 18 },
    cardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 10 },
    input: { fontSize: 22, borderBottomWidth: 2, paddingVertical: 4, paddingHorizontal: 2, backgroundColor: 'transparent' },
    bigBtn: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 12, padding: 18 },
    bigBtnIcon: { fontSize: 36 },
    bigBtnTitle: { fontSize: 24, fontWeight: '700' },
    bigBtnSub: { fontSize: 13, marginTop: 2 },
    actionBtn: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
    actionBtnText: { fontSize: 24, fontWeight: '700', color: '#fff' },
    waitWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    waitLabel: { fontSize: 16, textAlign: 'center' },
    codeBox: { borderWidth: 3, borderRadius: 16, paddingHorizontal: 36, paddingVertical: 16, marginTop: 8 },
    codeText: { fontSize: 52, fontWeight: '700', letterSpacing: 8 },
    copyBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10, marginTop: 8 },
    copyBtnText: { fontSize: 16, fontWeight: '600' },
    waitSub: { fontSize: 15, marginTop: 8 },
    cancelBtn: { marginTop: 24, borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10 },
    cancelText: { fontSize: 16, textAlign: 'center', marginTop: 8 },
    codeInput: { fontSize: 40, fontWeight: '700', borderWidth: 2, borderRadius: 10, textAlign: 'center', paddingVertical: 10, letterSpacing: 6 },
    error: { fontSize: 14, textAlign: 'center' },
  });
}
