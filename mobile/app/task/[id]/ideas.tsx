import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useTaskContext } from "@/lib/task-store";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricItem}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export default function IdeasScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, continueIdeas, fetchIdeas, selectIdea } = useTaskContext();
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [continuing, setContinuing] = useState(false);

  const headerDescription = useMemo(() => {
    if (state.ideas.status === "generating") {
      return "系统仍在生成更多候选方案，已产出的结果也会先展示在这里。";
    }
    if (state.currentTask?.status === "paused" && state.currentTask?.current_module === "M3") {
      return "M3 已暂停等待人工决策。选择一个 Idea 后，后端会从 M4 继续执行。";
    }
    return "查看 M3 候选 Idea，并在需要时继续生成更多方案。";
  }, [state.currentTask?.current_module, state.currentTask?.status, state.ideas.status]);

  const handleContinue = async () => {
    if (!id || continuing) return;
    setContinuing(true);
    try {
      await continueIdeas(id);
      Alert.alert("已提交", "后端正在继续生成更多 Idea。");
    } catch (error) {
      Alert.alert("操作失败", error instanceof Error ? error.message : "无法继续生成 Idea。");
    } finally {
      setContinuing(false);
    }
  };

  const handleSelect = async (ideaIndex: number, ideaTitle: string) => {
    if (!id) return;
    setSubmittingId(String(ideaIndex));
    try {
      await selectIdea(id, ideaIndex);
      Alert.alert("已推进到 M4", `已选择“${ideaTitle}”，任务将继续执行。`, [
        { text: "返回详情", onPress: () => router.replace(`/task/${id}` as any) },
      ]);
    } catch (error) {
      Alert.alert("选择失败", error instanceof Error ? error.message : "无法选择当前 Idea。");
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon}>
            <MaterialIcons name="arrow-back" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => (id ? void fetchIdeas(id) : undefined)} style={styles.headerIcon}>
            <MaterialIcons name="refresh" size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.eyebrow, { color: colors.muted }]}>Idea Selection (M3)</Text>
        <Text style={[styles.title, { color: colors.primary }]}>Select a Research Trajectory</Text>
        <Text style={[styles.description, { color: colors.foreground }]}>{headerDescription}</Text>

        {state.ideas.ideas.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {state.ideas.status === "generating" ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <MaterialIcons name="lightbulb-outline" size={42} color={colors.muted} />
            )}
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {state.ideas.status === "generating" ? "正在生成 Idea" : "暂无候选 Idea"}
            </Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              {state.ideas.message || "后端一旦产出候选方案，这里会立即刷新。"}
            </Text>
          </View>
        ) : (
          state.ideas.ideas.map((idea, index) => (
            <View
              key={idea.id}
              style={[styles.ideaCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={styles.ideaHeader}>
                <View style={styles.ideaTitleWrap}>
                  {idea.recommended ? (
                    <View style={styles.recommendedBadge}>
                      <Text style={styles.recommendedBadgeText}>推荐</Text>
                    </View>
                  ) : null}
                  <Text style={[styles.ideaTitle, { color: colors.foreground }]}>{idea.title}</Text>
                </View>
                <View style={styles.scoreWrap}>
                  <Text style={[styles.scoreEyebrow, { color: colors.muted }]}>SCORE</Text>
                  <Text style={[styles.scoreValue, { color: colors.primary }]}>
                    {idea.overallScore.toFixed(1)}
                  </Text>
                </View>
              </View>

              <Text style={[styles.ideaPremise, { color: colors.foreground }]}>{idea.premise}</Text>

              <View style={styles.metricGrid}>
                <Metric label="创新" value={idea.innovation.toFixed(1)} />
                <Metric label="可行" value={idea.feasibility.toFixed(1)} />
                <Metric label="证据" value={idea.evidenceStrength.toFixed(1)} />
                <Metric label="风险" value={idea.risk.toFixed(1)} />
              </View>

              <TouchableOpacity
                disabled={submittingId === String(index)}
                onPress={() => void handleSelect(index, idea.title)}
                style={[styles.selectButton, { backgroundColor: colors.primary }]}
              >
                {submittingId === String(index) ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Text style={styles.selectButtonText}>选择该 Idea 并推进</Text>
                    <MaterialIcons name="arrow-forward" size={18} color="#ffffff" />
                  </>
                )}
              </TouchableOpacity>
            </View>
          ))
        )}

        <TouchableOpacity
          disabled={!id || continuing}
          onPress={() => void handleContinue()}
          style={[styles.continueButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
        >
          {continuing ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <MaterialIcons name="refresh" size={18} color={colors.primary} />
              <Text style={[styles.continueButtonText, { color: colors.primary }]}>
                Continue generating more ideas
              </Text>
            </>
          )}
        </TouchableOpacity>
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
  },
  eyebrow: {
    fontSize: 10,
    fontFamily: Fonts.mono,
    textTransform: "uppercase",
    letterSpacing: 1.8,
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
  emptyCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 22,
    alignItems: "center",
    gap: 10,
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: Fonts.serif,
    fontWeight: "700",
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  ideaCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 14,
  },
  ideaHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  ideaTitleWrap: {
    flex: 1,
    gap: 8,
  },
  recommendedBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#fff2df",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  recommendedBadgeText: {
    color: "#b36a11",
    fontSize: 11,
    fontWeight: "700",
    fontFamily: Fonts.mono,
  },
  ideaTitle: {
    fontSize: 26,
    lineHeight: 30,
    fontFamily: Fonts.serif,
    fontWeight: "700",
  },
  scoreWrap: {
    alignItems: "flex-end",
    gap: 4,
  },
  scoreEyebrow: {
    fontSize: 10,
    fontFamily: Fonts.mono,
  },
  scoreValue: {
    fontSize: 24,
    fontWeight: "800",
  },
  ideaPremise: {
    fontSize: 14,
    lineHeight: 22,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricItem: {
    minWidth: "47%",
    backgroundColor: "#f1f4f1",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  metricLabel: {
    fontSize: 10,
    fontFamily: Fonts.mono,
    color: "#6c655e",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  metricValue: {
    fontSize: 16,
    color: "#181c1b",
    fontWeight: "800",
  },
  selectButton: {
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  selectButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  continueButton: {
    marginTop: 2,
    borderWidth: 1,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  continueButtonText: {
    fontSize: 13,
    fontWeight: "800",
  },
});
