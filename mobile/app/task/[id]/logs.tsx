import { useMemo, useState } from "react";
import {
  FlatList,
  RefreshControl,
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
import { MODULE_NAMES, type LogEntry } from "@/lib/types";

function LogItem({ entry }: { entry: LogEntry }) {
  const colors = useColors();
  const LEVEL_TONE = {
    info: { color: colors.success, bg: `${colors.success}25` },
    warn: { color: colors.warning, bg: `${colors.warning}25` },
    error: { color: colors.error, bg: `${colors.error}15` },
  };
  const tone = LEVEL_TONE[entry.level as keyof typeof LEVEL_TONE] ?? LEVEL_TONE.info;

  return (
    <View style={[styles.logCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.logMetaRow}>
        <View style={styles.logMetaLeft}>
          <View style={[styles.levelBadge, { backgroundColor: tone.bg }]}>
            <Text style={[styles.levelBadgeText, { color: tone.color }]}>{entry.level.toUpperCase()}</Text>
          </View>
          <Text style={[styles.moduleText, { color: colors.muted }]}>
            {entry.module_id ? `${entry.module_id} ${MODULE_NAMES[entry.module_id]}` : "系统"}
          </Text>
        </View>
        <Text style={[styles.timeText, { color: colors.muted }]}>
          {new Date(entry.timestamp).toLocaleTimeString("zh-CN")}
        </Text>
      </View>
      <Text style={[styles.logMessage, { color: colors.foreground }]}>{entry.message}</Text>
    </View>
  );
}

export default function LogsScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, loadTaskBundle } = useTaskContext();
  const [level, setLevel] = useState<"all" | "info" | "warn" | "error">("all");

  const filteredLogs = useMemo(() => {
    return level === "all" ? state.logs : state.logs.filter((item) => item.level === level);
  }, [level, state.logs]);

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon}>
          <MaterialIcons name="arrow-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>执行日志</Text>
          <Text style={[styles.headerSubtitle, { color: colors.muted }]}>
            {state.wsConnected ? "WebSocket 实时同步中" : "当前使用轮询方式同步"}
          </Text>
        </View>
        <View style={styles.headerIcon} />
      </View>

      <View style={styles.filterRow}>
        {(["all", "info", "warn", "error"] as const).map((item) => {
          const active = level === item;
          return (
            <TouchableOpacity
              key={item}
              onPress={() => setLevel(item)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: active ? colors.primary : colors.surface,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.filterChipText, { color: active ? "#ffffff" : colors.muted }]}>
                {item === "all" ? "全部" : item.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={filteredLogs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <LogItem entry={item} />}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => (id ? void loadTaskBundle(id) : undefined)}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialIcons name="article" size={42} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>暂无日志</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              后端开始执行后，这里会显示实时追踪日志。
            </Text>
          </View>
        }
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextWrap: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: Fonts.serif,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 12,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 90,
    gap: 10,
  },
  logCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 10,
    marginTop: 10,
  },
  logMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  logMetaLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  levelBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  levelBadgeText: {
    fontSize: 10,
    fontFamily: Fonts.mono,
  },
  moduleText: {
    fontSize: 11,
    fontFamily: Fonts.mono,
  },
  timeText: {
    fontSize: 11,
    fontFamily: Fonts.mono,
  },
  logMessage: {
    fontSize: 14,
    lineHeight: 21,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 72,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: Fonts.serif,
    fontWeight: "700",
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
