import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  bindChatSessionTaskApi,
  createChatSessionApi,
  fetchChatSessionApi,
  fetchChatSessionsApi,
  sendChatMessageApi,
} from "@/lib/api";
import { useTaskContext } from "@/lib/task-store";
import type { ChatMessage, ChatSession, Task } from "@/lib/types";

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
  const [creatingSession, setCreatingSession] = useState(false);
  const [draft, setDraft] = useState("");
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [allTaskSessions, setAllTaskSessions] = useState<ChatSession[]>([]);
  const [error, setError] = useState("");

  const loadCurrentTaskChat = useCallback(
    async (showLoading = true) => {
      if (!state.currentTaskId) {
        setSession(null);
        setMessages([]);
        setAllTaskSessions([]);
        if (showLoading) {
          setLoading(false);
          setRefreshing(false);
        }
        return;
      }

      if (showLoading) {
        setLoading(true);
      }

      try {
        setError("");
        const sessions = await fetchChatSessionsApi();
        const taskSessions = sessions
          .filter((item) => item.task_id === state.currentTaskId)
          .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at));
        setAllTaskSessions(taskSessions);

        const requestedSessionId = typeof params.sessionId === "string" ? params.sessionId : "";
        const targetSession =
          taskSessions.find((item) => item.id === requestedSessionId) ?? taskSessions[0] ?? null;

        if (!targetSession) {
          setSession(null);
          setMessages([]);
          return;
        }

        const detail = await fetchChatSessionApi(targetSession.id);
        setSession(detail.session);
        setMessages(detail.messages);
        if (detail.task) {
          selectCurrentTask(detail.task);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "无法加载当前任务对话。");
        setSession(null);
        setMessages([]);
        setAllTaskSessions([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [params.sessionId, selectCurrentTask, state.currentTaskId]
  );

  useFocusEffect(
    useCallback(() => {
      if (!state.currentTaskId || !state.currentTask) {
        void fetchTasks({ background: true });
      }
      void loadCurrentTaskChat(true);
    }, [fetchTasks, loadCurrentTaskChat, state.currentTask, state.currentTaskId])
  );

  useEffect(() => {
    void loadCurrentTaskChat(false);
  }, [loadCurrentTaskChat, params.sessionId, state.currentTaskId]);

  useEffect(() => {
    if (!state.currentTaskId || state.currentTask) {
      return;
    }

    void loadTaskBundle(state.currentTaskId, { background: true });
  }, [loadTaskBundle, state.currentTask, state.currentTaskId]);

  const chatStatusText = useMemo(() => {
    if (!state.currentTask) return "请选择一个任务作为当前任务。";
    if (!session) return "当前任务还没有创建对话。";
    return `当前任务对话，共关联 ${allTaskSessions.length} 个会话。`;
  }, [allTaskSessions.length, session, state.currentTask]);

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
    void loadCurrentTaskChat(false);
  }, [loadCurrentTaskChat]);

  const handleCreateSession = useCallback(async () => {
    if (!state.currentTask || creatingSession) {
      return;
    }

    setCreatingSession(true);
    try {
      setError("");
      const created = await createChatSessionApi(state.currentTask.title || state.currentTask.topic);
      const bound = await bindChatSessionTaskApi(created.session.id, state.currentTask.id);

      setSession(bound.session);
      setMessages(bound.messages);
      setAllTaskSessions((current) => [
        bound.session,
        ...current.filter((item) => item.id !== bound.session.id),
      ]);

      if (bound.task) {
        selectCurrentTask(bound.task);
      }

      router.replace(`/create?sessionId=${bound.session.id}` as never);
    } catch (createError) {
      Alert.alert(
        "创建对话失败",
        createError instanceof Error ? createError.message : "暂时无法为当前任务创建对话。"
      );
    } finally {
      setCreatingSession(false);
    }
  }, [creatingSession, selectCurrentTask, state.currentTask]);

  const recentTasks = useMemo(() => state.tasks.slice(0, 4), [state.tasks]);

  const handlePickTask = useCallback(
    (task: Task) => {
      selectCurrentTask(task);
      void loadTaskBundle(task.id, { background: true });
    },
    [loadTaskBundle, selectCurrentTask]
  );

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.flex}>
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
                  {state.currentTask?.title || "未选择当前任务"}
                </Text>
                <Text
                  style={[styles.compactSubtitle, { color: colors.muted }]}
                  numberOfLines={1}
                >
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

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
              />
            }
          >
            {loading ? (
              <View style={styles.centerState}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.centerText, { color: colors.muted }]}>
                  正在加载当前任务对话...
                </Text>
              </View>
            ) : !state.currentTask ? (
              <View style={styles.emptyCard}>
                <MaterialIcons name="assignment-turned-in" size={42} color={colors.muted} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  先选择一个任务
                </Text>
                <Text style={[styles.emptyText, { color: colors.muted }]}>
                  对话页会绑定到一个任务。你可以直接在这里选择最近任务，不用回任务页。
                </Text>
                {recentTasks.length > 0 ? (
                  <View style={styles.taskPickerList}>
                    {recentTasks.map((task) => (
                      <TouchableOpacity
                        key={task.id}
                        onPress={() => handlePickTask(task)}
                        style={[
                          styles.taskPickerCard,
                          { backgroundColor: colors.surface, borderColor: colors.border },
                        ]}
                      >
                        <Text
                          style={[styles.taskPickerTitle, { color: colors.foreground }]}
                          numberOfLines={1}
                        >
                          {task.title}
                        </Text>
                        <Text
                          style={[styles.taskPickerMeta, { color: colors.muted }]}
                          numberOfLines={2}
                        >
                          {task.topic}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : !session ? (
              <View style={styles.emptyCard}>
                <MaterialIcons name="forum" size={42} color={colors.muted} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  当前任务还没有对话
                </Text>
                <Text style={[styles.emptyText, { color: colors.muted }]}>
                  现在可以直接为当前任务创建对话，不需要再回任务页。
                </Text>
                <TouchableOpacity
                  onPress={() => void handleCreateSession()}
                  disabled={creatingSession}
                  style={[styles.createSessionButton, { backgroundColor: colors.primary }]}
                >
                  {creatingSession ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="add-comment" size={18} color="#ffffff" />
                      <Text style={styles.createSessionButtonText}>创建对话</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
              </>
            )}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </ScrollView>

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
                placeholder={session ? "输入你想和 ScholarMind 讨论的内容..." : "请先选择任务并创建对话"}
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
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
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
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 12,
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
  emptyCard: {
    alignItems: "center",
    paddingTop: 72,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 22,
    lineHeight: 26,
    fontFamily: Fonts.serif,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  taskPickerList: {
    width: "100%",
    gap: 10,
    marginTop: 8,
  },
  taskPickerCard: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  taskPickerTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  taskPickerMeta: {
    fontSize: 12,
    lineHeight: 18,
  },
  createSessionButton: {
    marginTop: 8,
    minWidth: 136,
    height: 46,
    borderRadius: 16,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  createSessionButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
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
