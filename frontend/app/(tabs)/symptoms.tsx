import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_URL, COLORS, FONT, RADIUS, SPACING } from "../../constants/theme";

type Disease = {
  name: string;
  match_score: number;
  description: string;
  recommendation: string;
  specialist: string;
  severity: "mild" | "moderate" | "severe";
};

const severityColor = (s: string) => {
  if (s === "severe") return "#C25E46";
  if (s === "moderate") return "#E0A458";
  return "#2A5C43";
};

export default function SymptomsScreen() {
  const [allSymptoms, setAllSymptoms] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Disease[] | null>(null);
  const [disclaimer, setDisclaimer] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSymptoms = async () => {
      try {
        const res = await fetch(`${API_URL}/symptoms`);
        const data = await res.json();
        setAllSymptoms(data.symptoms || []);
      } catch (e) {
        setError("Failed to load symptoms. Please try again.");
      }
    };
    fetchSymptoms();
  }, []);

  const toggleSymptom = (s: string) => {
    const copy = new Set(selected);
    if (copy.has(s)) copy.delete(s);
    else copy.add(s);
    setSelected(copy);
  };

  const analyze = async () => {
    if (selected.size === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/symptoms/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symptoms: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Request failed");
      setResults(data.results);
      setDisclaimer(data.disclaimer);
      setShowResults(true);
    } catch (e: any) {
      setError(e.message || "Failed to analyze");
    } finally {
      setLoading(false);
    }
  };

  const filtered = allSymptoms.filter((s) =>
    s.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.smallLabel}>STEP 1 OF 2</Text>
        <Text style={styles.title}>Symptom Checker</Text>
        <Text style={styles.subtitle}>
          Select all symptoms you are experiencing
        </Text>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={COLORS.text_secondary} />
        <TextInput
          testID="symptom-search"
          placeholder="Search symptoms..."
          placeholderTextColor={COLORS.text_secondary}
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
      </View>

      {selected.size > 0 && (
        <View style={styles.selectedBar} testID="selected-bar">
          <Text style={styles.selectedText}>
            {selected.size} selected
          </Text>
          <TouchableOpacity
            onPress={() => setSelected(new Set())}
            testID="clear-symptoms-btn"
          >
            <Text style={styles.clearText}>Clear all</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.chipsContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.chipsWrap}>
          {filtered.map((s) => {
            const active = selected.has(s);
            return (
              <TouchableOpacity
                key={s}
                onPress={() => toggleSymptom(s)}
                style={[styles.chip, active && styles.chipActive]}
                testID={`symptom-chip-${s.replace(/\s/g, "-")}`}
              >
                <Text
                  style={[
                    styles.chipText,
                    active && styles.chipTextActive,
                  ]}
                >
                  {s}
                </Text>
              </TouchableOpacity>
            );
          })}
          {filtered.length === 0 && (
            <Text style={styles.emptyText}>No symptoms match your search.</Text>
          )}
        </View>
      </ScrollView>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.bottomBar}>
        <TouchableOpacity
          testID="analyze-symptoms-btn"
          style={[
            styles.primaryBtn,
            (selected.size === 0 || loading) && styles.primaryBtnDisabled,
          ]}
          disabled={selected.size === 0 || loading}
          onPress={analyze}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="analytics" size={20} color="#fff" />
              <Text style={styles.primaryBtnText}>
                Analyze {selected.size > 0 ? `(${selected.size})` : ""}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={showResults}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowResults(false)}
      >
        <SafeAreaView style={styles.safe} edges={["top"]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setShowResults(false)}
              testID="close-results-btn"
            >
              <Ionicons name="close" size={26} color={COLORS.text_primary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Assessment Results</Text>
            <View style={{ width: 26 }} />
          </View>
          <ScrollView
            contentContainerStyle={styles.modalBody}
            showsVerticalScrollIndicator={false}
          >
            {results && results.length === 0 ? (
              <Text style={styles.emptyText}>
                No matches found for selected symptoms. Try selecting more.
              </Text>
            ) : (
              results?.map((d, i) => (
                <View key={i} style={styles.resultCard} testID={`result-${i}`}>
                  <View style={styles.resultTopRow}>
                    <Text style={styles.resultName}>{d.name}</Text>
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: severityColor(d.severity) + "22" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          { color: severityColor(d.severity) },
                        ]}
                      >
                        {d.match_score}% match
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.resultDesc}>{d.description}</Text>

                  <View style={styles.resultSection}>
                    <Text style={styles.resultLabel}>
                      <Ionicons name="bulb" size={14} color={COLORS.primary} />
                      {"  "}Recommendation
                    </Text>
                    <Text style={styles.resultSub}>{d.recommendation}</Text>
                  </View>

                  <View style={styles.resultSection}>
                    <Text style={styles.resultLabel}>
                      <Ionicons
                        name="person"
                        size={14}
                        color={COLORS.primary}
                      />
                      {"  "}Specialist
                    </Text>
                    <Text style={styles.resultSub}>{d.specialist}</Text>
                  </View>

                  <View style={styles.resultSection}>
                    <Text style={styles.resultLabel}>
                      <Ionicons
                        name="alert-circle"
                        size={14}
                        color={severityColor(d.severity)}
                      />
                      {"  "}Severity
                    </Text>
                    <Text
                      style={[
                        styles.resultSub,
                        { color: severityColor(d.severity), fontWeight: FONT.bold },
                      ]}
                    >
                      {d.severity.toUpperCase()}
                    </Text>
                  </View>
                </View>
              ))
            )}

            {disclaimer && (
              <View style={styles.disclaimerCard}>
                <Ionicons
                  name="warning"
                  size={18}
                  color={COLORS.accent}
                />
                <Text style={styles.disclaimerText}>{disclaimer}</Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
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
    marginTop: 4,
    fontWeight: FONT.medium,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text_primary,
    padding: 0,
  },
  selectedBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
  },
  selectedText: {
    fontSize: 13,
    fontWeight: FONT.bold,
    color: COLORS.primary,
  },
  clearText: {
    fontSize: 13,
    fontWeight: FONT.semibold,
    color: COLORS.accent,
  },
  chipsContainer: {
    padding: SPACING.lg,
    paddingBottom: 120,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: FONT.semibold,
    color: COLORS.text_primary,
    textTransform: "capitalize",
  },
  chipTextActive: { color: "#fff" },
  emptyText: {
    color: COLORS.text_secondary,
    fontSize: 14,
    padding: SPACING.md,
  },
  errorText: {
    color: COLORS.accent,
    textAlign: "center",
    paddingHorizontal: SPACING.lg,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: SPACING.lg,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  primaryBtn: {
    flexDirection: "row",
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
  },
  primaryBtnDisabled: {
    backgroundColor: COLORS.secondary,
    opacity: 0.6,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: FONT.bold,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: FONT.extrabold,
    color: COLORS.text_primary,
  },
  modalBody: {
    padding: SPACING.lg,
    gap: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  resultCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  resultTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  resultName: {
    fontSize: 18,
    fontWeight: FONT.extrabold,
    color: COLORS.text_primary,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: FONT.bold,
  },
  resultDesc: {
    fontSize: 14,
    color: COLORS.text_secondary,
    lineHeight: 20,
  },
  resultSection: {
    marginTop: 4,
  },
  resultLabel: {
    fontSize: 12,
    fontWeight: FONT.bold,
    color: COLORS.primary,
    marginBottom: 2,
  },
  resultSub: {
    fontSize: 13,
    color: COLORS.text_primary,
    lineHeight: 19,
  },
  disclaimerCard: {
    flexDirection: "row",
    gap: SPACING.sm,
    backgroundColor: "#FBE8E2",
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: "flex-start",
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    color: "#6B2F1F",
    lineHeight: 18,
  },
});
