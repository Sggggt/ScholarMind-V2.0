import { useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { Fonts } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import { useTaskContext } from "@/lib/task-store";
import type { Task, TaskStatus } from "@/lib/types";

type TaskAction = "pause" | "resume" | "abort" | "restart";

type ActionConfig = {
  key: TaskAction;
  label: string;
  icon: ComponentProps<typeof MaterialIcons>["name"];
  variant: "primary" | "secondary" | "danger";
};

const ACTIONS_BY_STATUS: Partial<Record<TaskStatus, ActionConfig[]>> = {
  running: [
    { key: "restart", label: "重启", icon: "restart-alt", variant: "secondary" },
    { key: "pause", label: "暂停", icon: "pause", variant: "secondary" },
    { key: "abort", label: "终止", icon: "stop", variant: "danger" },
  ],
  paused: [
    { key: "restart", label: "重启", icon: "restart-alt", variant: "secondary" },
    { key: "resume", label: "恢复", icon: "play-arrow", variant: "primary" },
    { key: "abort", label: "终止", icon: "stop", variant: "danger" },
  ],
  review: [{ key: "restart", label: "重启", icon: "restart-alt", variant: "primary" }],
  completed: [{ key: "restart", label: "重启", icon: "restart-alt", variant: "primary" }],
  failed: [{ key: "restart", label: "重启", icon: "restart-alt", variant: "primary" }],
  aborted: [{ key: "restart", label: "重启", icon: "restart-alt", variant: "primary" }],
};

function getActionTone(colors: ReturnType<typeof useColors>, variant: ActionConfig["variant"]) {
  if (variant === "primary") {
    return {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
      textColor: "#ffffff",
    };
  }

  if (variant === "danger") {
    return {
      backgroundColor: `${colors.error}15`,
      borderColor: `${colors.error}40`,
      textColor: colors.error,
    };
  }

  return {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    textColor: colors.foreground,
  };
}

export function TaskControlBar({
  task,
  style,
}: {
  task: Task | null;
  style?: ViewStyle;
}) {
  const colors = useColors();
  const { pauseTask, resumeTask, abortTask, restartTask } = useTaskContext();
  const [busyAction, setBusyAction] = useState<TaskAction | null>(null);

  const actions = task ? ACTIONS_BY_STATUS[task.status] ?? [] : [];
  if (!task || actions.length === 0) {
    return null;
  }

  const runAction = (action: TaskAction) => {
    const perform = async () => {
      setBusyAction(action);
      try {
        if (action === "pause") {
          await pauseTask(task.id);
        } else if (action === "resume") {
          await resumeTask(task.id);
        } else if (action === "abort") {
          await abortTask(task.id);
        } else {
          await restartTask(task.id);
        }
      } catch (error) {
        Alert.alert(
          "操作失败",
          error instanceof Error ? error.message : "任务控制命令执行失败。"
        );
      } finally {
        setBusyAction(null);
      }
    };

    if (action === "abort") {
      Alert.alert("终止任务", "确认终止当前任务吗？", [
        { text: "取消", style: "cancel" },
        {
          text: "终止",
          style: "destructive",
          onPress: () => {
            void perform();
          },
        },
      ]);
      return;
    }

    if (action === "restart") {
      Alert.alert("重启任务", "确认重启当前任务吗？这会开始一轮新的执行。", [
        { text: "取消", style: "cancel" },
        {
          text: "重启",
          onPress: () => {
            void perform();
          },
        },
      ]);
      return;
    }

    void perform();
  };

  return (
    <View style={[styles.container, style]}>
      {actions.map((action) => {
        const tone = getActionTone(colors, action.variant);
        const isBusy = busyAction === action.key;

        return (
          <TouchableOpacity
            key={action.key}
            activeOpacity={0.88}
            disabled={busyAction !== null}
            onPress={() => runAction(action.key)}
            style={[
              styles.button,
              {
                backgroundColor: tone.backgroundColor,
                borderColor: tone.borderColor,
              },
            ]}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color={tone.textColor} />
            ) : (
              <MaterialIcons name={action.icon} size={18} color={tone.textColor} />
            )}
            <Text style={[styles.buttonText, { color: tone.textColor }]}>{action.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  button: {
    minWidth: 108,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonText: {
    fontSize: 14,
    fontFamily: Fonts.sans,
    fontWeight: "700",
  },
});
