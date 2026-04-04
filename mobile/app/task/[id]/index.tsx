import { type ReactNode, useMemo } from "react";
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
  getTaskProgressPercent,
} from "@/lib/task-helpers";
import { useTaskContext } from "@/lib/task-store";
import { MODULE_DESCRIPTIONS, MODULE_NAMES, MODULE_SEQUENCE, TASK_STATUS_LABELS } from "@/lib/types";

const STATUS_TONES = {
  pending: { color: "#867466", bg: "#f1ede8" },
  running: { color: "#46664a", bg: "#e9f2ea" },
  paused: { color: "#b36a11", bg: "#fff2df" },
  review: { color: "#7a4f92", bg: "#f3ebf7" },
  completed: { color: "#46664a", bg: "#e8f1e8" },
  failed: { color: "#ba1a1a", bg: "#fdeceb" },
  aborted: { color: "#6c655e", bg: "#ece8e4" },
} as const;

function ModuleSummaryCard({
  title,
  eyebrow,
  description,
  children,
}: {
  title: string;
  eyebrow: string;
  description: string;
  children: ReactNode;
}) {
  const colors = useColors();

  return (
    <View style={[styles.moduleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.moduleEyebrow, { color: colors.muted }]}>{eyebrow}</Text>
      <Text style={[styles.moduleTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.moduleDescription, { color: colors.muted }]}>{description}</Text>
      {children}
    </View>
  );
}

