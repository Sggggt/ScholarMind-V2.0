import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { getCurrentModuleState, getTaskProgressPercent } from "@/lib/task-helpers";
import { useTaskContext } from "@/lib/task-store";
import { MODULE_NAMES, TASK_STATUS_LABELS, type Task } from "@/lib/types";

const STATUS_ICONS = {
  pending: "schedule",
  running: "play-circle-filled",
  paused: "pause-circle-filled",
  review: "rate-review",
  completed: "check-circle",
  failed: "error",
  aborted: "cancel",
} as const;

const FILTERS: Array<{ key: "all" | Task["status"]; label: string }> = [
  { key: "all", label: "全部" },
  { key: "running", label: "进行中" },
  { key: "paused", label: "已暂停" },
  { key: "completed", label: "已完成" },
  { key: "failed", label: "失败" },
];

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

function StatPill({
  value,
  label,
  colors,
}: {
  value: number;
  label: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.statPill, { backgroundColor: colors.surface }]}>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text>
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
  const icon = STATUS_ICONS[task.status] ?? "schedule";
  const statusColor = (() => {
    switch (task.status) {
      case "running":
        return colors.primary;
      case "completed":
        return colors.success;
      case "paused":
        return colors.warning;
      case "failed":
        return colors.error;
      case "aborted":
        return colors.muted;
      default:
        return colors.muted;
    }
  })();
  const statusBg = (() => {
    switch (task.status) {
      case "running":
        return `${colors.primary}20`;
      case "completed":
        return `${colors.success}25`;
      case "paused":
        return `${colors.warning}25`;
      case "failed":
        return `${colors.error}15`;
      case "aborted":
        return `${colors.muted}15`;
      default:
        return `${colors.muted}20`;
    }
  })();

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => router.push(`/task/${task.id}` as never)}
      style={[styles.taskCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.taskCardHeader}>
        <View style={styles.taskTitleWrap}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusEyebrow, { color: statusColor }]}>
              {TASK_STATUS_LABELS[task.status]}
            </Text>
            {isCurrent ? (
              <View style={[styles.currentChip, { backgroundColor: `${colors.success}25` }]}>
                <Text style={[styles.currentChipText, { color: colors.success }]}>当前任务</Text>
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
        <View style={[styles.iconBadge, { backgroundColor: statusBg }]}>
          <MaterialIcons name={icon} size={22} color={statusColor} />
        </View>
      </View>

      <View style={styles.progressHeader}>
        <Text style={[styles.progressLabel, { color: colors.muted }]}>
          {currentModule
            ? `${currentModule.module_id} ${MODULE_NAMES[currentModule.module_id] ?? currentModule.module_id}`
            : "等待开始"}
        </Text>
        <Text style={[styles.progressValue, { color: statusColor }]}>{progress}%</Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${progress}%`,
              backgroundColor: statusColor,
            },
          ]}
        />
      </View>

      <View style={[styles.taskCardFooter, { borderTopColor: colors.border }]}>
        <Text style={[styles.footerText, { color: colors.muted }]}>
          更新于 {formatTimeLabel(task.updated_at || task.created_at)}
        </Text>
        <View style={styles.footerActions}>
          <TouchableOpacity
            onPress={() => onSelectCurrent(task)}
            style={[
              styles.selectButton,
              isCurrent
                ? { backgroundColor: `${colors.success}25` }
                : { backgroundColor: `${colors.border}80` },
            ]}
          >
            <MaterialIcons
              name={isCurrent ? "radio-button-checked" : "radio-button-unchecked"}
              size={16}
              color={isCurrent ? colors.success : colors.muted}
            />
            <Text
              style={[
                styles.selectButtonText,
                { color: isCurrent ? colors.success : colors.muted },
              ]}
            >
              {isCurrent ? "已选中" : "设为当前"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onDelete(task)}
            style={[styles.iconButton, { backgroundColor: `${colors.error}15` }]}
          >
            <MaterialIcons name="delete-outline" size={18} color={colors.error} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push(`/task/${task.id}` as never)}
            style={[styles.iconButton, { backgroundColor: `${colors.border}80` }]}
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
  const { state, fetchTasks, deleteTask, selectCurrentTask, createTask } = useTaskContext();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [topicDraft, setTopicDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");

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
      Alert.alert("删除任务", `确认删除“${task.title}”吗？此操作无法撤销。`, [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: () =>
            void deleteTask(task.id).catch((error) => {
              Alert.alert("删除失败", error instanceof Error ? error.message : "无法删除该任务。");
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

  const resetCreateForm = useCallback(() => {
    setTopicDraft("");
    setDescriptionDraft("");
  }, []);

  const handleCloseCreateModal = useCallback(() => {
    if (creatingTask) return;
    setCreateModalVisible(false);
    resetCreateForm();
  }, [creatingTask, resetCreateForm]);

  const handleCreateTask = useCallback(async () => {
    const topic = topicDraft.trim();
    const description = descriptionDraft.trim();

    if (!topic) {
      Alert.alert("请输入研究主题", "新建任务至少需要一个研究主题。");
      return;
    }

    if (creatingTask) return;
    setCreatingTask(true);
    try {
      const task = await createTask(topic, description);
      selectCurrentTask(task);
      setCreateModalVisible(false);
      resetCreateForm();
      router.push(`/task/${task.id}` as never);
    } catch (error) {
      Alert.alert("新建任务失败", error instanceof Error ? error.message : "暂时无法创建任务。");
    } finally {
      setCreatingTask(false);
    }
  }, [createTask, creatingTask, descriptionDraft, resetCreateForm, selectCurrentTask, topicDraft]);

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
          <Text style={[styles.centerText, { color: colors.muted }]}>正在加载任务...</Text>
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
                  colors={[
                    `${colors.background}E6`,
                    `${colors.surface}CC`,
                    `${colors.background}99`,
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.hero}
                >
                  <Text style={[styles.eyebrow, { color: colors.muted }]}>研究工作台</Text>
                  <Text style={[styles.heroTitle, { color: colors.primary }]}>任务总览</Text>
                  <Text style={[styles.heroDescription, { color: colors.foreground }]}>
                    在移动端查看任务进度、切换当前任务，并快速进入各模块详情与对话。
                  </Text>
                  <View style={styles.statsRow}>
                    <StatPill value={stats.total} label="总数" colors={colors} />
                    <StatPill value={stats.running} label="进行中" colors={colors} />
                    <StatPill value={stats.paused} label="已暂停" colors={colors} />
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
                      placeholder="搜索任务标题或主题"
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
                  <View
                    style={[
                      styles.errorCard,
                      { borderColor: colors.error, backgroundColor: `${colors.error}15` },
                    ]}
                  >
                    <MaterialIcons name="error-outline" size={18} color={colors.error} />
                    <Text style={[styles.errorText, { color: colors.error }]}>{state.error}</Text>
                  </View>
                ) : null}
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <MaterialIcons name="library-books" size={48} color={colors.muted} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  没有匹配的任务
                </Text>
                <Text style={[styles.emptyDescription, { color: colors.muted }]}>
                  {query
                    ? "换个关键词再试试。"
                    : "先创建一个任务，开始新的研究流程。"}
                </Text>
              </View>
            }
            contentContainerStyle={styles.content}
          />

          <Modal
            visible={createModalVisible}
            transparent
            animationType="fade"
            onRequestClose={handleCloseCreateModal}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={styles.modalOverlay}
            >
              <TouchableOpacity
                activeOpacity={1}
                onPress={handleCloseCreateModal}
                style={styles.modalBackdrop}
              />
              <View
                style={[
                  styles.modalCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>新建任务</Text>
                <Text style={[styles.modalDescription, { color: colors.muted }]}>
                  输入研究主题后立即创建任务，创建完成后会自动进入任务详情。
                </Text>

                <View
                  style={[
                    styles.modalInputWrap,
                    { backgroundColor: colors.background, borderColor: colors.border },
                  ]}
                >
                  <TextInput
                    value={topicDraft}
                    onChangeText={setTopicDraft}
                    placeholder="输入研究主题"
                    placeholderTextColor={colors.muted}
                    style={[styles.modalInput, { color: colors.foreground }]}
                  />
                </View>

                <View
                  style={[
                    styles.modalInputWrap,
                    styles.modalTextareaWrap,
                    { backgroundColor: colors.background, borderColor: colors.border },
                  ]}
                >
                  <TextInput
                    value={descriptionDraft}
                    onChangeText={setDescriptionDraft}
                    placeholder="补充任务说明（可选）"
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.modalInput,
                      styles.modalTextarea,
                      { color: colors.foreground },
                    ]}
                    multiline
                    textAlignVertical="top"
                  />
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    onPress={handleCloseCreateModal}
                    disabled={creatingTask}
                    style={[styles.modalSecondaryButton, { borderColor: colors.border }]}
                  >
                    <Text style={[styles.modalSecondaryButtonText, { color: colors.foreground }]}>
                      取消
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void handleCreateTask()}
                    disabled={creatingTask}
                    style={[styles.modalPrimaryButton, { backgroundColor: colors.primary }]}
                  >
                    {creatingTask ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <MaterialIcons name="add-task" size={18} color="#ffffff" />
                        <Text style={styles.modalPrimaryButtonText}>创建任务</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setCreateModalVisible(true)}
            style={[styles.fab, { backgroundColor: colors.primary }]}
          >
            <MaterialIcons name="add" size={28} color="#ffffff" />
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
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 3,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 11,
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    gap: 10,
  },
  errorText: {
    flex: 1,
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
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  currentChipText: {
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
  },
  selectButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
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
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 12,
  },
  modalTitle: {
    fontSize: 24,
    lineHeight: 28,
    fontFamily: Fonts.serif,
    fontWeight: "700",
  },
  modalDescription: {
    fontSize: 13,
    lineHeight: 20,
  },
  modalInputWrap: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  modalTextareaWrap: {
    minHeight: 116,
    paddingTop: 10,
    paddingBottom: 10,
  },
  modalInput: {
    fontSize: 14,
    paddingVertical: 14,
  },
  modalTextarea: {
    minHeight: 92,
    paddingVertical: 0,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  modalSecondaryButton: {
    flex: 1,
    height: 50,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  modalSecondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  modalPrimaryButton: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  modalPrimaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
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
    shadowColor: "#000000",
    shadowOpacity: 0.32,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
});
