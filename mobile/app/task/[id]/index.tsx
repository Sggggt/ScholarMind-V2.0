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
import { MODULE_SEQUENCE, type ModuleId, type ModuleState } from "@/lib/types";

const STATUS_TONES = {
  pending: { color: "#867466", bg: "#f1ede8" },
  running: { color: "#46664a", bg: "#e9f2ea" },
  paused: { color: "#b36a11", bg: "#fff2df" },
  review: { color: "#7a4f92", bg: "#f3ebf7" },
  completed: { color: "#46664a", bg: "#e8f1e8" },
  failed: { color: "#ba1a1a", bg: "#fdeceb" },
  aborted: { color: "#6c655e", bg: "#ece8e4" },
} as const;

const STATUS_LABELS = {
  pending: "Pending",
  running: "Running",
  paused: "Paused",
  review: "Review",
  completed: "Completed",
  failed: "Failed",
  aborted: "Aborted",
} as const;

const MODULE_LABELS: Record<ModuleId, string> = {
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

const MODULE_DESCRIPTIONS: Record<ModuleId, string> = {
  M1: "Survey related work and collect the evidence base.",
  M2: "Extract research gaps and unresolved questions.",
  M3: "Generate and score candidate research ideas.",
  M4: "Turn the selected idea into executable code.",
  M5: "Define the experiment plan and evaluation setup.",
  M6: "Run agents and automated experiments.",
  M7: "Analyze outcomes and failure cases.",
  M8: "Draft the paper and writing artifacts.",
  M9: "Review the full output and final quality.",
};

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
    return `${context.m3Summary.ideaCount} ideas ready. Best candidate: ${context.m3Summary.bestIdeaTitle}`;
  }
  if (module.module_id === "M4" && context.m4Summary.fileCount > 0) {
    const parts = [`📁 ${context.m4Summary.fileCount} files`];
    if (context.m4Summary.ideaName) {
      parts.push(`· ${context.m4Summary.ideaName}`);
    }
    // Only show repoPath if it's different from ideaName
    if (context.m4Summary.repoPath &&
        context.m4Summary.repoPath !== "Generated code" &&
        context.m4Summary.repoPath !== context.m4Summary.ideaName) {
      parts.push(`· ${context.m4Summary.repoPath}`);
    }
    return parts.join(" ");
  }
  if (module.module_id === "M5" && context.m5Summary.experimentCount > 0) {
    const parts = [`🧪 ${context.m5Summary.experimentCount} experiments planned`];
    if (context.m5Summary.hypothesis && context.m5Summary.hypothesis !== `${context.m5Summary.experimentCount} experiment runs planned`) {
      parts.push(`· ${context.m5Summary.hypothesis.slice(0, 50)}${context.m5Summary.hypothesis.length > 50 ? "..." : ""}`);
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
  const tone =
    STATUS_TONES[(module.status === "waiting" ? "pending" : module.status) as keyof typeof STATUS_TONES] ??
    STATUS_TONES.pending;

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
            {MODULE_LABELS[module.module_id]}
          </Text>
        </View>
        <View style={[styles.moduleBadge, { backgroundColor: tone.bg }]}>
          <Text style={[styles.moduleBadgeText, { color: tone.color }]}>
            {module.status.toUpperCase()}
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
      (moduleId) => task.modules.find((module) => module.module_id === moduleId) ?? {
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
    Alert.alert("Stop Task", "Stop this task now?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Stop",
        style: "destructive",
        onPress: () => void abortTask(task.id),
      },
    ]);
  };

  const handleDelete = () => {
    if (!task) return;
    Alert.alert("Delete Task", `Delete "${task.title}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          void deleteTask(task.id)
            .then(() => {
              router.replace("/" as any);
            })
            .catch((error) => {
              Alert.alert("Delete failed", error instanceof Error ? error.message : "Unable to delete task.");
            }),
      },
    ]);
  };

  if (!task && state.loading) {
    return (
      <ScreenContainer>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.centerText, { color: colors.muted }]}>Loading task details...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!task) {
    return (
      <ScreenContainer>
        <View style={styles.centerState}>
          <MaterialIcons name="error-outline" size={44} color={colors.muted} />
          <Text style={[styles.centerTitle, { color: colors.foreground }]}>Task not found</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backButton, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const tone = STATUS_TONES[task.status];

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
          <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon}>
            <MaterialIcons name="arrow-back" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => void loadTaskBundle(task.id)} style={styles.headerIcon}>
              <MaterialIcons name="refresh" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} style={styles.headerIcon}>
              <MaterialIcons name="delete-outline" size={20} color="#ba1a1a" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.statusBadgeRow}>
            <View style={[styles.statusBadge, { backgroundColor: tone.bg }]}>
              <View style={[styles.statusBadgeDot, { backgroundColor: tone.color }]} />
              <Text style={[styles.statusBadgeText, { color: tone.color }]}>
                {STATUS_LABELS[task.status]}
              </Text>
            </View>
            <View style={[styles.syncBadge, { backgroundColor: state.wsConnected ? "#e9f2ea" : "#f1ede8" }]}>
              <Text style={[styles.syncBadgeText, { color: state.wsConnected ? "#46664a" : "#867466" }]}>
                {state.wsConnected ? "WS Live" : "Polling"}
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
              {currentModule
                ? `${currentModule.module_id} ${MODULE_LABELS[currentModule.module_id]}`
                : "Waiting to start"}
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
              Created: {new Date(task.created_at).toLocaleString("zh-CN")}
            </Text>
            {state.lastSyncedAt ? (
              <Text style={[styles.heroMeta, { color: colors.muted }]}>
                Synced: {new Date(state.lastSyncedAt).toLocaleTimeString("zh-CN")}
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
                  <Text style={[styles.secondaryActionText, { color: colors.foreground }]}>Pause</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => void resumeTask(task.id)}
                  style={[styles.primaryAction, { backgroundColor: colors.primary }]}
                >
                  <MaterialIcons name="play-arrow" size={18} color="#ffffff" />
                  <Text style={styles.primaryActionText}>Resume</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={handleAbort} style={styles.abortAction}>
                <MaterialIcons name="stop" size={18} color="#ba1a1a" />
                <Text style={styles.abortActionText}>Stop</Text>
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
              <Text style={[styles.linkCardTitle, { color: colors.foreground }]}>Execution Logs</Text>
              <Text style={[styles.linkCardDesc, { color: colors.muted }]}>
                Open the full task log stream and live updates.
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
              <MaterialIcons name="lightbulb" size={20} color="#b36a11" />
              <View style={styles.linkCardTextWrap}>
                <Text style={[styles.linkCardTitle, { color: colors.foreground }]}>Idea Board</Text>
                <Text style={[styles.linkCardDesc, { color: colors.muted }]}>
                  Review and select the M3 candidate ideas.
                </Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
          </TouchableOpacity>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Workflow Modules</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
            Tap any module to open its own detail view.
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
    backgroundColor: "rgba(255,255,255,0.7)",
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
    textTransform: "uppercase",
    letterSpacing: 1.2,
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
    textTransform: "uppercase",
    letterSpacing: 0.8,
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
    backgroundColor: "#ffffff",
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
    backgroundColor: "#fff1f0",
  },
  abortActionText: {
    color: "#ba1a1a",
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
    textTransform: "uppercase",
    letterSpacing: 1.5,
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
