import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_URL, COLORS, FONT, RADIUS, SPACING } from "../constants/theme";

type Exercise = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  muscle_groups: string[];
  difficulty: string;
  calories_per_10_reps: number;
  form_tips: string[];
};

function formatTime(s: number) {
  const m = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

export default function FitnessScreen() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [reps, setReps] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/exercises`);
        const data = await res.json();
        setExercises(data.exercises || []);
      } catch {
        // silent
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const incrementRep = () => {
    if (!running) setRunning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setReps((r) => r + 1);
  };

  const resetWorkout = () => {
    setReps(0);
    setSeconds(0);
    setRunning(false);
    setSavedMsg(null);
  };

  const finishWorkout = async () => {
    if (!selected || reps === 0) {
      setSelected(null);
      resetWorkout();
      return;
    }
    setSaving(true);
    try {
      await fetch(`${API_URL}/workouts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exercise: selected.name,
          reps,
          duration_seconds: seconds,
        }),
      });
      setSavedMsg("Workout saved!");
      setTimeout(() => {
        setSelected(null);
        resetWorkout();
      }, 1200);
    } catch {
      setSavedMsg("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  // -------- EXERCISE LIST --------
  if (!selected) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.smallLabel}>TRAIN SMARTER</Text>
          <Text style={styles.title}>AI Fitness Trainer</Text>
          <Text style={styles.subtitle}>
            Tap the counter to log reps. We'll track your time and calories.
          </Text>

          <View style={{ gap: SPACING.md, marginTop: SPACING.lg }}>
            {exercises.map((ex) => (
              <TouchableOpacity
                key={ex.id}
                style={styles.exerciseCard}
                activeOpacity={0.85}
                onPress={() => setSelected(ex)}
                testID={`exercise-${ex.id}`}
              >
                <View style={styles.emojiBox}>
                  <Text style={styles.emoji}>{ex.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.exerciseTopRow}>
                    <Text style={styles.exerciseName}>{ex.name}</Text>
                    <View style={styles.difficultyBadge}>
                      <Text style={styles.difficultyText}>
                        {ex.difficulty}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.exerciseDesc} numberOfLines={2}>
                    {ex.description}
                  </Text>
                  <View style={styles.muscleRow}>
                    {ex.muscle_groups.slice(0, 3).map((m) => (
                      <View key={m} style={styles.muscleTag}>
                        <Text style={styles.muscleText}>{m}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // -------- WORKOUT VIEW --------
  const caloriesBurned = Math.round(
    (reps / 10) * selected.calories_per_10_reps
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.workoutContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.workoutHeader}>
          <TouchableOpacity
            onPress={() => {
              resetWorkout();
              setSelected(null);
            }}
            testID="back-to-exercises-btn"
          >
            <Ionicons
              name="chevron-back"
              size={26}
              color={COLORS.text_primary}
            />
          </TouchableOpacity>
          <Text style={styles.workoutTitle}>{selected.name}</Text>
          <TouchableOpacity onPress={resetWorkout} testID="reset-workout-btn">
            <Ionicons name="refresh" size={22} color={COLORS.text_primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.counterCard}>
          <Text style={styles.counterLabel}>REPS</Text>
          <Text style={styles.counterValue} testID="rep-counter">
            {reps}
          </Text>
          <View style={styles.counterStatsRow}>
            <View style={styles.counterStat}>
              <Ionicons name="time" size={16} color={COLORS.secondary} />
              <Text style={styles.counterStatText}>{formatTime(seconds)}</Text>
            </View>
            <View style={styles.counterStat}>
              <Ionicons name="flame" size={16} color={COLORS.accent} />
              <Text style={styles.counterStatText}>{caloriesBurned} cal</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.bigTapBtn}
          activeOpacity={0.85}
          onPress={incrementRep}
          testID="tap-rep-btn"
        >
          <Ionicons name="add" size={44} color="#fff" />
          <Text style={styles.bigTapText}>TAP TO COUNT</Text>
        </TouchableOpacity>

        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={[styles.ctrlBtn, running && styles.ctrlBtnActive]}
            onPress={() => setRunning((r) => !r)}
            testID="toggle-timer-btn"
          >
            <Ionicons
              name={running ? "pause" : "play"}
              size={18}
              color={running ? "#fff" : COLORS.primary}
            />
            <Text
              style={[
                styles.ctrlBtnText,
                running && styles.ctrlBtnTextActive,
              ]}
            >
              {running ? "Pause" : "Start"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.finishBtn}
            onPress={finishWorkout}
            disabled={saving}
            testID="finish-workout-btn"
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={styles.finishBtnText}>
              {saving ? "Saving..." : "Finish"}
            </Text>
          </TouchableOpacity>
        </View>

        {savedMsg && (
          <Text style={styles.savedMsg} testID="saved-msg">
            {savedMsg}
          </Text>
        )}

        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>
            <Ionicons name="bulb" size={16} color={COLORS.primary} /> Form Tips
          </Text>
          {selected.form_tips.map((tip, i) => (
            <View key={i} style={styles.tipRow}>
              <View style={styles.tipDot} />
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
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
  },
  smallLabel: {
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: FONT.semibold,
    color: COLORS.secondary,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 28,
    fontWeight: FONT.black,
    color: COLORS.text_primary,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.text_secondary,
    marginTop: 6,
    fontWeight: FONT.medium,
  },
  exerciseCard: {
    flexDirection: "row",
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emojiBox: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.md,
    backgroundColor: "#FBE8E2",
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: { fontSize: 32 },
  exerciseTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  exerciseName: {
    fontSize: 17,
    fontWeight: FONT.extrabold,
    color: COLORS.text_primary,
  },
  difficultyBadge: {
    backgroundColor: "#E7F0EA",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  difficultyText: {
    fontSize: 10,
    fontWeight: FONT.bold,
    color: COLORS.primary,
    textTransform: "uppercase",
  },
  exerciseDesc: {
    fontSize: 13,
    color: COLORS.text_secondary,
    marginTop: 4,
    lineHeight: 18,
  },
  muscleRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
    flexWrap: "wrap",
  },
  muscleTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  muscleText: {
    fontSize: 10,
    color: COLORS.text_secondary,
    fontWeight: FONT.semibold,
  },

  // Workout view
  workoutContainer: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    gap: SPACING.md,
  },
  workoutHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  workoutTitle: {
    fontSize: 20,
    fontWeight: FONT.extrabold,
    color: COLORS.text_primary,
  },
  counterCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  counterLabel: {
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: FONT.bold,
    color: COLORS.secondary,
  },
  counterValue: {
    fontSize: 120,
    fontWeight: FONT.black,
    color: COLORS.primary,
    letterSpacing: -4,
    lineHeight: 130,
  },
  counterStatsRow: {
    flexDirection: "row",
    gap: SPACING.lg,
    marginTop: SPACING.md,
  },
  counterStat: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  counterStatText: {
    fontSize: 14,
    fontWeight: FONT.bold,
    color: COLORS.text_primary,
  },
  bigTapBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  bigTapText: {
    color: "#fff",
    fontSize: 14,
    letterSpacing: 2,
    fontWeight: FONT.extrabold,
  },
  controlsRow: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  ctrlBtn: {
    flex: 1,
    flexDirection: "row",
    gap: SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  ctrlBtnActive: {
    backgroundColor: COLORS.primary,
  },
  ctrlBtnText: {
    color: COLORS.primary,
    fontWeight: FONT.bold,
    fontSize: 14,
  },
  ctrlBtnTextActive: { color: "#fff" },
  finishBtn: {
    flex: 1,
    flexDirection: "row",
    gap: SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.accent,
  },
  finishBtnText: {
    color: "#fff",
    fontWeight: FONT.bold,
    fontSize: 14,
  },
  savedMsg: {
    textAlign: "center",
    color: COLORS.primary,
    fontWeight: FONT.bold,
  },
  tipsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  tipsTitle: {
    fontSize: 15,
    fontWeight: FONT.extrabold,
    color: COLORS.text_primary,
    marginBottom: 4,
  },
  tipRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    alignItems: "flex-start",
  },
  tipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
    marginTop: 8,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text_secondary,
    lineHeight: 20,
  },
});