export default function TaskDetailScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, loadTaskBundle, pauseTask, resumeTask, abortTask } = useTaskContext();
  const task = state.currentTask?.id === id ? state.currentTask : null;

  const currentModule = getCurrentModuleState(task);
  const progress = getTaskProgressPercent(task);
  const m1Summary = getM1Summary(state.artifactContents);
  const m2Summary = getM2Highlights(state.artifactContents);
  const m3Summary = getM3Summary(state.ideas.ideas);

  const futureModules = useMemo(() => MODULE_SEQUENCE.slice(3), []);
  const canEnterIdeas =
    Boolean(task?.current_module === "M3") || state.ideas.ideas.length > 0 || state.ideas.status === "generating";

  const handleAbort = () => {
    if (!task) return;
    Alert.alert("终止任务", "确认终止该任务？此操作不可撤销。", [
      { text: "取消", style: "cancel" },
      {
        text: "终止",
        style: "destructive",
        onPress: () => void abortTask(task.id),
      },
    ]);
  };

  if (!task && state.loading) {
    return (
      <ScreenContainer>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.centerText, { color: colors.muted }]}>正在同步任务详情…</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!task) {
    return (
      <ScreenContainer>
        <View style={styles.centerState}>
          <MaterialIcons name="error-outline" size={44} color={colors.muted} />
          <Text style={[styles.centerTitle, { color: colors.foreground }]}>任务不存在</Text>
          <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.primary }]}>
            <Text style={styles.backButtonText}>返回</Text>
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
          <TouchableOpacity onPress={() => void loadTaskBundle(task.id)} style={styles.headerIcon}>
            <MaterialIcons name="refresh" size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.statusBadgeRow}>
            <View style={[styles.statusBadge, { backgroundColor: tone.bg }]}>
              <View style={[styles.statusBadgeDot, { backgroundColor: tone.color }]} />
              <Text style={[styles.statusBadgeText, { color: tone.color }]}>
                {TASK_STATUS_LABELS[task.status]}
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
                ? `${currentModule.module_id} ${MODULE_NAMES[currentModule.module_id]}`
                : "等待开始"}
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
            <Text style={[styles.heroMeta, { color: colors.muted }]}>创建于 {new Date(task.created_at).toLocaleString("zh-CN")}</Text>
            {state.lastSyncedAt ? (
              <Text style={[styles.heroMeta, { color: colors.muted }]}>
                刷新于 {new Date(state.lastSyncedAt).toLocaleTimeString("zh-CN")}
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
              <TouchableOpacity onPress={handleAbort} style={styles.abortAction}>
                <MaterialIcons name="stop" size={18} color="#ba1a1a" />
                <Text style={styles.abortActionText}>终止</Text>
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
                查看 WebSocket 事件与后端追踪日志
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
                <Text style={[styles.linkCardTitle, { color: colors.foreground }]}>Idea 决策</Text>
                <Text style={[styles.linkCardDesc, { color: colors.muted }]}>
                  M3 结束后在手机端选择候选 Idea 并推进到 M4
                </Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
          </TouchableOpacity>
        ) : null}

        <ModuleSummaryCard
          eyebrow="Module 01"
          title="M1 文献调研"
          description={MODULE_DESCRIPTIONS.M1}
        >
          {m1Summary.summary ? (
            <>
              <Text style={[styles.summaryValue, { color: colors.foreground }]}>{m1Summary.summary}</Text>
              <Text style={[styles.summaryMeta, { color: colors.muted }]}>
                来源文献数：{m1Summary.sourceCount || "待生成"}
              </Text>
            </>
          ) : (
            <Text style={[styles.placeholderText, { color: colors.muted }]}>
              文献综述产物尚未生成，任务会在 M1 完成后自动同步。
            </Text>
          )}
        </ModuleSummaryCard>

        <ModuleSummaryCard
          eyebrow="Module 02"
          title="M2 研究空白"
          description={MODULE_DESCRIPTIONS.M2}
        >
          {m2Summary.gapCount > 0 ? (
            <>
              <Text style={[styles.summaryMeta, { color: colors.muted }]}>
                已识别 {m2Summary.gapCount} 个候选研究缺口
              </Text>
              {m2Summary.highlights.map((item) => (
                <View key={item} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.bulletText, { color: colors.foreground }]}>{item}</Text>
                </View>
              ))}
            </>
          ) : (
            <Text style={[styles.placeholderText, { color: colors.muted }]}>
              缺口分析尚未可用，系统会在 M2 完成后刷新这里的摘要。
            </Text>
          )}
        </ModuleSummaryCard>

        <ModuleSummaryCard
          eyebrow="Module 03"
          title="M3 Idea 生成"
          description={MODULE_DESCRIPTIONS.M3}
        >
          {state.ideas.status === "generating" && state.ideas.ideas.length === 0 ? (
            <Text style={[styles.placeholderText, { color: colors.muted }]}>
              正在生成候选 Idea，新的方案产出后会自动显示。
            </Text>
          ) : state.ideas.ideas.length > 0 ? (
            <>
              <Text style={[styles.summaryMeta, { color: colors.muted }]}>
                当前可见 {m3Summary.ideaCount} 个候选 Idea
              </Text>
              <Text style={[styles.summaryValue, { color: colors.foreground }]}>
                推荐方案：{m3Summary.bestIdeaTitle}
              </Text>
              <Text style={[styles.summaryMeta, { color: colors.muted }]}>
                综合得分：{m3Summary.bestIdeaScore.toFixed(1)}
              </Text>
              <TouchableOpacity
                onPress={() => router.push(`/task/${task.id}/ideas` as any)}
                style={[styles.inlinePrimaryButton, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.inlinePrimaryButtonText}>
                  {task.status === "paused" && task.current_module === "M3" ? "进入 Idea 选择" : "查看候选 Idea"}
                </Text>
                <MaterialIcons name="arrow-forward" size={16} color="#ffffff" />
              </TouchableOpacity>
            </>
          ) : (
            <Text style={[styles.placeholderText, { color: colors.muted }]}>
              Idea 产物尚未生成。任务推进到 M3 后，这里会显示候选方案与继续生成入口。
            </Text>
          )}
        </ModuleSummaryCard>

        <View style={[styles.futureCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.futureTitle, { color: colors.foreground }]}>后续模块</Text>
          <Text style={[styles.futureDesc, { color: colors.muted }]}>
            手机端本阶段只承载 M1-M3 闭环，M4-M9 保持与桌面端共享同一后端状态。
          </Text>
          <View style={styles.futureGrid}>
            {futureModules.map((moduleId) => (
              <View key={moduleId} style={[styles.futureChip, { borderColor: colors.border }]}>
                <Text style={[styles.futureChipText, { color: colors.muted }]}>
                  {moduleId} {MODULE_NAMES[moduleId]}
                </Text>
              </View>
            ))}
          </View>
        </View>
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
  moduleCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    gap: 10,
  },
  moduleEyebrow: {
    fontSize: 10,
    fontFamily: Fonts.mono,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  moduleTitle: {
    fontSize: 24,
    lineHeight: 28,
    fontFamily: Fonts.serif,
    fontWeight: "700",
  },
  moduleDescription: {
    fontSize: 13,
    lineHeight: 20,
  },
  summaryValue: {
    fontSize: 14,
    lineHeight: 22,
  },
  summaryMeta: {
    fontSize: 12,
    lineHeight: 18,
  },
  placeholderText: {
    fontSize: 13,
    lineHeight: 20,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 999,
    marginTop: 7,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  inlinePrimaryButton: {
    alignSelf: "flex-start",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  inlinePrimaryButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  futureCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    gap: 10,
  },
  futureTitle: {
    fontSize: 20,
    fontFamily: Fonts.serif,
    fontWeight: "700",
  },
  futureDesc: {
    fontSize: 13,
    lineHeight: 20,
  },
  futureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  futureChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  futureChipText: {
    fontSize: 11,
    fontFamily: Fonts.mono,
  },
});
