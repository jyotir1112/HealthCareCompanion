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

export default function RegisterScreen() {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    if (!name.trim() || !email.trim() || !password) {
      setError("Please fill in all fields");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      await register(email.trim(), password, name.trim());
    } catch (e: any) {
      setError(e?.message ?? "Registration failed");
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

          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>
            Start tracking your health in under a minute.
          </Text>

          <View style={styles.inputWrap}>
            <Ionicons name="person" size={18} color={COLORS.text_secondary} />
            <TextInput
              testID="register-name-input"
              placeholder="Your name"
              placeholderTextColor={COLORS.text_secondary}
              value={name}
              onChangeText={setName}
              style={styles.input}
            />
          </View>

          <View style={styles.inputWrap}>
            <Ionicons name="mail" size={18} color={COLORS.text_secondary} />
            <TextInput
              testID="register-email-input"
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
              testID="register-password-input"
              placeholder="Password (min 6 chars)"
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
            <Text style={styles.error} testID="register-error">
              {error}
            </Text>
          )}

          <TouchableOpacity
            testID="register-submit-btn"
            style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
            onPress={onSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity testID="go-to-login-btn">
                <Text style={styles.footerLink}>Sign In</Text>
              </TouchableOpacity>
            </Link>
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
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: SPACING.sm,
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
});
