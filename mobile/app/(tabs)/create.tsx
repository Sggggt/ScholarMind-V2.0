import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Fonts } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import {
  createChatSessionApi,
  fetchChatSessionApi,
  fetchChatSessionsApi,
  sendChatMessageApi,
} from "@/lib/api";
import { useTaskContext } from "@/lib/task-store";
import type { ChatMessage, ChatSession, ChatSessionDetail, Task } from "@/lib/types";

function formatTimeLabel(value: string) {
  const date = new Date(value);
  return date.toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const colors = useColors();
  const isAssistant = message.role === "assistant";

  return (
    <View style={[styles.messageRow, isAssistant ? styles.messageRowLeft : styles.messageRowRight]}>
      <View
        style={[
          styles.messageBubble,
          isAssistant
            ? { backgroundColor: colors.surface, borderColor: colors.border }
            : { backgroundColor: colors.primary, borderColor: colors.primary },
        ]}
      >
        <Text
          style={[
            styles.messageRole,
            { color: isAssistant ? colors.muted : "rgba(255,255,255,0.78)" },
          ]}
        >
          {isAssistant ? "ScholarMind" : "我"}
        </Text>
        <Text style={[styles.messageText, { color: isAssistant ? colors.foreground : "#ffffff" }]}>
          {message.content}
        </Text>
        <Text
          style={[
            styles.messageMeta,
            { color: isAssistant ? colors.muted : "rgba(255,255,255,0.7)" },
          ]}
        >
          {formatTimeLabel(message.created_at)}
        </Text>
      </View>
    </View>
  );
}

