import { useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { Fonts } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import {
  getCurrentModuleState,
  getM1Summary,
  getM2Highlights,
  getM3Summary,
  getM4Summary,
  getM5Summary,
  getTaskProgressPercent,
} from "@/lib/task-helpers";
import { useTaskContext } from "@/lib/task-store";
import {
  MODULE_DESCRIPTIONS,
  MODULE_NAMES,
  MODULE_SEQUENCE,
  TASK_STATUS_LABELS,
  type ModuleState,
} from "@/lib/types";

function modulePreviewText(
  module: ModuleState,
  context: {
    m1Summary: ReturnType<typeof getM1Summary>;
    m2Summary: ReturnType<typeof getM2Highlights>;
    m3Summary: ReturnType<typeof getM3Summary>;
    m4Summary: ReturnType<typeof getM4Summary>;
    m5Summary: ReturnType<typeof getM5Summary>;
  }
) {
  if (module.module_id === "M1" && context.m1Summary.summary) {
    return context.m1Summary.summary;
  }
  if (module.module_id === "M2" && context.m2Summary.highlights.length) {
    return context.m2Summary.highlights.join("  ");
  }
  if (module.module_id === "M3" && context.m3Summary.ideaCount > 0) {
    return `已生成 ${context.m3Summary.ideaCount} 个候选想法，当前最佳：${context.m3Summary.bestIdeaTitle}`;
  }
  if (module.module_id === "M4" && context.m4Summary.fileCount > 0) {
    const parts = [`已生成 ${context.m4Summary.fileCount} 个文件`];
    if (context.m4Summary.ideaName) {
      parts.push(`· ${context.m4Summary.ideaName}`);
    }
    if (
      context.m4Summary.repoPath &&
      context.m4Summary.repoPath !== "Generated code" &&
      context.m4Summary.repoPath !== context.m4Summary.ideaName
    ) {
      parts.push(`· ${context.m4Summary.repoPath}`);
    }
    return parts.join(" ");
  }
  if (module.module_id === "M5" && context.m5Summary.experimentCount > 0) {
    const parts = [`已规划 ${context.m5Summary.experimentCount} 组实验`];
    if (
      context.m5Summary.hypothesis &&
      context.m5Summary.hypothesis !== `${context.m5Summary.experimentCount} experiment runs planned`
    ) {
      parts.push(
        `· ${context.m5Summary.hypothesis.slice(0, 50)}${context.m5Summary.hypothesis.length > 50 ? "..." : ""}`
      );
    }
    return parts.join(" ");
  }
  if (module.step) {
    return module.step;
  }
  if (module.message) {
    return module.message;
  }
  return MODULE_DESCRIPTIONS[module.module_id];
}

function getStatusTones(colors: ReturnType<typeof useColors>, status: string) {
  const tones = {
    waiting: { color: colors.muted, bg: `${colors.muted}20` },
    pending: { color: colors.muted, bg: `${colors.muted}20` },
    running: { color: colors.primary, bg: `${colors.primary}20` },
    paused: { color: colors.warning, bg: `${colors.warning}25` },
    review: { color: "#7a4f92", bg: "#f3ebf7" },
    completed: { color: colors.success, bg: `${colors.success}25` },
    failed: { color: colors.error, bg: `${colors.error}15` },
    aborted: { color: colors.muted, bg: `${colors.muted}15` },
  } as const;
  return tones[(status ?? "waiting") as keyof typeof tones] ?? tones.waiting;
}

function ModuleCard({
  taskId,
  module,
  preview,
}: {
  taskId: string;
  module: ModuleState;
  preview: string;
}) {
  const colors = useColors();
  const tone = getStatusTones(colors, module.status === "waiting" ? "pending" : module.status);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => router.push(`/task/${taskId}/module/${module.module_id}` as any)}
      style={[styles.moduleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.moduleCardHeader}>
        <View style={styles.moduleCardTitleWrap}>
          <Text style={[styles.moduleEyebrow, { color: colors.muted }]}>{module.module_id}</Text>
          <Text style={[styles.moduleTitle, { color: colors.foreground }]}>
            {MODULE_NAMES[module.module_id]}
          </Text>
        </View>
        <View style={[styles.moduleBadge, { backgroundColor: tone.bg }]}>
          <Text style={[styles.moduleBadgeText, { color: tone.color }]}>
            {TASK_STATUS_LABELS[(module.status === "waiting" ? "pending" : module.status) as keyof typeof TASK_STATUS_LABELS] ?? module.status}
          </Text>
        </View>
      </View>

      <Text style={[styles.modulePreview, { color: colors.foreground }]} numberOfLines={3}>
        {preview}
      </Text>

      <View style={styles.moduleFooter}>
        <Text style={[styles.modulePercent, { color: tone.color }]}>{module.percent}%</Text>
        <View style={[styles.moduleProgressTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.moduleProgressFill,
              { width: `${module.percent}%`, backgroundColor: tone.color },
            ]}
          />
        </View>
        <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
      </View>
    </TouchableOpacity>
  );
}

