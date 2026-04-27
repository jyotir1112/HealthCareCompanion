import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_URL, COLORS, FONT, RADIUS, SPACING } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";

const HERO_IMAGE =
  "https://images.pexels.com/photos/7991909/pexels-photo-7991909.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

type FeatureKey = "symptoms" | "fitness" | "chat";

const FEATURES: {
  key: FeatureKey;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
}[] = [
  {
    key: "symptoms",
    title: "Symptom Checker",
    subtitle: "AI-powered preliminary health assessment",
    icon: "medkit",
    color: "#2A5C43",
    bg: "#E7F0EA",
  },
  {
    key: "fitness",
    title: "AI Fitness Trainer",
    subtitle: "Track reps for push-ups, pull-ups & squats",
    icon: "barbell",
    color: "#C25E46",
    bg: "#FBE8E2",
  },
  {
    key: "chat",
    title: "MediBot Chat",
    subtitle: "24/7 healthcare assistant powered by AI",
    icon: "chatbubbles",
    color: "#8A9E88",
    bg: "#EEF1ED",
  },
];

export default function Home() {
  const router = useRouter();
  const { user, token, logout } = useAuth();
  const [caloriesToday, setCaloriesToday] = useState<number>(0);
  const [workoutCount, setWorkoutCount] = useState<number>(0);
  const [lastCheckup, setLastCheckup] = useState<string | null>(null);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const loadStats = useCallback(async () => {
    if (!token) return;
    try {
      const [calRes, lastRes] = await Promise.all([
        fetch(`${API_URL}/workouts/me/today`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/symptom-checks/me/last`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (calRes.ok) {
        const d = await calRes.json();
        setCaloriesToday(d.total_calories || 0);
        setWorkoutCount(d.workout_count || 0);
      }
      if (lastRes.ok) {
        const d = await lastRes.json();
        const ts = d?.last_check?.timestamp;
        if (ts) {
          const dt = new Date(ts);
          setLastCheckup(
            dt.toLocaleDateString(undefined, { month: "short", day: "numeric" })
          );
        } else {
          setLastCheckup(null);
        }
      }
    } catch {
      // silent
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  const confirmLogout = () => {
    if (Platform.OS === "web") {
      if (window.confirm("Sign out of HealthMate?")) logout();
      return;
    }
    Alert.alert("Sign out", "Sign out of HealthMate?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => logout() },
    ]);
  };

  const firstName = (user?.name ?? "").split(" ")[0] || "there";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        testID="home-scroll"
      >
        {/* Header with custom logo */}
        <View style={styles.headerRow}>
          <View style={styles.logoBubble} testID="app-logo">
            <Ionicons name="heart-circle" size={28} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.smallLabel}>{today}</Text>
            <Text style={styles.greeting} testID="home-greeting">
              Hello, {firstName} 👋
            </Text>
            <Text style={styles.name}>How are you feeling today?</Text>
          </View>
          <TouchableOpacity
            style={styles.avatar}
            onPress={confirmLogout}
            testID="logout-btn"
          >
            <Ionicons name="log-out-outline" size={22} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* Hero Card */}
        <View style={styles.heroCard} testID="home-hero">
          <Image source={{ uri: HERO_IMAGE }} style={styles.heroImage} />
          <View style={styles.heroOverlay} />
          <View style={styles.heroContent}>
            <Text style={styles.heroLabel}>DAILY WELLNESS</Text>
            <Text style={styles.heroTitle}>Your complete health companion</Text>
            <Text style={styles.heroSub}>
              Symptoms • Fitness • AI Chat — all in one place.
            </Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View
            style={[styles.statCard, { backgroundColor: "#EEF1ED" }]}
            testID="calories-stat"
          >
            <Ionicons name="flame" size={22} color={COLORS.accent} />
            <Text style={styles.statValue}>{caloriesToday}</Text>
            <Text style={styles.statLabel}>
              Calories Today{workoutCount ? ` · ${workoutCount}` : ""}
            </Text>
          </View>
          <View
            style={[styles.statCard, { backgroundColor: "#E7F0EA" }]}
            testID="checkup-stat"
          >
            <Ionicons name="heart" size={22} color={COLORS.primary} />
            <Text style={styles.statValue}>{lastCheckup ?? "—"}</Text>
            <Text style={styles.statLabel}>Last Check-up</Text>
          </View>
        </View>

        {/* Features */}
        <Text style={styles.sectionTitle}>Explore Features</Text>

        {FEATURES.map((f) => (
          <TouchableOpacity
            key={f.key}
            activeOpacity={0.85}
            onPress={() => router.push(`/${f.key}` as never)}
            style={styles.featureCard}
            testID={`feature-card-${f.key}`}
          >
            <View style={[styles.featureIcon, { backgroundColor: f.bg }]}>
              <Ionicons name={f.icon} size={28} color={f.color} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureSubtitle}>{f.subtitle}</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={22}
              color={COLORS.text_secondary}
            />
          </TouchableOpacity>
        ))}

        {/* Disclaimer */}
        <View style={styles.disclaimer} testID="home-disclaimer">
          <Ionicons
            name="information-circle"
            size={18}
            color={COLORS.text_secondary}
          />
          <Text style={styles.disclaimerText}>
            HealthMate provides general guidance. Always consult a licensed
            healthcare professional for medical advice.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  container: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    gap: SPACING.lg,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: SPACING.sm,
  },
  logoBubble: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  smallLabel: {
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: FONT.semibold,
    color: COLORS.secondary,
    textTransform: "uppercase",
  },
  greeting: {
    fontSize: 28,
    fontWeight: FONT.black,
    color: COLORS.text_primary,
    marginTop: 4,
  },
  name: {
    fontSize: 15,
    fontWeight: FONT.medium,
    color: COLORS.text_secondary,
    marginTop: 2,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    backgroundColor: "#E7F0EA",
    alignItems: "center",
    justifyContent: "center",
  },
  heroCard: {
    height: 180,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    backgroundColor: COLORS.primary,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(42, 92, 67, 0.55)",
  },
  heroContent: {
    flex: 1,
    padding: SPACING.lg,
    justifyContent: "flex-end",
  },
  heroLabel: {
    color: "#CFE2D5",
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: FONT.bold,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: FONT.black,
    marginTop: 4,
  },
  heroSub: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    marginTop: 4,
    fontWeight: FONT.medium,
  },
  statsRow: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  statCard: {
    flex: 1,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    gap: 6,
  },
  statValue: {
    fontSize: 22,
    fontWeight: FONT.black,
    color: COLORS.text_primary,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.text_secondary,
    fontWeight: FONT.semibold,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: FONT.extrabold,
    color: COLORS.text_primary,
    marginTop: SPACING.sm,
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.md,
  },
  featureIcon: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: { flex: 1 },
  featureTitle: {
    fontSize: 16,
    fontWeight: FONT.bold,
    color: COLORS.text_primary,
  },
  featureSubtitle: {
    fontSize: 13,
    color: COLORS.text_secondary,
    marginTop: 2,
  },
  disclaimer: {
    flexDirection: "row",
    gap: SPACING.sm,
    backgroundColor: "#EEF1ED",
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: "flex-start",
    marginTop: SPACING.sm,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.text_secondary,
    lineHeight: 18,
  },
});
