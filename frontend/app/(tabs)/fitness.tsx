import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { Accelerometer } from "expo-sensors";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { API_URL, COLORS, FONT, RADIUS, SPACING } from "../../constants/theme";
import { POSE_TRACKER_HTML } from "../../constants/poseTrackerHtml";
import { useAuth } from "../../contexts/AuthContext";

type Exercise = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  muscle_groups: string[];
  difficulty: string;
  calories_per_10_reps: number;
  tracking_mode: "reps" | "time";
  motion_axis: "x" | "y" | "xyz" | "none";
  form_tips: string[];
};

function formatTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

// Motion-peak based rep detection using magnitude + gravity removal.
// A low-pass filter tracks the gravity baseline so we only see MOTION.
// A rep = one "peak then settle" cycle. Works regardless of phone orientation.
function useAccelRepCounter(options: {
  enabled: boolean;
  threshold: number;
  onRep: () => void;
  onSignal?: (intensity: number) => void;
}) {
  const { enabled, threshold, onRep, onSignal } = options;
  const inPeakRef = useRef<boolean>(false);
  const lastRepAtRef = useRef<number>(0);
  // Low-pass gravity baseline
  const gRef = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const initRef = useRef<boolean>(false);
  // Peak tracking for adaptive behaviour
  const peakMagRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) {
      inPeakRef.current = false;
      initRef.current = false;
      return;
    }
    Accelerometer.setUpdateInterval(60);
    const alpha = 0.85; // gravity smoothing factor
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      if (!initRef.current) {
        gRef.current = { x, y, z };
        initRef.current = true;
        return;
      }
      // Update gravity baseline (low-pass)
      gRef.current.x = alpha * gRef.current.x + (1 - alpha) * x;
      gRef.current.y = alpha * gRef.current.y + (1 - alpha) * y;
      gRef.current.z = alpha * gRef.current.z + (1 - alpha) * z;
      // Motion = raw - gravity
      const mx = x - gRef.current.x;
      const my = y - gRef.current.y;
      const mz = z - gRef.current.z;
      const mag = Math.sqrt(mx * mx + my * my + mz * mz);

      if (onSignal) onSignal(mag);

      const now = Date.now();
      if (now - lastRepAtRef.current < 450) return; // debounce

      // Peak-valley detection with hysteresis
      if (!inPeakRef.current && mag > threshold) {
        inPeakRef.current = true;
        peakMagRef.current = mag;
      } else if (inPeakRef.current) {
        // still inside peak — track the max
        if (mag > peakMagRef.current) peakMagRef.current = mag;
        // fell back below half threshold → rep done
        if (mag < threshold * 0.4) {
          inPeakRef.current = false;
          lastRepAtRef.current = now;
          peakMagRef.current = 0;
          onRep();
        }
      }
    });
    return () => sub.remove();
  }, [enabled, threshold, onRep, onSignal]);
}