export default function TaskChatScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const { state, selectCurrentTask, fetchTasks, loadTaskBundle } = useTaskContext();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [allTaskSessions, setAllTaskSessions] = useState<ChatSession[]>([]);
  const [error, setError] = useState("");
  const pendingSessionRef = useRef<Promise<ChatSessionDetail> | null>(null);

  const createFreshSession = useCallback(async () => {
    if (pendingSessionRef.current) {
      return pendingSessionRef.current;
    }

    const pending = createChatSessionApi("");
    pendingSessionRef.current = pending;

    try {
      return await pending;
    } finally {
      pendingSessionRef.current = null;
    }
  }, []);

  const applySessionDetail = useCallback(
    (detail: ChatSessionDetail, sessions: ChatSession[]) => {
      setSession(detail.session);
      setMessages(detail.messages);
      setAllTaskSessions(
        detail.session.task_id
          ? sessions.filter((item) => item.task_id === detail.session.task_id)
          : [detail.session]
      );

      if (detail.task) {
        selectCurrentTask(detail.task);
      }
    },
    [selectCurrentTask]
  );

  const loadCurrentTaskChat = useCallback(
    async (showLoading = true) => {
      if (showLoading) {
        setLoading(true);
      }

      try {
        setError("");
        const sessions = (await fetchChatSessionsApi()).sort(
          (left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at)
        );
        const requestedSessionId = typeof params.sessionId === "string" ? params.sessionId : "";
        const requestedSession = sessions.find((item) => item.id === requestedSessionId) ?? null;
        const currentTaskSession = state.currentTaskId
          ? sessions.find((item) => item.task_id === state.currentTaskId) ?? null
          : null;
        const shouldCreateFreshSession =
          !requestedSession && (!sessions.length || Boolean(state.currentTaskId && !currentTaskSession));
        const fallbackSession = requestedSession ?? currentTaskSession ?? sessions[0] ?? null;

        if (shouldCreateFreshSession || !fallbackSession) {
          const created = await createFreshSession();
          applySessionDetail(created, [created.session]);
          router.replace(`/create?sessionId=${created.session.id}` as never);
          return;
        }

        const detail =
          requestedSession && requestedSession.id === fallbackSession.id
            ? await fetchChatSessionApi(requestedSession.id)
            : await fetchChatSessionApi(fallbackSession.id);
        applySessionDetail(detail, sessions);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "无法加载当前对话。");
        setSession(null);
        setMessages([]);
        setAllTaskSessions([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [applySessionDetail, createFreshSession, params.sessionId, router, state.currentTaskId]
  );

  useFocusEffect(
    useCallback(() => {
      void fetchTasks({ background: true });
      void loadCurrentTaskChat(true);
    }, [fetchTasks, loadCurrentTaskChat])
  );

  useEffect(() => {
    void loadCurrentTaskChat(false);
  }, [loadCurrentTaskChat, params.sessionId]);

  const activeTask = useMemo(() => {
    if (!session?.task_id) {
      return null;
    }

    if (state.currentTask?.id === session.task_id) {
      return state.currentTask;
    }

    return state.tasks.find((task) => task.id === session.task_id) ?? null;
  }, [session?.task_id, state.currentTask, state.tasks]);

  const isStarterSession = useMemo(() => {
    if (!session || activeTask) {
      return false;
    }

    return !messages.some((message) => message.role === "user");
  }, [activeTask, messages, session]);

  const visibleMessages = useMemo(() => {
    if (!session) {
      return [];
    }

    if (isStarterSession) {
      return [];
    }

    return messages;
  }, [isStarterSession, messages, session]);

  const chatStatusText = useMemo(() => {
    if (!session) {
      return "正在准备新对话…";
    }
    if (!activeTask) {
      return "首条消息会自动创建研究任务。";
    }
    return `已绑定任务，共关联 ${allTaskSessions.length} 个会话。`;
  }, [activeTask, allTaskSessions.length, session]);

  const handleSend = useCallback(async () => {
    const trimmedDraft = draft.trim();
    if (!session || !trimmedDraft || sending) return;

    setSending(true);
    const optimisticMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      session_id: session.id,
      role: "user",
      kind: "text",
      content: trimmedDraft,
      created_at: new Date().toISOString(),
      metadata: {},
    };

    setMessages((current) => [...current, optimisticMessage]);
    setDraft("");

    try {
      setError("");
      const response = await sendChatMessageApi(session.id, { content: trimmedDraft });
      setSession(response.session);
      setMessages((current) => [
        ...current.filter((item) => item.id !== optimisticMessage.id),
        response.user_message,
        response.assistant_message,
      ]);

      if (response.session.task_id) {
        setAllTaskSessions([response.session]);
      }

      if (response.task) {
        selectCurrentTask(response.task);
        await Promise.allSettled([
          fetchTasks({ background: true }),
          loadTaskBundle(response.task.id, { background: true }),
        ]);
      }
    } catch {
      setMessages((current) => current.filter((item) => item.id !== optimisticMessage.id));
      setDraft(trimmedDraft);
      setError("当前无法发送消息。");
    } finally {
      setSending(false);
    }
  }, [draft, fetchTasks, loadTaskBundle, selectCurrentTask, sending, session]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchTasks({ background: true });
    void loadCurrentTaskChat(false);
  }, [fetchTasks, loadCurrentTaskChat]);

  const scrollRefreshControl =
    Platform.OS === "ios" ? (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={handleRefresh}
        tintColor={colors.primary}
      />
    ) : undefined;

  const pageContent = (
    <View style={styles.contentShell}>
      <LinearGradient
        colors={[
          `${colors.background}E6`,
          `${colors.surface}CC`,
          `${colors.background}99`,
        ]}
        style={styles.compactHeader}
      >
        <View style={styles.compactHeaderContent}>
          <View style={styles.compactHeaderLeft}>
            <Text style={[styles.compactTitle, { color: colors.primary }]} numberOfLines={1}>
              {activeTask?.title || "新对话"}
            </Text>
            <Text style={[styles.compactSubtitle, { color: colors.muted }]} numberOfLines={1}>
              {chatStatusText}
            </Text>
          </View>
          <View style={styles.compactHeaderActions}>
            <TouchableOpacity
              onPress={handleRefresh}
              style={[styles.compactIcon, { backgroundColor: colors.surface }]}
            >
              <MaterialIcons name="refresh" size={18} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/")}
              style={[styles.compactIcon, { backgroundColor: colors.surface }]}
            >
              <MaterialIcons name="assignment" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.scrollRegion}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={scrollRefreshControl}
        >
          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.centerText, { color: colors.muted }]}>正在加载对话...</Text>
            </View>
          ) : isStarterSession ? (
            <View style={styles.starterCard}>
              <Text style={[styles.starterTitle, { color: colors.foreground }]}>今天想研究什么</Text>
              <Text style={[styles.starterText, { color: colors.muted }]}>
                先把问题、场景、约束或预期产出说清楚。发送首条消息后，ScholarMind 会自动创建任务并同步到任务页。
              </Text>
            </View>
          ) : (
            <>
              {visibleMessages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </ScrollView>
      </View>

      <View
        style={[
          styles.composerDock,
          {
            backgroundColor: `${colors.background}F6`,
            borderTopColor: `${colors.border}A0`,
          },
        ]}
      >
        <View
          style={[
            styles.composerRow,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={
              session
                ? activeTask
                  ? "输入你想和 ScholarMind 讨论的内容..."
                  : "描述你今天想研究的问题..."
                : "正在准备新对话..."
            }
            placeholderTextColor={colors.muted}
            style={[styles.composerInput, { color: colors.foreground }]}
            multiline
            editable={Boolean(session) && !sending}
          />
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => void handleSend()}
            disabled={!session || sending || !draft.trim()}
            style={[
              styles.sendButton,
              { backgroundColor: session && draft.trim() ? colors.primary : colors.border },
            ]}
          >
            {sending ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <MaterialIcons name="north" size={18} color="#ffffff" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <ScreenContainer>
      {Platform.OS === "ios" ? (
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          {pageContent}
        </KeyboardAvoidingView>
      ) : (
        pageContent
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  contentShell: {
    flex: 1,
    minHeight: 0,
  },
  compactHeader: {
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(134, 116, 102, 0.15)",
  },
  compactHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  compactHeaderLeft: {
    flex: 1,
    gap: 2,
  },
  compactTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontFamily: Fonts.serif,
    fontWeight: "700",
  },
  compactSubtitle: {
    fontSize: 11,
    lineHeight: 16,
  },
  compactHeaderActions: {
    flexDirection: "row",
    gap: 6,
  },
  compactIcon: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  messagesContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 12,
  },
  scrollRegion: {
    flex: 1,
    minHeight: 0,
  },
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 10,
  },
  centerText: {
    fontSize: 13,
  },
  starterCard: {
    flex: 1,
    minHeight: 420,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 12,
  },
  starterTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontFamily: Fonts.serif,
    fontWeight: "700",
    textAlign: "center",
  },
  starterText: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 320,
  },
  errorText: {
    color: "#ba1a1a",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  messageRow: {
    flexDirection: "row",
  },
  messageRowLeft: {
    justifyContent: "flex-start",
  },
  messageRowRight: {
    justifyContent: "flex-end",
  },
  messageBubble: {
    maxWidth: "88%",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  messageRole: {
    fontSize: 10,
    fontFamily: Fonts.mono,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 21,
  },
  messageMeta: {
    fontSize: 10,
  },
  composerDock: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  composerRow: {
    borderWidth: 1,
    borderRadius: 24,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  composerInput: {
    flex: 1,
    minHeight: 36,
    maxHeight: 100,
    paddingTop: 8,
    paddingBottom: 6,
    fontSize: 15,
    lineHeight: 21,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
});
