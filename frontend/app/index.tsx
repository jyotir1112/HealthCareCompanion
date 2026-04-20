import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS, FONT, RADIUS, SPACING } from "../constants/theme";

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
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        testID="home-scroll"
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.smallLabel}>{today}</Text>
            <Text style={styles.greeting}>Hello, 👋</Text>
            <Text style={styles.name}>How are you feeling today?</Text>
          </View>
          <View style={styles.avatar}>
            <Ionicons name="person" size={22} color={COLORS.primary} />
          </View>
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
          <View style={[styles.statCard, { backgroundColor: "#EEF1ED" }]}>
            <Ionicons name="flame" size={22} color={COLORS.accent} />
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Calories Today</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#E7F0EA" }]}>
            <Ionicons name="heart" size={22} color={COLORS.primary} />
            <Text style={styles.statValue}>—</Text>
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
