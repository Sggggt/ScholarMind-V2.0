import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { Fonts } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import { bindChatSessionTaskApi, createChatSessionApi, fetchChatSessionsApi } from "@/lib/api";
import { getCurrentModuleState, getTaskProgressPercent } from "@/lib/task-helpers";
import { useTaskContext } from "@/lib/task-store";
import type { Task } from "@/lib/types";

const STATUS_TONES = {
  pending: { color: "#867466", bg: "#f1ede8", icon: "schedule" },
  running: { color: "#46664a", bg: "#e9f2ea", icon: "play-circle-filled" },
  paused: { color: "#b36a11", bg: "#fff2df", icon: "pause-circle-filled" },
  review: { color: "#7a4f92", bg: "#f3ebf7", icon: "rate-review" },
  completed: { color: "#46664a", bg: "#e8f1e8", icon: "check-circle" },
  failed: { color: "#ba1a1a", bg: "#fdeceb", icon: "error" },
  aborted: { color: "#6c655e", bg: "#ece8e4", icon: "cancel" },
} as const;

const FILTERS: Array<{ key: "all" | Task["status"]; label: string }> = [
  { key: "all", label: "All" },
  { key: "running", label: "Running" },
  { key: "paused", label: "Paused" },
  { key: "completed", label: "Completed" },
  { key: "failed", label: "Failed" },
];

const STATUS_LABELS: Record<Task["status"], string> = {
  pending: "Pending",
  running: "Running",
  paused: "Paused",
  review: "Review",
  completed: "Completed",
  failed: "Failed",
  aborted: "Aborted",
};

const MODULE_LABELS: Record<string, string> = {
  M1: "Literature Review",
  M2: "Gap Analysis",
  M3: "Idea Generation",
  M4: "Code Generation",
  M5: "Experiment Design",
  M6: "Agent Runs",
  M7: "Result Analysis",
  M8: "Paper Writing",
  M9: "Review",
};

