import { Ionicons } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_URL, COLORS, FONT, RADIUS, SPACING } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const SUGGESTIONS = [
  "How can I improve my sleep?",
  "Is it normal to feel tired all day?",
  "What should I eat for more energy?",
  "How much water should I drink daily?",
];

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function ChatScreen() {
  const { token } = useAuth();
  const [sessionId] = useState(() => uid());
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi, I'm MediBot 👋 — your friendly AI health assistant. Ask me anything about wellness, symptoms, fitness, or healthy habits. Tap the 🎤 to talk, and 🔊 to hear me speak. Remember: I provide general info only, not medical diagnosis.",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const listRef = useRef<FlatList<Msg>>(null);

  // Speak assistant text via expo-speech (works native + web)
  const speak = (text: string) => {
    try {
      Speech.stop();
      Speech.speak(text, { rate: 1.0, pitch: 1.0 });
    } catch {}
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");
    const userMsg: Msg = { id: uid(), role: "user", content };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/chat/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ session_id: sessionId, message: content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Chat failed");
      setMessages((m) => [
        ...m,
        { id: uid(), role: "assistant", content: data.reply },
      ]);
      if (voiceMode) speak(data.reply);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        {
          id: uid(),
          role: "assistant",
          content:
            "Sorry, I couldn't reach the health service right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      try {
        Speech.stop();
      } catch {}
    };
  }, []);

  useEffect(() => {
    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 50);
  }, [messages, loading]);

  const renderItem = ({ item }: { item: Msg }) => {
    const isUser = item.role === "user";
    return (
      <View
        style={[
          styles.bubbleRow,
          { justifyContent: isUser ? "flex-end" : "flex-start" },
        ]}
      >
        {!isUser && (
          <View style={styles.botAvatar}>
            <Ionicons name="medical" size={16} color={COLORS.primary} />
          </View>
        )}
        <View
          style={[
            styles.bubble,
            isUser ? styles.bubbleUser : styles.bubbleAI,
          ]}
          testID={`chat-bubble-${item.role}`}
        >
          <Text
            style={[
              styles.bubbleText,
              { color: isUser ? "#fff" : COLORS.text_primary },
            ]}
          >
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="medical" size={20} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>MediBot</Text>
          <Text style={styles.headerSub}>
            {voiceMode ? "Voice replies on" : "AI Healthcare Assistant"}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.voiceToggle, voiceMode && styles.voiceToggleActive]}
          onPress={() => {
            const next = !voiceMode;
            setVoiceMode(next);
            if (!next) Speech.stop();
          }}
          testID="voice-mode-toggle"
        >
          <Ionicons
            name={voiceMode ? "volume-high" : "volume-mute"}
            size={18}
            color={voiceMode ? "#fff" : COLORS.primary}
          />
        </TouchableOpacity>
        <View style={styles.onlineDot} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.chatList}
          ListFooterComponent={
            loading ? (
              <View style={styles.bubbleRow}>
                <View style={styles.botAvatar}>
                  <Ionicons
                    name="medical"
                    size={16}
                    color={COLORS.primary}
                  />
                </View>
                <View style={[styles.bubble, styles.bubbleAI]}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                </View>
              </View>
            ) : null
          }
          testID="chat-messages-list"
        />

        {messages.length <= 1 && !loading && (
          <View style={styles.suggestionsRow}>
            {SUGGESTIONS.map((s) => (
              <TouchableOpacity
                key={s}
                style={styles.suggestionChip}
                onPress={() => send(s)}
                testID={`suggestion-${s.slice(0, 10)}`}
              >
                <Text style={styles.suggestionText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Ask about your health..."
            placeholderTextColor={COLORS.text_secondary}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => send()}
            returnKeyType="send"
            multiline
            testID="chat-input"
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!input.trim() || loading) && styles.sendBtnDisabled,
            ]}
            onPress={() => send()}
            disabled={!input.trim() || loading}
            testID="chat-send-btn"
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    backgroundColor: "#E7F0EA",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: FONT.extrabold,
    color: COLORS.text_primary,
  },
  headerSub: {
    fontSize: 12,
    color: COLORS.text_secondary,
    fontWeight: FONT.medium,
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#4CAF50",
  },
  chatList: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  bubbleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  botAvatar: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.full,
    backgroundColor: "#E7F0EA",
    alignItems: "center",
    justifyContent: "center",
  },
  bubble: {
    maxWidth: "78%",
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  bubbleUser: {
    backgroundColor: COLORS.primary,
    borderTopRightRadius: 4,
  },
  bubbleAI: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  suggestionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  suggestionChip: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  suggestionText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: FONT.semibold,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 14,
    color: COLORS.text_primary,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: COLORS.secondary,
    opacity: 0.6,
  },
  voiceToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.sm,
  },
  voiceToggleActive: {
    backgroundColor: COLORS.primary,
  },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
  micBtnActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
});
