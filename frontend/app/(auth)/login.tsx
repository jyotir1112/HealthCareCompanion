import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS, FONT, RADIUS, SPACING } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError("Please enter email and password");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (e: any) {
      setError(e?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoWrap}>
            <View style={styles.logo}>
              <Ionicons name="medical" size={32} color="#fff" />
            </View>
            <Text style={styles.brand}>HealthMate</Text>
          </View>

          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>
            Sign in to continue your wellness journey.
          </Text>

          <View style={styles.inputWrap}>
            <Ionicons name="mail" size={18} color={COLORS.text_secondary} />
            <TextInput
              testID="login-email-input"
              placeholder="Email address"
              placeholderTextColor={COLORS.text_secondary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />
          </View>

          <View style={styles.inputWrap}>
            <Ionicons
              name="lock-closed"
              size={18}
              color={COLORS.text_secondary}
            />
            <TextInput
              testID="login-password-input"
              placeholder="Password"
              placeholderTextColor={COLORS.text_secondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPwd}
              style={styles.input}
            />
            <TouchableOpacity onPress={() => setShowPwd((v) => !v)}>
              <Ionicons
                name={showPwd ? "eye-off" : "eye"}
                size={18}
                color={COLORS.text_secondary}
              />
            </TouchableOpacity>
          </View>

          {error && (
            <Text style={styles.error} testID="login-error">
              {error}
            </Text>
          )}

          <TouchableOpacity
            testID="login-submit-btn"
            style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
            onPress={onSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.divider} />
          </View>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <Link href="/(auth)/register" asChild>
              <TouchableOpacity testID="go-to-register-btn">
                <Text style={styles.footerLink}>Sign Up</Text>
              </TouchableOpacity>
            </Link>
          </View>

          <View style={styles.demoBox}>
            <Text style={styles.demoLabel}>Try the demo:</Text>
            <Text style={styles.demoText}>admin@healthmate.app</Text>
            <Text style={styles.demoText}>Admin@1234</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  container: {
    padding: SPACING.lg,
    paddingTop: SPACING.xl,
    gap: SPACING.md,
    flexGrow: 1,
  },
  logoWrap: {
    alignItems: "center",
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    fontSize: 18,
    fontWeight: FONT.extrabold,
    color: COLORS.text_primary,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 28,
    fontWeight: FONT.black,
    color: COLORS.text_primary,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.text_secondary,
    fontWeight: FONT.medium,
    marginBottom: SPACING.md,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text_primary,
    padding: 0,
  },
  error: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: FONT.semibold,
    textAlign: "center",
  },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACING.sm,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: FONT.bold,
    fontSize: 16,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginVertical: SPACING.sm,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    color: COLORS.text_secondary,
    fontSize: 12,
    fontWeight: FONT.semibold,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  footerText: {
    color: COLORS.text_secondary,
    fontSize: 14,
  },
  footerLink: {
    color: COLORS.primary,
    fontWeight: FONT.bold,
    fontSize: 14,
  },
  demoBox: {
    marginTop: SPACING.lg,
    padding: SPACING.md,
    backgroundColor: "#EEF1ED",
    borderRadius: RADIUS.md,
    alignItems: "center",
    gap: 2,
  },
  demoLabel: {
    fontSize: 11,
    fontWeight: FONT.bold,
    color: COLORS.secondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  demoText: {
    fontSize: 13,
    color: COLORS.text_primary,
    fontWeight: FONT.medium,
  },
});
