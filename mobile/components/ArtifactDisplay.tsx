// Visual components for displaying artifact content on mobile
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from "react-native";
import React from "react";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { Fonts } from "@/constants/theme";
import type {
  PaperRecord,
  ResearchGap,
  ExperimentPlan,
  ExperimentResult,
  CodeGenInfo,
  WritingSection,
  ValidationReview,
} from "@/lib/artifact-types";

// Common UI components
export function SectionCard({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const colors = useColors();

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          {icon && <MaterialIcons name={icon} size={20} color={colors.primary} />}
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{title}</Text>
        </View>
        {action}
      </View>
      <View style={styles.cardContent}>{children}</View>
    </View>
  );
}

export function MetricPill({ label, value }: { label: string; value: string | number }) {
  const colors = useColors();

  return (
    <View style={[styles.metricPill, { backgroundColor: colors.border }]}>
      <Text style={[styles.metricLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

export function InfoRow({ label, value, icon }: { label: string; value: string; icon?: keyof typeof MaterialIcons.glyphMap }) {
  const colors = useColors();

  return (
    <View style={styles.infoRow}>
      <View style={styles.infoLabelWrap}>
        {icon && <MaterialIcons name={icon} size={14} color={colors.muted} />}
        <Text style={[styles.infoLabel, { color: colors.muted }]}>{label}</Text>
      </View>
      <Text style={[styles.infoValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

// M1: Literature Display
export function LiteratureCard({ paper }: { paper: PaperRecord }) {
  const colors = useColors();

  return (
    <View style={[styles.paperCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.paperHeader}>
        <View style={styles.paperSourceWrap}>
          <Text style={[styles.paperSource, { color: colors.primary }]}>{paper.source}</Text>
          <Text style={[styles.paperYear, { color: colors.muted }]}>· {paper.year}</Text>
        </View>
        {paper.citations > 0 && (
          <View style={[styles.citationBadge, { backgroundColor: "#f1f4f1" }]}>
            <MaterialIcons name="format-quote" size={12} color="#46664a" />
            <Text style={styles.citationText}>{paper.citations}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.paperTitle, { color: colors.foreground }]} numberOfLines={3}>
        {paper.title}
      </Text>
      <Text style={[styles.paperAuthors, { color: colors.muted }]} numberOfLines={1}>
        {paper.authors}
      </Text>
      <Text style={[styles.paperAbstract, { color: colors.foreground }]} numberOfLines={3}>
        {paper.abstract}
      </Text>
    </View>
  );
}

// M2: Gap Display
export function GapCard({ gap }: { gap: ResearchGap }) {
  const colors = useColors();

  const impactColors = {
    high: "#fdeceb",
    medium: "#fff2df",
    low: "#e9f2ea",
  };

  const impactTextColors = {
    high: "#ba1a1a",
    medium: "#b36a11",
    low: "#46664a",
  };

  const bgColor = impactColors[gap.impact as keyof typeof impactColors] || impactColors.medium;
  const textColor = impactTextColors[gap.impact as keyof typeof impactTextColors] || impactTextColors.medium;

  return (
    <View style={[styles.gapCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.gapHeader}>
        <Text style={[styles.gapTitle, { color: colors.foreground }]} numberOfLines={2}>
          {gap.title}
        </Text>
        <View style={[styles.gapBadge, { backgroundColor: bgColor }]}>
          <Text style={[styles.gapBadgeText, { color: textColor }]}>
            {gap.impact.toUpperCase()} IMPACT
          </Text>
        </View>
      </View>
      <Text style={[styles.gapDescription, { color: colors.muted }]} numberOfLines={3}>
        {gap.description}
      </Text>
      <View style={styles.gapTags}>
        {gap.tags.map((tag, i) => (
          <View key={i} style={[styles.gapTag, { backgroundColor: colors.border }]}>
            <Text style={[styles.gapTagText, { color: colors.muted }]}>{tag}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// M5: Experiment Plan Display
export function ExperimentPlanCard({ plan }: { plan: ExperimentPlan }) {
  const colors = useColors();

  return (
    <View style={[styles.planCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.planSection}>
        <Text style={[styles.planSectionTitle, { color: colors.primary }]}>Core Setup</Text>
        <InfoRow label="Dataset" value={plan.dataset} icon="storage" />
        <InfoRow label="Model" value={plan.model} icon="memory" />
        <InfoRow label="Baseline" value={plan.baseline} icon="timeline" />
      </View>

      <View style={styles.planDivider} />

      <View style={styles.planSection}>
        <Text style={[styles.planSectionTitle, { color: colors.primary }]}>Evaluation Metrics</Text>
        <View style={styles.metricsRow}>
          {plan.metrics.map((metric, i) => (
            <MetricPill key={i} label={metric} value="-" />
          ))}
        </View>
      </View>

      <View style={styles.planDivider} />

      <View style={styles.planSection}>
        <Text style={[styles.planSectionTitle, { color: colors.primary }]}>Hypothesis</Text>
        <Text style={[styles.planText, { color: colors.foreground }]}>{plan.hypothesis}</Text>
      </View>

      {plan.experiments.length > 0 && (
        <>
          <View style={styles.planDivider} />
          <View style={styles.planSection}>
            <Text style={[styles.planSectionTitle, { color: colors.primary }]}>Experiments</Text>
            {plan.experiments.map((exp, i) => (
              <View key={i} style={[styles.experimentItem, { backgroundColor: colors.border }]}>
                <Text style={[styles.experimentName, { color: colors.foreground }]} numberOfLines={1}>{exp.name}</Text>
                <Text style={[styles.experimentDesc, { color: colors.muted }]} numberOfLines={3} ellipsizeMode="tail">{exp.description}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

// M7: Results Display
export function ResultCard({ result, id }: { result: ExperimentResult; id?: string }) {
  const colors = useColors();

  return (
    <View style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.resultHeader}>
        <Text style={[styles.resultLabel, { color: colors.foreground }]}>{result.label}</Text>
        <View
          style={[
            styles.resultStatus,
            { backgroundColor: result.passed ? "#e9f2ea" : "#fdeceb" },
          ]}
        >
          <MaterialIcons name={result.passed ? "check-circle" : "error"} size={16} color={result.passed ? "#46664a" : "#ba1a1a"} />
          <Text style={[styles.resultStatusText, { color: result.passed ? "#46664a" : "#ba1a1a" }]}>
            {result.passed ? "PASSED" : "FAILED"}
          </Text>
        </View>
      </View>

      {Object.keys(result.metrics).length > 0 && (
        <View style={styles.resultMetrics}>
          {Object.entries(result.metrics).map(([key, value]) => (
            <View key={key} style={styles.resultMetricItem}>
              <Text style={[styles.resultMetricKey, { color: colors.muted }]}>{key}</Text>
              <Text style={[styles.resultMetricValue, { color: colors.foreground }]}>{value}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={[styles.resultInterpretation, { color: colors.foreground }]}>{result.interpretation}</Text>

      {result.keyFindings && result.keyFindings.length > 0 && (
        <View style={styles.resultFindings}>
          <Text style={[styles.resultFindingsTitle, { color: colors.primary }]}>Key Findings</Text>
          {result.keyFindings.map((finding, i) => (
            <View key={i} style={styles.findingItem}>
              <MaterialIcons name="arrow-right" size={14} color={colors.primary} />
              <Text style={[styles.findingText, { color: colors.foreground }]}>{finding}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// M4: Code Gen Display
export function CodeGenCard({ info }: { info: CodeGenInfo }) {
  const colors = useColors();

  return (
    <View style={[styles.codeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <InfoRow label="Repository" value={info.repo_path} icon="folder" />
      <InfoRow label="Files Generated" value={String(info.main_files.length)} icon="code" />
      <Text style={[styles.codeDesc, { color: colors.muted }]}>{info.description}</Text>

      {info.main_files.length > 0 && (
        <View style={styles.fileList}>
          <Text style={[styles.fileListTitle, { color: colors.primary }]}>Main Files</Text>
          {info.main_files.map((file, i) => (
            <View key={i} style={styles.fileItem}>
              <MaterialIcons name="insert-drive-file" size={16} color={colors.muted} />
              <Text style={[styles.fileName, { color: colors.foreground }]}>{file}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// M8: Paper Section Display
export function PaperSectionCard({ section }: { section: WritingSection }) {
  const colors = useColors();

  return (
    <View style={[styles.paperSectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.paperSectionLabel, { color: colors.primary }]}>{section.label}</Text>
      <Text style={[styles.paperSectionContent, { color: colors.foreground }]}>{section.content}</Text>
    </View>
  );
}

// M9: Review Display
export function ReviewCard({ review }: { review: ValidationReview }) {
  const colors = useColors();
  const decisionColors = {
    Accept: "#e9f2ea",
    Revise: "#fff2df",
    Reject: "#fdeceb",
    Pending: "#f1ede8",
  };

  const bgColor = decisionColors[review.decision as keyof typeof decisionColors] || decisionColors.Pending;

  return (
    <View style={[styles.reviewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.reviewDecision, { backgroundColor: bgColor }]}>
        <Text style={[styles.reviewDecisionText, { color: colors.foreground }]}>{review.decision.toUpperCase()}</Text>
      </View>

      <Text style={[styles.reviewSummary, { color: colors.foreground }]}>{review.summary}</Text>

      {review.strengths.length > 0 && (
        <View style={styles.reviewSection}>
          <Text style={[styles.reviewSectionTitle, { color: colors.primary }]}>Strengths</Text>
          {review.strengths.map((s, i) => (
            <View key={i} style={styles.reviewItem}>
              <MaterialIcons name="check-circle" size={14} color="#46664a" />
              <Text style={[styles.reviewItemText, { color: colors.foreground }]}>{s}</Text>
            </View>
          ))}
        </View>
      )}

      {review.weaknesses.length > 0 && (
        <View style={styles.reviewSection}>
          <Text style={[styles.reviewSectionTitle, { color: colors.primary }]}>Weaknesses</Text>
          {review.weaknesses.map((w, i) => (
            <View key={i} style={styles.reviewItem}>
              <MaterialIcons name="error" size={14} color="#ba1a1a" />
              <Text style={[styles.reviewItemText, { color: colors.foreground }]}>{w}</Text>
            </View>
          ))}
        </View>
      )}

      {review.questions.length > 0 && (
        <View style={styles.reviewSection}>
          <Text style={[styles.reviewSectionTitle, { color: colors.primary }]}>Questions</Text>
          {review.questions.map((q, i) => (
            <View key={i} style={styles.reviewItem}>
              <MaterialIcons name="help" size={14} color="#b36a11" />
              <Text style={[styles.reviewItemText, { color: colors.foreground }]}>{q}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: Fonts.serif,
    fontWeight: "700",
  },
  cardContent: {
    gap: 10,
  },
  metricPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 4,
  },
  metricLabel: {
    fontSize: 10,
    textTransform: "uppercase",
  },
  metricValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  infoLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoLabel: {
    fontSize: 12,
    fontFamily: Fonts.mono,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
  },
  // Paper Card
  paperCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  paperHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  paperSourceWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  paperSource: {
    fontSize: 11,
    fontWeight: "700",
  },
  paperYear: {
    fontSize: 11,
  },
  citationBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  citationText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#46664a",
  },
  paperTitle: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  paperAuthors: {
    fontSize: 12,
  },
  paperAbstract: {
    fontSize: 13,
    lineHeight: 20,
  },
  // Gap Card
  gapCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  gapHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  gapTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    marginRight: 8,
  },
  gapBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  gapBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  gapDescription: {
    fontSize: 13,
    lineHeight: 20,
  },
  gapTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  gapTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  gapTagText: {
    fontSize: 10,
    fontWeight: "600",
  },
  // Experiment Plan Card
  planCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 4,
  },
  planSection: {
    paddingVertical: 8,
    gap: 8,
  },
  planSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  planDivider: {
    height: 1,
    backgroundColor: "#e5e5e5",
    marginVertical: 4,
  },
  planText: {
    fontSize: 13,
    lineHeight: 20,
  },
  metricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  experimentItem: {
    padding: 10,
    borderRadius: 10,
    gap: 4,
  },
  experimentName: {
    fontSize: 13,
    fontWeight: "700",
  },
  experimentDesc: {
    fontSize: 12,
  },
  // Result Card
  resultCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  resultLabel: {
    fontSize: 16,
    fontWeight: "700",
  },
  resultStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  resultStatusText: {
    fontSize: 10,
    fontWeight: "800",
  },
  resultMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  resultMetricItem: {
    gap: 2,
  },
  resultMetricKey: {
    fontSize: 10,
    fontFamily: Fonts.mono,
  },
  resultMetricValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  resultInterpretation: {
    fontSize: 13,
    lineHeight: 20,
  },
  resultFindings: {
    gap: 6,
  },
  resultFindingsTitle: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  findingItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  findingText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  // Code Gen Card
  codeCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  codeDesc: {
    fontSize: 13,
    lineHeight: 20,
    marginTop: 4,
  },
  fileList: {
    gap: 8,
  },
  fileListTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  fileItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  fileName: {
    fontSize: 12,
    fontFamily: Fonts.mono,
  },
  // Paper Section Card
  paperSectionCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  paperSectionLabel: {
    fontSize: 16,
    fontWeight: "700",
  },
  paperSectionContent: {
    fontSize: 13,
    lineHeight: 20,
  },
  // Review Card
  reviewCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  reviewDecision: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  reviewDecisionText: {
    fontSize: 12,
    fontWeight: "800",
  },
  reviewSummary: {
    fontSize: 14,
    lineHeight: 22,
  },
  reviewSection: {
    gap: 8,
  },
  reviewSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  reviewItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  reviewItemText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
});
