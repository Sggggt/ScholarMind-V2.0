import { useEffect, useMemo, useState } from "react";
import React from "react";
import {
  ActivityIndicator,
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
  fetchArtifactContentApi,
  fetchRepoTreeApi,
  fetchReviewReportApi,
} from "@/lib/api";
import { useTaskContext } from "@/lib/task-store";
import type { ModuleId, ModuleState } from "@/lib/types";
import {
  adaptM1Artifacts,
  adaptM2Artifacts,
  adaptM4Artifacts,
  adaptM5Artifacts,
  adaptM7Artifacts,
  adaptM8Artifacts,
  adaptM9Artifacts,
} from "@/lib/artifact-adapter";
import type {
  M1ArtifactData,
  M2ArtifactData,
  CodeGenInfo,
  ExperimentPlan,
  M7ArtifactData,
  WritingArtifact,
  ValidationReview,
} from "@/lib/artifact-types";
import {
  SectionCard,
  LiteratureCard,
  GapCard,
  ExperimentPlanCard,
  ResultCard,
  CodeGenCard,
  PaperSectionCard,
  ReviewCard,
} from "@/components/ArtifactDisplay";

const MODULE_LABELS: Record<ModuleId, string> = {
  M1: "Literature Review",
  M2: "Gap Analysis",
  M3: "Idea Generation",
  M4: "Code Generation",
  M5: "Experiment Design",
  M6: "Agent Runs",
  M7: "Result Analysis",
  M8: "Paper Writing",
  M9: "Validation",
};

const MODULE_DESCRIPTIONS: Record<ModuleId, string> = {
  M1: "Survey related work and collect the evidence base.",
  M2: "Extract research gaps and unresolved opportunities.",
  M3: "Generate, score, and compare candidate ideas.",
  M4: "Produce the implementation and repository structure.",
  M5: "Define the experiment plan and evaluation setup.",
  M6: "Track orchestration and execution traces.",
  M7: "Analyze results and summarize findings.",
  M8: "Draft the paper and writing artifacts.",
  M9: "Review the final output and risks.",
};

const STATUS_TONES = {
  waiting: { color: "#867466", bg: "#f1ede8" },
  pending: { color: "#867466", bg: "#f1ede8" },
  running: { color: "#46664a", bg: "#e9f2ea" },
  paused: { color: "#b36a11", bg: "#fff2df" },
  review: { color: "#7a4f92", bg: "#f3ebf7" },
  completed: { color: "#46664a", bg: "#e8f1e8" },
  failed: { color: "#ba1a1a", bg: "#fdeceb" },
  aborted: { color: "#6c655e", bg: "#ece8e4" },
} as const;

function getModuleState(taskModules: ModuleState[], moduleId: ModuleId): ModuleState {
  return (
    taskModules.find((module) => module.module_id === moduleId) ?? {
      module_id: moduleId,
      status: "waiting",
      percent: 0,
      step: "",
      message: "",
      started_at: null,
      finished_at: null,
    }
  );
}