export default function FitnessScreen() {
  const { token } = useAuth();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [reps, setReps] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Camera + auto-detect states
  const [cameraOn, setCameraOn] = useState(false);
  const [autoDetect, setAutoDetect] = useState(false);
  const [aiVisionMode, setAiVisionMode] = useState(false);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [accelAvailable, setAccelAvailable] = useState(true);
  const [motionLevel, setMotionLevel] = useState(0);
  const webViewRef = useRef<WebView>(null);

  const handleWebMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "rep") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        setReps(data.count);
        setRunning(true);
      }
    } catch {}
  }, []);

  const poseHtml = useMemo(() => POSE_TRACKER_HTML, []);

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
    Accelerometer.isAvailableAsync()
      .then(setAccelAvailable)
      .catch(() => setAccelAvailable(false));
  }, []);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const onAutoRep = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setReps((r) => r + 1);
    if (!running) setRunning(true);
  }, [running]);

  useAccelRepCounter({
    enabled: autoDetect && !!selected && selected.tracking_mode === "reps",
    threshold: 0.25,
    onRep: onAutoRep,
    onSignal: setMotionLevel,
  });

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
    if (!selected) return;
    const hasProgress = selected.tracking_mode === "time" ? seconds > 0 : reps > 0;
    if (!hasProgress) {
      setSelected(null);
      setCameraOn(false);
      setAutoDetect(false);
      resetWorkout();
      return;
    }
    setSaving(true);
    try {
      await fetch(`${API_URL}/workouts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          exercise: selected.name,
          reps: selected.tracking_mode === "time" ? 1 : reps,
          duration_seconds: seconds,
        }),
      });
      setSavedMsg("Workout saved!");
      setTimeout(() => {
        setSelected(null);
        setCameraOn(false);
        setAutoDetect(false);
        resetWorkout();
      }, 1200);
    } catch {
      setSavedMsg("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const enableCamera = async () => {
    if (!camPermission?.granted) {
      const res = await requestCamPermission();
      if (!res.granted) return;
    }
    setCameraOn(true);
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
            Camera + motion detection auto-counts reps. Manual tap always works.
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
                      <Text style={styles.difficultyText}>{ex.difficulty}</Text>
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
                    {ex.tracking_mode === "time" && (
                      <View
                        style={[
                          styles.muscleTag,
                          { backgroundColor: "#FBE8E2", borderColor: "#FBE8E2" },
                        ]}
                      >
                        <Text
                          style={[styles.muscleText, { color: COLORS.accent }]}
                        >
                          Timed
                        </Text>
                      </View>
                    )}
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
    ((selected.tracking_mode === "time" ? seconds / 10 : reps / 10) *
      selected.calories_per_10_reps)
  );
  const isTimed = selected.tracking_mode === "time";

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
              setCameraOn(false);
              setAutoDetect(false);
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

        {/* Camera / AI Vision preview */}
        {aiVisionMode ? (
          <View style={styles.cameraBox} testID="ai-pose-webview">
            <WebView
              ref={webViewRef}
              originWhitelist={["*"]}
              source={{
                html: poseHtml,
                baseUrl: "https://healthmate.app/",
              }}
              style={StyleSheet.absoluteFill}
              javaScriptEnabled
              domStorageEnabled
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              onMessage={handleWebMessage}
              injectedJavaScript={`window.location.hash = 'exercise=${selected.id}'; if(window.healthmate)window.healthmate.setExercise('${selected.id}'); true;`}
            />
            <View style={styles.cameraOverlay}>
              <View style={styles.overlayTopRow}>
                <View style={styles.recDot} />
                <Text style={styles.cameraOverlayText}>AI POSE</Text>
              </View>
              <TouchableOpacity
                style={styles.cameraClose}
                onPress={() => {
                  setAiVisionMode(false);
                  setCameraOn(false);
                }}
                testID="ai-close-btn"
              >
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        ) : cameraOn && camPermission?.granted ? (
          <View style={styles.cameraBox} testID="camera-preview">
            <CameraView style={StyleSheet.absoluteFill} facing="front" />
            <View style={styles.cameraOverlay}>
              <View style={styles.overlayTopRow}>
                <View style={styles.recDot} />
                <Text style={styles.cameraOverlayText}>
                  {autoDetect ? "AUTO-DETECTING" : "CAMERA"}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.cameraClose}
                onPress={() => {
                  setCameraOn(false);
                  setAutoDetect(false);
                }}
                testID="camera-close-btn"
              >
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.coachRow}>
            <TouchableOpacity
              style={styles.coachBtn}
              onPress={async () => {
                if (!camPermission?.granted) {
                  const r = await requestCamPermission();
                  if (!r.granted) return;
                }
                setAiVisionMode(true);
                setCameraOn(false);
                setAutoDetect(false);
                setReps(0);
                setRunning(true);
              }}
              testID="enable-ai-vision-btn"
            >
              <Ionicons name="scan" size={24} color="#fff" />
              <Text style={styles.coachBtnText}>AI Pose Vision</Text>
              <Text style={styles.coachBtnSub}>Counts reps via camera</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.coachBtnAlt}
              onPress={enableCamera}
              testID="enable-camera-btn"
            >
              <Ionicons name="videocam" size={24} color={COLORS.primary} />
              <Text style={styles.coachBtnAltText}>Camera Only</Text>
              <Text style={styles.coachBtnAltSub}>Manual + motion</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Counter */}
        <View style={styles.counterCard}>
          <Text style={styles.counterLabel}>
            {isTimed ? "TIME" : "REPS"}
          </Text>
          <Text style={styles.counterValue} testID="rep-counter">
            {isTimed ? formatTime(seconds) : reps}
          </Text>
          <View style={styles.counterStatsRow}>
            {!isTimed && (
              <View style={styles.counterStat}>
                <Ionicons name="time" size={16} color={COLORS.secondary} />
                <Text style={styles.counterStatText}>
                  {formatTime(seconds)}
                </Text>
              </View>
            )}
            <View style={styles.counterStat}>
              <Ionicons name="flame" size={16} color={COLORS.accent} />
              <Text style={styles.counterStatText}>{caloriesBurned} cal</Text>
            </View>
          </View>
        </View>

        {/* Auto-detect toggle */}
        {!isTimed && (
          <View style={styles.autoRow} testID="auto-detect-row">
            <View style={{ flex: 1 }}>
              <Text style={styles.autoTitle}>Auto-Detect Reps</Text>
              <Text style={styles.autoSub}>
                {accelAvailable
                  ? "Hold your phone firmly (in your hand, strapped to arm, or in a tight pocket). Do full-range reps — the motion bar below should spike on each rep."
                  : "Motion sensor unavailable on this device."}
              </Text>
              {autoDetect && (
                <View style={styles.motionBarWrap} testID="motion-bar">
                  <View
                    style={[
                      styles.motionBarFill,
                      {
                        width: `${Math.min(100, Math.round((motionLevel / 1.0) * 100))}%`,
                        backgroundColor:
                          motionLevel > 0.25 ? COLORS.accent : COLORS.primary,
                      },
                    ]}
                  />
                  <Text style={styles.motionBarText}>
                    Motion: {motionLevel.toFixed(2)}g{" "}
                    {motionLevel > 0.25 ? "• peak!" : ""}
                  </Text>
                </View>
              )}
            </View>
            <Switch
              value={autoDetect}
              onValueChange={setAutoDetect}
              disabled={!accelAvailable}
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
              thumbColor="#fff"
              testID="auto-detect-switch"
            />
          </View>
        )}

        {/* Manual tap */}
        {!isTimed && (
          <TouchableOpacity
            style={styles.bigTapBtn}
            activeOpacity={0.85}
            onPress={incrementRep}
            testID="tap-rep-btn"
          >
            <Ionicons name="add" size={44} color="#fff" />
            <Text style={styles.bigTapText}>TAP TO COUNT</Text>
          </TouchableOpacity>
        )}

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
              style={[styles.ctrlBtnText, running && styles.ctrlBtnTextActive]}
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
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.finishBtnText}>Finish</Text>
              </>
            )}
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
  container: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
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

  // Camera
  cameraPlaceholder: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    backgroundColor: "#EEF1ED",
  },
  coachRow: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  coachBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    alignItems: "center",
    gap: 4,
  },
  coachBtnText: {
    color: "#fff",
    fontWeight: FONT.extrabold,
    fontSize: 14,
    marginTop: 4,
  },
  coachBtnSub: {
    color: "#CFE2D5",
    fontSize: 11,
    fontWeight: FONT.semibold,
  },
  coachBtnAlt: {
    flex: 1,
    backgroundColor: "#EEF1ED",
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  coachBtnAltText: {
    color: COLORS.primary,
    fontWeight: FONT.extrabold,
    fontSize: 14,
    marginTop: 4,
  },
  coachBtnAltSub: {
    color: COLORS.text_secondary,
    fontSize: 11,
    fontWeight: FONT.semibold,
  },
  cameraPlaceholderTitle: {
    fontSize: 16,
    fontWeight: FONT.extrabold,
    color: COLORS.primary,
  },
  cameraPlaceholderSub: {
    fontSize: 13,
    color: COLORS.text_secondary,
    textAlign: "center",
    lineHeight: 18,
  },
  cameraBox: {
    height: 240,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    backgroundColor: "#000",
    position: "relative",
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    padding: SPACING.md,
    justifyContent: "space-between",
    flexDirection: "row",
    alignItems: "flex-start",
  },
  overlayTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
  },
  cameraOverlayText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: FONT.bold,
    letterSpacing: 1,
  },
  cameraClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
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
    fontSize: 96,
    fontWeight: FONT.black,
    color: COLORS.primary,
    letterSpacing: -3,
    lineHeight: 106,
  },
  counterStatsRow: {
    flexDirection: "row",
    gap: SPACING.lg,
    marginTop: SPACING.md,
  },
  counterStat: { flexDirection: "row", gap: 6, alignItems: "center" },
  counterStatText: {
    fontSize: 14,
    fontWeight: FONT.bold,
    color: COLORS.text_primary,
  },

  autoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  autoTitle: {
    fontSize: 15,
    fontWeight: FONT.bold,
    color: COLORS.text_primary,
  },
  autoSub: {
    fontSize: 12,
    color: COLORS.text_secondary,
    marginTop: 2,
    lineHeight: 16,
  },
  motionBarWrap: {
    marginTop: SPACING.sm,
    height: 22,
    borderRadius: RADIUS.full,
    backgroundColor: "#EEF1ED",
    overflow: "hidden",
    justifyContent: "center",
  },
  motionBarFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
  },
  motionBarText: {
    paddingHorizontal: 10,
    fontSize: 11,
    color: COLORS.text_primary,
    fontWeight: FONT.bold,
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
  controlsRow: { flexDirection: "row", gap: SPACING.md },
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
  ctrlBtnActive: { backgroundColor: COLORS.primary },
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
