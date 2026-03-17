import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, FlatList, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { getLeaderboard, LeaderboardEntry } from '../src/services/leaderboard';
import { getAnonymousUid } from '../src/services/firebase';

export default function LeaderboardScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [entries, setEntries]   = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [myUid, setMyUid]       = useState('');

  useEffect(() => {
    getAnonymousUid().then(setMyUid);
    getLeaderboard().then(data => {
      setEntries(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const renderMedal = (index: number) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `${index + 1}.`;
  };

  const renderItem = ({ item, index }: { item: LeaderboardEntry; index: number }) => {
    const isMe   = item.uid === myUid;
    const total  = item.onlineWins + item.onlineLosses + item.onlineDraws;
    const winPct = total > 0 ? Math.round((item.onlineWins / total) * 100) : 0;

    return (
      <View style={[
        s.row,
        { backgroundColor: isMe ? theme.p1Light : theme.bgCard, borderColor: isMe ? theme.p1 : theme.border },
      ]}>
        <Text style={[s.rank, { color: theme.textMuted, fontFamily: theme.fontHandwritten }]}>
          {renderMedal(index)}
        </Text>
        <View style={s.nameCol}>
          <Text style={[s.name, { color: isMe ? theme.p1 : theme.text, fontFamily: theme.fontSemiBold }]}>
            {item.displayName}{isMe ? ' (you)' : ''}
          </Text>
          <Text style={[s.sub, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
            {item.onlineWins}W · {item.onlineLosses}L · {item.onlineDraws}D
          </Text>
        </View>
        <View style={s.winsCol}>
          <Text style={[s.winsNum, { color: theme.p1, fontFamily: theme.fontHandwritten }]}>
            {item.onlineWins}
          </Text>
          <Text style={[s.winsPct, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
            {winPct}% win
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={[s.backBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]} onPress={() => router.back()}>
          <Text style={[s.backText, { color: theme.text, fontFamily: theme.fontHandwritten }]}>←</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: theme.text, fontFamily: theme.fontHandwritten }]}>
          🏆 Leaderboard
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <Text style={[s.subtitle, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
        Top players by online wins
      </Text>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={theme.p1} />
          <Text style={[s.loadText, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
            Loading leaderboard…
          </Text>
        </View>
      ) : entries.length === 0 ? (
        <View style={s.center}>
          <Text style={{ fontSize: 48 }}>🎯</Text>
          <Text style={[s.emptyText, { color: theme.textMuted, fontFamily: theme.fontHandwritten }]}>
            No online wins yet!
          </Text>
          <Text style={[s.emptySub, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
            Win an online game to appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={item => item.uid}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(theme: any) {
  return StyleSheet.create({
    safe:   { flex: 1 },
    header: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10,
    },
    backBtn: {
      width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
      borderRadius: 22, borderWidth: 1.5,
    },
    backText:  { fontSize: 24, fontWeight: '700' },
    title:     { fontSize: 28, fontWeight: '700' },
    subtitle:  { textAlign: 'center', fontSize: 13, marginBottom: 16, marginTop: 2 },
    list:      { paddingHorizontal: 16, gap: 10, paddingBottom: 32 },
    row: {
      flexDirection: 'row', alignItems: 'center',
      borderWidth: 1.5, borderRadius: 12, padding: 14, gap: 12,
    },
    rank:    { fontSize: 22, minWidth: 32, textAlign: 'center' },
    nameCol: { flex: 1 },
    name:    { fontSize: 17, fontWeight: '600' },
    sub:     { fontSize: 12, marginTop: 2 },
    winsCol: { alignItems: 'flex-end' },
    winsNum: { fontSize: 28, fontWeight: '700' },
    winsPct: { fontSize: 11, marginTop: 1 },
    center:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    loadText:  { fontSize: 16, marginTop: 8 },
    emptyText: { fontSize: 28, fontWeight: '700' },
    emptySub:  { fontSize: 15, textAlign: 'center' },
  });
}
