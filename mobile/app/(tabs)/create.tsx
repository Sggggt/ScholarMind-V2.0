import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Fonts } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import { useTaskContext } from "@/lib/task-store";

const MAX_IDEA_OPTIONS = [3, 5, 8];
const SOFT_ACCENT = "#b87433";
const SOFT_ACCENT_SURFACE = "#f4e0cb";
const SOFT_ACCENT_BORDER = "#d9b089";

const QUICK_PROMPTS = [
  {
    title: "LLM 科研发现局限",
    topic: "评估大模型在科学发现中的关键局限，并提出可验证的改进研究方向。",
  },
  {
    title: "多模态研究空白",
    topic: "梳理多模态模型在科研辅助中的应用进展，识别可评测性与可解释性缺口。",
  },
  {
    title: "医学 AI 文献综述",
    topic: "围绕医学影像诊断中的小样本泛化问题，输出文献综述、研究空白与候选 Idea。",
  },
];

export default function CreateScreen() {
  const colors = useColors();
  const { createTask } = useTaskContext();
  const scrollRef = useRef<ScrollView>(null);
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [maxIdeas, setMaxIdeas] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);

  const trimmedTopic = topic.trim();
  const trimmedDescription = description.trim();
  const canSubmit = useMemo(
    () => trimmedTopic.length > 0 && !submitting,
    [trimmedTopic, submitting],
  );

  const handleCreate = async () => {
    if (!trimmedTopic || submitting) return;

    setSubmitting(true);
    try {
      const task = await createTask(trimmedTopic, trimmedDescription, {
        max_ideas: maxIdeas,
      });
      setTopic("");
      setDescription("");
      setShowSettingsDrawer(false);
      router.push(`/task/${task.id}` as any);
    } catch (error) {
      Alert.alert(
        "创建失败",
        error instanceof Error ? error.message : "无法创建任务，请检查后端连接。",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const detailSummary = trimmedDescription
    ? "已附加补充说明，创建后会一并送入研究任务。"
    : "可选补充研究边界、目标会议、偏好的文献范围或评估重点。";

  const handleRefresh = () => {
    setTopic("");
    setDescription("");
    setMaxIdeas(5);
    setShowSettingsDrawer(false);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.flex}>
          <View style={styles.topBar}>
            <View style={styles.brandWrap}>
              <View style={styles.brandMark} aria-hidden>
                <View style={styles.brandRing} />
                <Text style={[styles.brandLetter, { color: colors.primary }]}>S</Text>
                <View style={[styles.brandDot, { backgroundColor: colors.primary }]} />
              </View>
              <View style={styles.brandCopy}>
                <Text style={[styles.brandWordmark, { color: colors.primary }]}>ScholarMind</Text>
                <Text style={[styles.brandSubtitle, { color: colors.muted }]}>Digital Research Atelier</Text>
              </View>
            </View>
            <View style={styles.topActions}>
              <TouchableOpacity
                onPress={handleRefresh}
                style={[
                  styles.iconAction,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <MaterialIcons name="refresh" size={18} color={SOFT_ACCENT} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowSettingsDrawer(true)}
                style={[
                  styles.iconAction,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <MaterialIcons name="tune" size={18} color={SOFT_ACCENT} />
              </TouchableOpacity>
              <View
                style={[
                  styles.statusPill,
                  { backgroundColor: `${SOFT_ACCENT}12`, borderColor: `${SOFT_ACCENT}30` },
                ]}
              >
                <View style={[styles.statusDot, { backgroundColor: SOFT_ACCENT }]} />
                <Text style={[styles.statusText, { color: SOFT_ACCENT }]}>M1-M3 Ready</Text>
              </View>
            </View>
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={styles.chatContent}
            showsVerticalScrollIndicator
            persistentScrollbar={Platform.OS === "android"}
            indicatorStyle={Platform.OS === "ios" ? "black" : undefined}
            keyboardShouldPersistTaps="handled"
            scrollIndicatorInsets={{ right: 1 }}
          >
            <View style={styles.systemDivider}>
              <View style={[styles.systemLine, { backgroundColor: `${colors.border}80` }]} />
              <Text style={[styles.systemText, { color: colors.muted }]}>真实研究链路已连接</Text>
              <View style={[styles.systemLine, { backgroundColor: `${colors.border}80` }]} />
            </View>

            <View
              style={[
                styles.assistantBubble,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.assistantBubbleHeader}>
                <View
                  style={[
                    styles.assistantIcon,
                    { backgroundColor: `${colors.primary}16`, borderColor: `${colors.primary}24` },
                  ]}
                >
                  <MaterialIcons name="auto-awesome" size={16} color={colors.primary} />
                </View>
                <Text style={[styles.assistantName, { color: colors.foreground }]}>ScholarMind</Text>
              </View>
              <Text style={[styles.assistantBody, { color: colors.foreground }]}>
                告诉我你要研究什么。我会从 M1 文献调研开始，自动推进到 M2 研究空白和 M3
                候选 Idea，最后把选择权留给你在手机上完成。
              </Text>
            </View>

            {trimmedTopic ? (
              <View style={styles.userRow}>
                <View style={[styles.userBubble, { backgroundColor: colors.primary }]}>
                  <Text style={styles.userLabel}>研究主题</Text>
                  <Text style={styles.userText}>{trimmedTopic}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.promptSection}>
                <Text style={[styles.promptTitle, { color: colors.foreground }]}>可以直接这样开场</Text>
                <View style={styles.promptList}>
                  {QUICK_PROMPTS.map((item) => (
                    <TouchableOpacity
                      key={item.title}
                      activeOpacity={0.9}
                      onPress={() => setTopic(item.topic)}
                      style={[
                        styles.promptCard,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                      ]}
                    >
                      <Text style={[styles.promptCardTitle, { color: colors.foreground }]}>
                        {item.title}
                      </Text>
                      <Text
                        style={[styles.promptCardText, { color: colors.muted }]}
                        numberOfLines={3}
                      >
                        {item.topic}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {trimmedDescription ? (
              <View style={styles.userRow}>
                <View
                  style={[
                    styles.detailBubble,
                    { backgroundColor: `${colors.primary}0D`, borderColor: `${colors.primary}20` },
                  ]}
                >
                  <Text style={[styles.detailLabel, { color: colors.primary }]}>补充说明</Text>
                  <Text style={[styles.detailText, { color: colors.foreground }]}>
                    {trimmedDescription}
                  </Text>
                </View>
              </View>
            ) : null}
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
              <TouchableOpacity
                onPress={() => setShowSettingsDrawer(true)}
                style={styles.composerAccessory}
              >
                <MaterialIcons name="tune" size={20} color={SOFT_ACCENT} />
              </TouchableOpacity>

              <TextInput
                value={topic}
                onChangeText={setTopic}
                placeholder="输入你的研究主题..."
                placeholderTextColor={colors.muted}
                style={[styles.composerInput, { color: colors.foreground }]}
                multiline
                maxLength={400}
                textAlignVertical="center"
              />

              <TouchableOpacity
                activeOpacity={0.9}
                onPress={handleCreate}
                disabled={!canSubmit}
                style={[
                  styles.sendButton,
                  { backgroundColor: canSubmit ? SOFT_ACCENT : colors.border },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <MaterialIcons name="north" size={18} color="#ffffff" />
                )}
              </TouchableOpacity>
            </View>

            <Text style={[styles.footerHint, { color: colors.muted }]}>
              发送后会立即创建真实研究任务，并自动运行 M1-M3。
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={showSettingsDrawer}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSettingsDrawer(false)}
      >
        <View style={styles.drawerRoot}>
          <Pressable
            style={styles.drawerBackdrop}
            onPress={() => setShowSettingsDrawer(false)}
          />
          <View
            style={[
              styles.drawerPanel,
              { backgroundColor: colors.surface, borderLeftColor: colors.border },
            ]}
          >
            <View style={styles.drawerHeader}>
              <View>
                <Text style={[styles.drawerEyebrow, { color: SOFT_ACCENT }]}>Research Settings</Text>
                <Text style={[styles.drawerTitle, { color: colors.foreground }]}>创建参数</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowSettingsDrawer(false)}
                style={[styles.iconAction, { backgroundColor: colors.background, borderColor: colors.border }]}
              >
                <MaterialIcons name="close" size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.drawerBody, { color: colors.foreground }]}>
              {trimmedTopic
                ? "主题已填写。你可以在这里补充限制条件，并调整 M3 候选 Idea 数量。"
                : "主界面只保留对话和输入。这里用于补充研究边界、描述和创建参数。"}
            </Text>

            <View style={styles.drawerSection}>
              <Text style={[styles.drawerSectionLabel, { color: SOFT_ACCENT }]}>Supplemental Description</Text>
              <Text style={[styles.composerPanelHint, { color: colors.muted }]}>
                {detailSummary}
              </Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="补充研究目标、方法偏好、目标会议、排除范围或评估重点..."
                placeholderTextColor={colors.muted}
                style={[
                  styles.descriptionInput,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.drawerSection}>
              <View style={styles.drawerSectionHeader}>
                <Text style={[styles.drawerSectionLabel, { color: SOFT_ACCENT }]}>M3 Candidate Ideas</Text>
                <Text style={[styles.panelBadge, { color: colors.muted }]}>M3 x {maxIdeas}</Text>
              </View>
              <View style={styles.optionRow}>
                {MAX_IDEA_OPTIONS.map((option) => {
                  const active = option === maxIdeas;
                  return (
                    <TouchableOpacity
                      key={option}
                      onPress={() => setMaxIdeas(option)}
                      style={[
                        styles.optionChip,
                        {
                          backgroundColor: active ? SOFT_ACCENT_SURFACE : colors.background,
                          borderColor: active ? SOFT_ACCENT_BORDER : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.optionChipText,
                          { color: active ? SOFT_ACCENT : colors.foreground },
                        ]}
                      >
                        {option} Ideas
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.drawerFooter}>
              <MaterialIcons name="info-outline" size={16} color={SOFT_ACCENT} />
              <Text style={[styles.noteText, { color: colors.foreground }]}>
                当前手机端只接入真实支持的 M1-M3 闭环，不再暴露模板里的假工作流入口。
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  brandWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  brandMark: {
    position: "relative",
    width: 46,
    height: 46,
    flexShrink: 0,
  },
  brandRing: {
    position: "absolute",
    inset: 0,
    borderWidth: 1.5,
    borderColor: "rgba(144, 77, 0, 0.36)",
    borderRadius: 16,
    backgroundColor: "rgba(255, 245, 236, 0.95)",
  },
  brandLetter: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
    fontSize: 24,
    lineHeight: 46,
    fontFamily: Fonts.serif,
    fontWeight: "700",
    letterSpacing: -1.2,
  },
  brandDot: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  brandCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  brandWordmark: {
    fontSize: 28,
    lineHeight: 28,
    fontFamily: Fonts.serif,
    fontWeight: "600",
    letterSpacing: -0.8,
  },
  brandSubtitle: {
    fontSize: 10,
    fontFamily: Fonts.mono,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  iconAction: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 10,
    fontFamily: Fonts.mono,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  chatContent: {
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 20,
    gap: 18,
  },
  systemDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  systemLine: {
    flex: 1,
    height: 1,
  },
  systemText: {
    fontSize: 10,
    fontFamily: Fonts.mono,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  assistantBubble: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 12,
  },
  assistantBubbleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  assistantIcon: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  assistantName: {
    fontSize: 18,
    fontFamily: Fonts.serif,
    fontWeight: "700",
  },
  assistantBody: {
    fontSize: 15,
    lineHeight: 24,
  },
  promptSection: {
    gap: 12,
  },
  promptTitle: {
    fontSize: 18,
    fontFamily: Fonts.serif,
    fontWeight: "700",
  },
  promptList: {
    gap: 10,
  },
  promptCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 8,
  },
  promptCardTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  promptCardText: {
    fontSize: 13,
    lineHeight: 20,
  },
  userRow: {
    alignItems: "flex-end",
  },
  userBubble: {
    maxWidth: "92%",
    borderRadius: 22,
    borderTopRightRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  userLabel: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 10,
    fontFamily: Fonts.mono,
    textTransform: "uppercase",
    letterSpacing: 1.3,
  },
  userText: {
    color: "#ffffff",
    fontSize: 18,
    lineHeight: 26,
    fontFamily: Fonts.serif,
    fontWeight: "700",
  },
  detailBubble: {
    maxWidth: "88%",
    borderRadius: 20,
    borderTopRightRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  detailLabel: {
    fontSize: 10,
    fontFamily: Fonts.mono,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  detailText: {
    fontSize: 14,
    lineHeight: 22,
  },
  panelBadge: {
    fontSize: 11,
    fontFamily: Fonts.mono,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  optionRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  optionChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  optionChipText: {
    fontSize: 12,
    fontWeight: "800",
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  composerDock: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
  },
  composerPanelHint: {
    fontSize: 12,
    lineHeight: 18,
  },
  descriptionInput: {
    minHeight: 96,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 21,
  },
  composerRow: {
    borderWidth: 1,
    borderRadius: 26,
    paddingLeft: 8,
    paddingRight: 8,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  composerAccessory: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingTop: 10,
    paddingBottom: 8,
    fontSize: 15,
    lineHeight: 22,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  footerHint: {
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
  },
  drawerRoot: {
    flex: 1,
    flexDirection: "row",
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(12, 16, 18, 0.22)",
  },
  drawerPanel: {
    width: "82%",
    maxWidth: 360,
    borderLeftWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 58,
    paddingBottom: 24,
    gap: 18,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  drawerEyebrow: {
    fontSize: 10,
    fontFamily: Fonts.mono,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  drawerTitle: {
    marginTop: 4,
    fontSize: 28,
    lineHeight: 30,
    fontFamily: Fonts.serif,
    fontWeight: "700",
  },
  drawerBody: {
    fontSize: 14,
    lineHeight: 22,
  },
  drawerSection: {
    gap: 10,
  },
  drawerSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  drawerSectionLabel: {
    fontSize: 10,
    fontFamily: Fonts.mono,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  drawerFooter: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    borderRadius: 16,
    backgroundColor: "#fff6ea",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: "auto",
  },
});