export default function ModuleDetailScreen() {
  const colors = useColors();
  const { id, moduleId } = useLocalSearchParams<{ id: string; moduleId: ModuleId }>();
  const { state, loadTaskBundle } = useTaskContext();
  const task = state.currentTask?.id === id ? state.currentTask : null;

  const safeModuleId = (moduleId && moduleId in MODULE_LABELS ? moduleId : "M1") as ModuleId;
  const module = task ? getModuleState(task.modules, safeModuleId) : null;

  const [loadingArtifacts, setLoadingArtifacts] = useState(false);
  const [m1Data, setM1Data] = useState<M1ArtifactData | null>(null);
  const [m2Data, setM2Data] = useState<M2ArtifactData | null>(null);
  const [m4Data, setM4Data] = useState<CodeGenInfo | null>(null);
  const [m5Data, setM5Data] = useState<ExperimentPlan | null>(null);
  const [m7Data, setM7Data] = useState<M7ArtifactData | null>(null);
  const [m8Data, setM8Data] = useState<WritingArtifact | null>(null);
  const [m9Data, setM9Data] = useState<ValidationReview | null>(null);
  const [repoTree, setRepoTree] = useState<string[]>([]);

  const moduleLogs = useMemo(() => {
    return [...state.logs]
      .filter((entry) => entry.module_id === safeModuleId)
      .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
      .slice(0, 20);
  }, [safeModuleId, state.logs]);

  const tone = STATUS_TONES[(module?.status ?? "waiting") as keyof typeof STATUS_TONES] ?? STATUS_TONES.waiting;

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    setLoadingArtifacts(true);

    const loadArtifact = async (path: string) => {
      try {
        const artifact = await fetchArtifactContentApi(id, path);
        return (artifact as any).content;
      } catch {
        return null;
      }
    };

    void (async () => {
      // Reset data
      setM1Data(null);
      setM2Data(null);
      setM4Data(null);
      setM5Data(null);
      setM7Data(null);
      setM8Data(null);
      setM9Data(null);
      setRepoTree([]);

      if (safeModuleId === "M1") {
        const [review, sources] = await Promise.all([
          loadArtifact("m1_literature_review.md"),
          loadArtifact("m1_sources.json"),
        ]);
        if (!cancelled && review && sources) {
          setM1Data(adaptM1Artifacts(typeof review === "string" ? review : "", sources));
        }
      }

      if (safeModuleId === "M2") {
        const gaps = await loadArtifact("m2_gap_analysis.json");
        if (!cancelled && gaps) {
          setM2Data(adaptM2Artifacts(gaps));
        }
      }

      if (safeModuleId === "M4") {
        const [codeGenInfo, tree] = await Promise.all([
          loadArtifact("m4_code_gen_info.json"),
          fetchRepoTreeApi(id).catch(() => []),
        ]);
        if (!cancelled && codeGenInfo) {
          setM4Data(adaptM4Artifacts(codeGenInfo));
        }
        if (!cancelled && tree.length) {
          setRepoTree(tree.map((n: { kind: string; name: string }) => `${n.kind === "folder" ? "📁" : "📄"} ${n.name}`));
        }
      }

      if (safeModuleId === "M5") {
        const plan = await loadArtifact("m5_experiment_plan.json");
        if (!cancelled && plan) {
          setM5Data(adaptM5Artifacts(plan));
        }
      }

      if (safeModuleId === "M7") {
        const analysis = await loadArtifact("m7_analysis.json");
        if (!cancelled && analysis) {
          setM7Data(adaptM7Artifacts(analysis));
        }
      }

      if (safeModuleId === "M8") {
        const [texContent] = await Promise.all([loadArtifact("paper/paper.tex")]);
        if (!cancelled && texContent) {
          setM8Data(adaptM8Artifacts(typeof texContent === "string" ? texContent : ""));
        }
      }

      if (safeModuleId === "M9") {
        const report = await fetchReviewReportApi(id).catch(() => null);
        if (!cancelled && report) {
          setM9Data(adaptM9Artifacts(report));
        }
      }

      if (!cancelled) {
        setLoadingArtifacts(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, safeModuleId]);

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => (id ? void loadTaskBundle(id) : undefined)}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon}>
            <MaterialIcons name="arrow-back" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => (id ? void loadTaskBundle(id) : undefined)} style={styles.headerIcon}>
            <MaterialIcons name="refresh" size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.eyebrow, { color: colors.muted }]}>{safeModuleId}</Text>
          <Text style={[styles.title, { color: colors.primary }]}>{MODULE_LABELS[safeModuleId]}</Text>
          <Text style={[styles.description, { color: colors.foreground }]}>
            {MODULE_DESCRIPTIONS[safeModuleId]}
          </Text>

          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: tone.bg }]}>
              <Text style={[styles.statusBadgeText, { color: tone.color }]}>
                {(module?.status ?? "waiting").toUpperCase()}
              </Text>
            </View>
            <Text style={[styles.percentText, { color: tone.color }]}>{module?.percent ?? 0}%</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${module?.percent ?? 0}%`, backgroundColor: tone.color },
              ]}
            />
          </View>

          {module?.step ? (
            <View style={styles.infoBlock}>
              <Text style={[styles.infoLabel, { color: colors.muted }]}>Current Step</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>{module.step}</Text>
            </View>
          ) : null}
        </View>

        {loadingArtifacts && (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.muted }]}>Loading artifacts...</Text>
          </View>
        )}

        {/* M1: Literature Review */}
        {safeModuleId === "M1" && m1Data && (
          <>
            <SectionCard title="Overview" icon="summarize">
              <Text style={[styles.summaryText, { color: colors.foreground }]}>{m1Data.summary || "No summary available."}</Text>
            </SectionCard>

            <SectionCard
              title={`Papers (${m1Data.papers.length})`}
              icon="library-books"
              action={<Text style={[styles.countText, { color: colors.muted }]}>{m1Data.papers.length} sources</Text>}
            >
              {m1Data.papers.length > 0 ? (
                m1Data.papers.map((paper) => <LiteratureCard key={paper.id} paper={paper} />)
              ) : (
                <Text style={[styles.emptyText, { color: colors.muted }]}>No papers available yet.</Text>
              )}
            </SectionCard>
          </>
        )}

        {/* M2: Gap Analysis */}
        {safeModuleId === "M2" && m2Data && (
          <>
            <SectionCard title="Research Gaps" icon="lightbulb">
              {m2Data.gaps.length > 0 ? (
                m2Data.gaps.map((gap) => <GapCard key={gap.id} gap={gap} />)
              ) : (
                <Text style={[styles.emptyText, { color: colors.muted }]}>No gaps identified yet.</Text>
              )}
            </SectionCard>
          </>
        )}

        {/* M3: Idea Generation */}
        {safeModuleId === "M3" && (
          <SectionCard title="Idea Generation" icon="psychology">
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              View and manage candidate ideas on the Idea Board.
            </Text>
            <TouchableOpacity
              onPress={() => router.push(`/task/${id}/ideas` as any)}
              style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.primaryButtonText}>Open Idea Board</Text>
              <MaterialIcons name="arrow-forward" size={16} color="#ffffff" />
            </TouchableOpacity>
          </SectionCard>
        )}

        {/* M4: Code Generation */}
        {safeModuleId === "M4" && m4Data && (
          <>
            <CodeGenCard info={m4Data} />
            {repoTree.length > 0 && (
              <SectionCard title="Repository Structure" icon="folder">
                {repoTree.map((item, i) => (
                  <Text key={i} style={[styles.codeFileText, { color: colors.foreground }]}>{item}</Text>
                ))}
              </SectionCard>
            )}
          </>
        )}

        {/* M5: Experiment Design */}
        {safeModuleId === "M5" && m5Data && <ExperimentPlanCard plan={m5Data} />}

        {/* M6: Agent Runs */}
        {safeModuleId === "M6" && (
          <SectionCard title="Agent Orchestration" icon="smart-toy">
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              Agent runs are tracked in real-time. View logs below for execution traces.
            </Text>
          </SectionCard>
        )}

        {/* M7: Results Analysis */}
        {safeModuleId === "M7" && m7Data && m7Data.results && m7Data.results.length > 0 && (
          <>
            {m7Data.results.map((result, index) => (
              <ResultCard key={`result-${index}`} result={result} id={`result-${index}`} />
            ))}
          </>
        )}

        {/* M8: Paper Writing */}
        {safeModuleId === "M8" && m8Data && (
          <>
            <SectionCard
              title={`Paper (${m8Data.sections.length} sections)`}
              icon="description"
              action={<Text style={[styles.countText, { color: colors.muted }]}>~{m8Data.wordCount} words</Text>}
            >
              {m8Data.sections.map((section) => (
                <PaperSectionCard key={section.id} section={section} />
              ))}
            </SectionCard>
          </>
        )}

        {/* M9: Validation */}
        {safeModuleId === "M9" && m9Data && <ReviewCard review={m9Data} />}

        {/* Module Logs */}
        <SectionCard
          title="Module Logs"
          icon="list-alt"
          action={
            <TouchableOpacity onPress={() => router.push(`/task/${id}/logs` as any)}>
              <Text style={[styles.linkText, { color: colors.primary }]}>View All</Text>
            </TouchableOpacity>
          }
        >
          {moduleLogs.length > 0 ? (
            moduleLogs.map((entry) => (
              <View key={entry.id} style={[styles.logCard, { borderColor: colors.border }]}>
                <Text style={[styles.logTime, { color: colors.muted }]}>
                  {new Date(entry.timestamp).toLocaleString("zh-CN")}
                </Text>
                <Text style={[styles.logMessage, { color: colors.foreground }]}>{entry.message}</Text>
              </View>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: colors.muted }]}>No logs for this module yet.</Text>
          )}
        </SectionCard>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 18,
    paddingBottom: 100,
    gap: 14,
  },
  header: {
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
  heroCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 12,
  },
  eyebrow: {
    fontSize: 10,
    fontFamily: Fonts.mono,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  title: {
    fontSize: 34,
    lineHeight: 36,
    fontFamily: Fonts.serif,
    fontWeight: "700",
  },
  description: {
    fontSize: 14,
    lineHeight: 22,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontFamily: Fonts.mono,
  },
  percentText: {
    fontSize: 14,
    fontWeight: "800",
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
  infoBlock: {
    gap: 4,
  },
  infoLabel: {
    fontSize: 10,
    fontFamily: Fonts.mono,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  infoValue: {
    fontSize: 14,
    lineHeight: 21,
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 22,
  },
  loadingCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 20,
    backgroundColor: "#f9f9f9",
    borderRadius: 16,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
    fontStyle: "italic",
  },
  countText: {
    fontSize: 11,
    fontFamily: Fonts.mono,
  },
  primaryButton: {
    alignSelf: "flex-start",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  codeFileText: {
    fontSize: 12,
    fontFamily: Fonts.mono,
    paddingVertical: 2,
  },
  linkText: {
    fontSize: 13,
    fontWeight: "700",
  },
  logCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 6,
    marginBottom: 8,
  },
  logTime: {
    fontSize: 11,
    fontFamily: Fonts.mono,
  },
  logMessage: {
    fontSize: 13,
    lineHeight: 20,
  },
});