export default function TaskDetailScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, loadTaskBundle, pauseTask, resumeTask, abortTask, deleteTask } = useTaskContext();
  const task = state.currentTask?.id === id ? state.currentTask : null;

  const currentModule = getCurrentModuleState(task);
  const progress = getTaskProgressPercent(task);
  const m1Summary = getM1Summary(state.artifactContents);
  const m2Summary = getM2Highlights(state.artifactContents);
  const m3Summary = getM3Summary(state.ideas.ideas);
  const m4Summary = getM4Summary(state.artifactContents);
  const m5Summary = getM5Summary(state.artifactContents);

  const modules = useMemo(() => {
    if (!task) return [];
    return MODULE_SEQUENCE.map(
      (moduleId) =>
        task.modules.find((module) => module.module_id === moduleId) ?? {
          module_id: moduleId,
          status: "waiting",
          percent: 0,
          step: "",
          message: "",
        }
    );
  }, [task]);

  const canEnterIdeas =
    Boolean(task?.current_module === "M3") ||
    state.ideas.ideas.length > 0 ||
    state.ideas.status === "generating";

  const handleAbort = () => {
    if (!task) return;
    Alert.alert("终止任务", "现在终止这个任务吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "终止",
        style: "destructive",
        onPress: () => void abortTask(task.id),
      },
    ]);
  };

  const handleDelete = () => {
    if (!task) return;
    Alert.alert("删除任务", `确认删除“${task.title}”吗？此操作无法撤销。`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () =>
          void deleteTask(task.id)
            .then(() => {
              router.replace("/" as any);
            })
            .catch((error) => {
              Alert.alert("删除失败", error instanceof Error ? error.message : "无法删除该任务。");
            }),
      },
    ]);
  };

  if (!task && state.loading) {
    return (
      <ScreenContainer>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.centerText, { color: colors.muted }]}>正在加载任务详情...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!task) {
    return (
      <ScreenContainer>
        <View style={styles.centerState}>
          <MaterialIcons name="error-outline" size={44} color={colors.muted} />
          <Text style={[styles.centerTitle, { color: colors.foreground }]}>未找到任务</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backButton, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.backButtonText}>返回</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const tone = getStatusTones(colors, task.status);

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => void loadTaskBundle(task.id)}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={[styles.headerIcon, { backgroundColor: colors.surface }]}>
            <MaterialIcons name="arrow-back" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => void loadTaskBundle(task.id)} style={[styles.headerIcon, { backgroundColor: colors.surface }]}>
              <MaterialIcons name="refresh" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} style={[styles.headerIcon, { backgroundColor: colors.surface }]}>
              <MaterialIcons name="delete-outline" size={20} color={colors.error} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.statusBadgeRow}>
            <View style={[styles.statusBadge, { backgroundColor: tone.bg }]}>
              <View style={[styles.statusBadgeDot, { backgroundColor: tone.color }]} />
              <Text style={[styles.statusBadgeText, { color: tone.color }]}>
                {TASK_STATUS_LABELS[task.status]}
              </Text>
            </View>
            <View style={[styles.syncBadge, { backgroundColor: state.wsConnected ? `${colors.success}25` : `${colors.muted}15` }]}>
              <Text style={[styles.syncBadgeText, { color: state.wsConnected ? colors.success : colors.muted }]}>
                {state.wsConnected ? "WS 实时同步" : "轮询同步"}
              </Text>
            </View>
          </View>

          <Text style={[styles.heroTitle, { color: colors.foreground }]}>{task.title}</Text>
          <Text style={[styles.heroTopic, { color: colors.foreground }]}>{task.topic}</Text>
          {task.description ? (
            <Text style={[styles.heroDescription, { color: colors.muted }]}>{task.description}</Text>
          ) : null}

          <View style={styles.progressMeta}>
            <Text style={[styles.progressMetaLabel, { color: colors.muted }]}>
              {currentModule ? `${currentModule.module_id} ${MODULE_NAMES[currentModule.module_id]}` : "等待开始"}
            </Text>
            <Text style={[styles.progressMetaValue, { color: tone.color }]}>{progress}%</Text>
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

          <View style={styles.heroMetaRow}>
            <Text style={[styles.heroMeta, { color: colors.muted }]}>
              创建时间：{new Date(task.created_at).toLocaleString("zh-CN")}
            </Text>
            {state.lastSyncedAt ? (
              <Text style={[styles.heroMeta, { color: colors.muted }]}>
                同步时间：{new Date(state.lastSyncedAt).toLocaleTimeString("zh-CN")}
              </Text>
            ) : null}
          </View>

          {(task.status === "running" || task.status === "paused") && (
            <View style={styles.actionRow}>
              {task.status === "running" ? (
                <TouchableOpacity
                  onPress={() => void pauseTask(task.id)}
                  style={[styles.secondaryAction, { borderColor: colors.border }]}
                >
                  <MaterialIcons name="pause" size={18} color={colors.foreground} />
                  <Text style={[styles.secondaryActionText, { color: colors.foreground }]}>暂停</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => void resumeTask(task.id)}
                  style={[styles.primaryAction, { backgroundColor: colors.primary }]}
                >
                  <MaterialIcons name="play-arrow" size={18} color="#ffffff" />
                  <Text style={styles.primaryActionText}>继续</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={handleAbort} style={[styles.abortAction, { backgroundColor: `${colors.error}15` }]}>
                <MaterialIcons name="stop" size={18} color={colors.error} />
                <Text style={[styles.abortActionText, { color: colors.error }]}>终止</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <TouchableOpacity
          onPress={() => router.push(`/task/${task.id}/logs` as any)}
          style={[styles.linkCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={styles.linkCardLeft}>
            <MaterialIcons name="article" size={20} color={colors.primary} />
            <View style={styles.linkCardTextWrap}>
              <Text style={[styles.linkCardTitle, { color: colors.foreground }]}>执行日志</Text>
              <Text style={[styles.linkCardDesc, { color: colors.muted }]}>
                查看任务完整日志流和实时更新。
              </Text>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
        </TouchableOpacity>

        {canEnterIdeas ? (
          <TouchableOpacity
            onPress={() => router.push(`/task/${task.id}/ideas` as any)}
            style={[styles.linkCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={styles.linkCardLeft}>
              <MaterialIcons name="lightbulb" size={20} color={colors.warning} />
              <View style={styles.linkCardTextWrap}>
                <Text style={[styles.linkCardTitle, { color: colors.foreground }]}>想法面板</Text>
                <Text style={[styles.linkCardDesc, { color: colors.muted }]}>
                  查看并选择 M3 生成的候选想法。
                </Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
          </TouchableOpacity>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>流程模块</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
            点击任一模块进入详情页。
          </Text>
        </View>

        {modules.map((module) => (
          <ModuleCard
            key={module.module_id}
            taskId={task.id}
            module={module}
            preview={modulePreviewText(module, { m1Summary, m2Summary, m3Summary, m4Summary, m5Summary })}
          />
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 100,
    gap: 14,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 10,
  },
  centerText: {
    fontSize: 14,
  },
  centerTitle: {
    fontSize: 20,
    fontWeight: "700",
    fontFamily: Fonts.serif,
  },
  backButton: {
    marginTop: 8,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButtonText: {
    color: "#ffffff",
    fontWeight: "800",
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: 26,
    padding: 18,
    gap: 12,
  },
  statusBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusBadgeDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 11,
    fontFamily: Fonts.mono,
    letterSpacing: 0.8,
  },
  syncBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  syncBadgeText: {
    fontSize: 11,
    fontFamily: Fonts.mono,
  },
  heroTitle: {
    fontSize: 30,
    lineHeight: 34,
    fontFamily: Fonts.serif,
    fontWeight: "700",
  },
  heroTopic: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
  },
  heroDescription: {
    fontSize: 13,
    lineHeight: 20,
  },
  progressMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  progressMetaLabel: {
    flex: 1,
    fontSize: 11,
    fontFamily: Fonts.mono,
    letterSpacing: 0.6,
  },
  progressMetaValue: {
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
  heroMetaRow: {
    gap: 2,
  },
  heroMeta: {
    fontSize: 11,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  primaryAction: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryActionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  secondaryAction: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryActionText: {
    fontSize: 13,
    fontWeight: "700",
  },
  abortAction: {
    width: 88,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  abortActionText: {
    fontSize: 13,
    fontWeight: "700",
  },
  linkCard: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  linkCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  linkCardTextWrap: {
    flex: 1,
    gap: 2,
  },
  linkCardTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  linkCardDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
  sectionHeader: {
    gap: 4,
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 24,
    lineHeight: 28,
    fontFamily: Fonts.serif,
    fontWeight: "700",
  },
  sectionSubtitle: {
    fontSize: 13,
    lineHeight: 20,
  },
  moduleCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    gap: 12,
  },
  moduleCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  moduleCardTitleWrap: {
    flex: 1,
    gap: 4,
  },
  moduleEyebrow: {
    fontSize: 10,
    fontFamily: Fonts.mono,
    letterSpacing: 1.2,
  },
  moduleTitle: {
    fontSize: 22,
    lineHeight: 26,
    fontFamily: Fonts.serif,
    fontWeight: "700",
  },
  moduleBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  moduleBadgeText: {
    fontSize: 10,
    fontFamily: Fonts.mono,
  },
  modulePreview: {
    fontSize: 13,
    lineHeight: 20,
  },
  moduleFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  modulePercent: {
    width: 38,
    fontSize: 13,
    fontWeight: "700",
  },
  moduleProgressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  moduleProgressFill: {
    height: "100%",
    borderRadius: 999,
  },
});
