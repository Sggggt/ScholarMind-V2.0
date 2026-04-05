import { Tabs } from "expo-router";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { Fonts } from "@/constants/theme";

// ScholarMind 对话标签页图标 - 设计理念：学术智慧 + AI 对话
function ScholarChatTabIcon({ size = 28, color = "#46664a" }: { size?: number; color?: string }) {
  const brainSize = size * 0.75;
  const bubbleSize = size * 0.35;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {/* 大脑图标 - 代表 ScholarMind 的智能核心 */}
      <MaterialIcons name="psychology" size={brainSize} color={color} />
      {/* 右下角小气泡 - 代表对话交互 */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          right: 0,
          width: bubbleSize + 6,
          height: bubbleSize + 6,
          borderRadius: 999,
          backgroundColor: color,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MaterialIcons name="chat" size={bubbleSize} color="#ffffff" />
      </View>
    </View>
  );
}

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 58 + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          paddingTop: 10,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: `${colors.surface}F4`,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          shadowColor: "#181c1b",
          shadowOpacity: 0.08,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -8 },
          elevation: 10,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: 1.1,
          fontFamily: Fonts.sans,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "任务",
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "对话",
          tabBarIcon: ({ color }) => <ScholarChatTabIcon size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "设置",
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="gearshape.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