function formatTimeLabel(value: string) {
  const date = new Date(value);
  return date.toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSortTimestamp(task: Task) {
  return Date.parse(task.updated_at || task.created_at) || 0;
}

function StatPill({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TaskCard({
  task,
  isCurrent,
  onSelectCurrent,
  onDelete,
}: {
  task: Task;
  isCurrent: boolean;
  onSelectCurrent: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const colors = useColors();
  const currentModule = getCurrentModuleState(task);
  const progress = getTaskProgressPercent(task);
  const tone = STATUS_TONES[task.status];

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => router.push(`/task/${task.id}` as any)}
      style={[styles.taskCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.taskCardHeader}>
        <View style={styles.taskTitleWrap}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: tone.color }]} />
            <Text style={[styles.statusEyebrow, { color: tone.color }]}>
              {STATUS_LABELS[task.status]}
            </Text>
            {isCurrent ? (
              <View style={styles.currentChip}>
                <Text style={styles.currentChipText}>Current</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.taskTitle, { color: colors.foreground }]} numberOfLines={2}>
            {task.title}
          </Text>
          <Text style={[styles.taskTopic, { color: colors.muted }]} numberOfLines={2}>
            {task.topic}
          </Text>
        </View>
        <View style={[styles.iconBadge, { backgroundColor: tone.bg }]}>
          <MaterialIcons name={tone.icon} size={22} color={tone.color} />
        </View>
      </View>

      <View style={styles.progressHeader}>
        <Text style={[styles.progressLabel, { color: colors.muted }]}>
          {currentModule
            ? `${currentModule.module_id} ${MODULE_LABELS[currentModule.module_id] ?? currentModule.module_id}`
            : "Waiting to start"}
        </Text>
        <Text style={[styles.progressValue, { color: tone.color }]}>{progress}%</Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${progress}%`,
              backgroundColor: tone.color,
            },
          ]}
        />
      </View>

      <View style={[styles.taskCardFooter, { borderTopColor: colors.border }]}>
        <Text style={[styles.footerText, { color: colors.muted }]}>
          Updated {formatTimeLabel(task.updated_at || task.created_at)}
        </Text>
        <View style={styles.footerActions}>
          <TouchableOpacity
            onPress={() => onSelectCurrent(task)}
            style={[styles.selectButton, isCurrent ? styles.selectButtonActive : null]}
          >
            <MaterialIcons
              name={isCurrent ? "radio-button-checked" : "radio-button-unchecked"}
              size={16}
              color={isCurrent ? "#46664a" : "#6c655e"}
            />
            <Text style={[styles.selectButtonText, isCurrent ? styles.selectButtonTextActive : null]}>
              {isCurrent ? "Selected" : "Set Current"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onDelete(task)}
            style={styles.iconButton}
          >
            <MaterialIcons name="delete-outline" size={18} color="#ba1a1a" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push(`/task/${task.id}` as any)}
            style={styles.iconButton}
          >
            <MaterialIcons name="open-in-new" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const { state, fetchTasks, deleteTask, selectCurrentTask } = useTaskContext();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void fetchTasks();
    }, [fetchTasks])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTasks();
    setRefreshing(false);
  }, [fetchTasks]);

  const handleDelete = useCallback(
    (task: Task) => {
      Alert.alert("Delete Task", `Delete "${task.title}"? This cannot be undone.`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            void deleteTask(task.id).catch((error) => {
              Alert.alert("Delete failed", error instanceof Error ? error.message : "Unable to delete task.");
            }),
        },
      ]);
    },
    [deleteTask]
  );

  const handleSelectCurrent = useCallback(
    (task: Task) => {
      selectCurrentTask(task);
    },
    [selectCurrentTask]
  );

  const handleCreateChat = useCallback(async () => {
    if (!state.currentTaskId || !state.currentTask) {
      Alert.alert("Select Current Task", "Select a task as the current task first.");
      return;
    }

    if (creatingChat) return;
    setCreatingChat(true);
    try {
      // Check if there's already a session for this task
      const sessions = await fetchChatSessionsApi();
      const existingSession = sessions
        .filter((item) => item.task_id === state.currentTaskId)
        .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))[0];

      if (existingSession) {
        // Reuse existing session
        router.push({ pathname: "/create", params: { sessionId: existingSession.id } });
      } else {
        // Create new session if none exists
        const created = await createChatSessionApi(state.currentTask.title);
        const bound = await bindChatSessionTaskApi(created.session.id, state.currentTaskId);
        router.push({ pathname: "/create", params: { sessionId: bound.session.id } });
      }
    } catch (error) {
      Alert.alert("New chat failed", error instanceof Error ? error.message : "Unable to create a new chat.");
    } finally {
      setCreatingChat(false);
    }
  }, [creatingChat, state.currentTask, state.currentTaskId]);

  const filteredTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...state.tasks]
      .sort((left, right) => getSortTimestamp(right) - getSortTimestamp(left))
      .filter((task) => {
        const matchesFilter = filter === "all" ? true : task.status === filter;
        const matchesQuery = normalizedQuery
          ? `${task.title} ${task.topic}`.toLowerCase().includes(normalizedQuery)
          : true;
        return matchesFilter && matchesQuery;
      });
  }, [filter, query, state.tasks]);

  const stats = useMemo(
    () => ({
      total: state.tasks.length,
      running: state.tasks.filter((task) => task.status === "running").length,
      paused: state.tasks.filter((task) => task.status === "paused").length,
    }),
    [state.tasks]
  );

  return (
    <ScreenContainer>
      {state.loading && state.tasks.length === 0 ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.centerText, { color: colors.muted }]}>Loading tasks...</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={filteredTasks}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TaskCard
                task={item}
                isCurrent={state.currentTaskId === item.id}
                onSelectCurrent={handleSelectCurrent}
                onDelete={handleDelete}
              />
            )}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
              />
            }
            ListHeaderComponent={
              <View>
                <LinearGradient
                  colors={["#fffaf5", "#f1f4f1", "#f7faf7"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.hero}
                >
                  <Text style={[styles.eyebrow, { color: colors.muted }]}>Research Repository</Text>
                  <Text style={[styles.heroTitle, { color: colors.primary }]}>Active Tasks</Text>
                  <Text style={[styles.heroDescription, { color: colors.foreground }]}>
                    Create tasks on mobile, track the latest runs first, and jump into each module
                    detail from the task page.
                  </Text>
                  <View style={styles.statsRow}>
                    <StatPill value={stats.total} label="Total" />
                    <StatPill value={stats.running} label="Running" />
                    <StatPill value={stats.paused} label="Paused" />
                  </View>
                </LinearGradient>

                <View style={styles.controls}>
                  <View
                    style={[
                      styles.searchWrap,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <MaterialIcons name="search" size={18} color={colors.muted} />
                    <TextInput
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Search topic or title"
                      placeholderTextColor={colors.muted}
                      style={[styles.searchInput, { color: colors.foreground }]}
                    />
                  </View>

                  <View style={styles.filterRow}>
                    {FILTERS.map((item) => {
                      const active = filter === item.key;
                      return (
                        <TouchableOpacity
                          key={item.key}
                          onPress={() => setFilter(item.key)}
                          style={[
                            styles.filterChip,
                            {
                              backgroundColor: active ? colors.primary : colors.surface,
                              borderColor: active ? colors.primary : colors.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.filterText,
                              { color: active ? "#ffffff" : colors.muted },
                            ]}
                          >
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {state.error ? (
                  <View style={[styles.errorCard, { borderColor: "#f2c9c6" }]}>
                    <MaterialIcons name="error-outline" size={18} color="#ba1a1a" />
                    <Text style={styles.errorText}>{state.error}</Text>
                  </View>
                ) : null}
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <MaterialIcons name="library-books" size={48} color={colors.muted} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No matching tasks</Text>
                <Text style={[styles.emptyDescription, { color: colors.muted }]}>
                  {query
                    ? "Try a different keyword."
                    : "Create a new task to start a new research run."}
                </Text>
              </View>
            }
            contentContainerStyle={styles.content}
          />

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => void handleCreateChat()}
            style={[styles.fab, { backgroundColor: colors.primary }]}
          >
            {creatingChat ? (
              <MaterialIcons name="hourglass-top" size={24} color="#ffffff" />
            ) : (
              <MaterialIcons name="add" size={28} color="#ffffff" />
            )}
          </TouchableOpacity>
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 120,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  centerText: {
    fontSize: 14,
  },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
    gap: 10,
  },
  eyebrow: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1.8,
    fontFamily: Fonts.mono,
  },
  heroTitle: {
    fontSize: 38,
    lineHeight: 40,
    fontFamily: Fonts.serif,
    fontWeight: "700",
  },
  heroDescription: {
    fontSize: 14,
    lineHeight: 22,
    maxWidth: 320,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  statPill: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 3,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#181c1b",
  },
  statLabel: {
    fontSize: 11,
    color: "#6c655e",
  },
  controls: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 14,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterText: {
    fontSize: 12,
    fontWeight: "700",
  },
  errorCard: {
    marginHorizontal: 16,
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 16,
    backgroundColor: "#fff4f3",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    gap: 10,
  },
  errorText: {
    flex: 1,
    color: "#ba1a1a",
    fontSize: 13,
    lineHeight: 18,
  },
  taskCard: {
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  taskCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
  },
  taskTitleWrap: {
    flex: 1,
    gap: 6,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  statusEyebrow: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontFamily: Fonts.mono,
  },
  currentChip: {
    backgroundColor: "#e9f2ea",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  currentChipText: {
    color: "#46664a",
    fontSize: 10,
    fontWeight: "700",
    fontFamily: Fonts.mono,
  },
  taskTitle: {
    fontSize: 24,
    lineHeight: 28,
    fontFamily: Fonts.serif,
    fontWeight: "700",
  },
  taskTopic: {
    fontSize: 13,
    lineHeight: 20,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  progressLabel: {
    flex: 1,
    fontSize: 12,
    fontFamily: Fonts.mono,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  progressValue: {
    fontSize: 13,
    fontWeight: "700",
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  taskCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    paddingTop: 12,
  },
  footerText: {
    fontSize: 11,
    fontFamily: Fonts.mono,
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  selectButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#f1ede8",
  },
  selectButtonActive: {
    backgroundColor: "#e9f2ea",
  },
  selectButtonText: {
    color: "#6c655e",
    fontSize: 12,
    fontWeight: "700",
  },
  selectButtonTextActive: {
    color: "#46664a",
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f5f5",
  },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 56,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    fontFamily: Fonts.serif,
  },
  emptyDescription: {
    textAlign: "center",
    fontSize: 13,
    lineHeight: 20,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 26,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#6e3900",
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
});
