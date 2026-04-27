import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_URL, COLORS, FONT, RADIUS, SPACING } from "../constants/theme";
import { useAuth } from "../contexts/AuthContext";

type Tab = "workouts" | "checkups" | "chats";

const fmtDate = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function HistoryScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("workouts");
  const [loading, setLoading] = useState(true);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [checkups, setCheckups] = useState<any[]>([]);
  const [chats, setChats] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      setLoading(true);
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [wRes, cRes, sRes] = await Promise.all([
          fetch(`${API_URL}/workouts/me`, { headers }),
          fetch(`${API_URL}/symptom-checks/me`, { headers }),
          fetch(`${API_URL}/chat/sessions/me`, { headers }),
        ]);
        if (wRes.ok) setWorkouts((await wRes.json()).workouts || []);
        if (cRes.ok) setCheckups((await cRes.json()).checks || []);
        if (sRes.ok) setChats((await sRes.json()).sessions || []);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="history-back-btn">
          <Ionicons name="chevron-back" size={26} color={COLORS.text_primary} />
        </TouchableOpacity>
        <Text style={styles.title}>History</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.tabRow}>
        {[
          { key: "workouts", label: `Workouts (${workouts.length})`, icon: "barbell" },
          { key: "checkups", label: `Checkups (${checkups.length})`, icon: "medkit" },
          { key: "chats", label: `Chats (${chats.length})`, icon: "chatbubbles" },
        ].map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
            onPress={() => setTab(t.key as Tab)}
            testID={`history-tab-${t.key}`}
          >
            <Ionicons
              name={t.icon as any}
              size={14}
              color={tab === t.key ? "#fff" : COLORS.primary}
            />
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {tab === "workouts" && (
            <>
              {workouts.length === 0 ? (
                <Text style={styles.empty} testID="empty-workouts">
                  No workouts logged yet. Try the Fitness tab!
                </Text>
              ) : (
                workouts.map((w) => (
                  <View key={w.id} style={styles.card} testID="workout-history-item">
                    <View style={styles.cardTop}>
                      <View style={styles.cardIcon}>
                        <Ionicons name="barbell" size={18} color={COLORS.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{w.exercise}</Text>
                        <Text style={styles.cardSub}>{fmtDate(w.timestamp)}</Text>
                      </View>
                      <Text style={styles.cardValue}>{w.reps} reps</Text>
                    </View>
                    <View style={styles.cardMetaRow}>
                      <Text style={styles.cardMeta}>
                        🔥 {w.calories_burned ?? 0} cal
                      </Text>
                      <Text style={styles.cardMeta}>
                        ⏱ {Math.round((w.duration_seconds || 0) / 60)}m
                        {(w.duration_seconds || 0) % 60}s
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {tab === "checkups" && (
            <>
              {checkups.length === 0 ? (
                <Text style={styles.empty} testID="empty-checkups">
                  No symptom checks yet. Try the Symptoms tab!
                </Text>
              ) : (
                checkups.map((c) => (
                  <View key={c.id} style={styles.card} testID="checkup-history-item">
                    <View style={styles.cardTop}>
                      <View style={styles.cardIcon}>
                        <Ionicons name="medkit" size={18} color={COLORS.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>
                          {c.top_results?.[0]?.name || "Symptom Check"}
                        </Text>
                        <Text style={styles.cardSub}>{fmtDate(c.timestamp)}</Text>
                      </View>
                      <Text style={styles.cardValue}>
                        {c.top_results?.[0]?.match_score ?? "—"}%
                      </Text>
                    </View>
                    <Text style={styles.cardMeta} numberOfLines={2}>
                      Symptoms: {(c.symptoms || []).join(", ")}
                    </Text>
                  </View>
                ))
              )}
            </>
          )}

          {tab === "chats" && (
            <>
              {chats.length === 0 ? (
                <Text style={styles.empty} testID="empty-chats">
                  No conversations yet. Talk to MediBot!
                </Text>
              ) : (
                chats.map((s) => (
                  <View key={s.session_id} style={styles.card} testID="chat-history-item">
                    <View style={styles.cardTop}>
                      <View style={styles.cardIcon}>
                        <Ionicons name="chatbubbles" size={18} color={COLORS.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {s.last_role === "user" ? "You" : "MediBot"}: {s.last_message}
                        </Text>
                        <Text style={styles.cardSub}>{fmtDate(s.last_at)}</Text>
                      </View>
                      <Text style={styles.cardValue}>{s.message_count} msgs</Text>
                    </View>
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: FONT.black,
    color: COLORS.text_primary,
  },
  tabRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
  },
  tabBtnActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: 11,
    fontWeight: FONT.bold,
    color: COLORS.primary,
  },
  tabTextActive: { color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: {
    padding: SPACING.lg,
    paddingTop: SPACING.sm,
    gap: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  empty: {
    textAlign: "center",
    color: COLORS.text_secondary,
    fontSize: 14,
    paddingVertical: SPACING.xl,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#E7F0EA",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: FONT.bold,
    color: COLORS.text_primary,
  },
  cardSub: {
    fontSize: 11,
    color: COLORS.text_secondary,
    marginTop: 2,
  },
  cardValue: {
    fontSize: 13,
    fontWeight: FONT.extrabold,
    color: COLORS.primary,
  },
  cardMetaRow: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  cardMeta: {
    fontSize: 12,
    color: COLORS.text_secondary,
    fontWeight: FONT.semibold,
  },
});
