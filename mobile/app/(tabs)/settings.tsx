import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { Fonts } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import {
  getBackendUrl,
  getNetworkMode,
  getResolvedWsUrl,
  setBackendUrl,
  testConnection,
} from "@/lib/api";
import type { ConnectionTestResult, NetworkMode } from "@/lib/types";

function StatusRow({
  label,
  value,
  healthy,
}: {
  label: string;
  value: string;
  healthy: boolean;
}) {
  return (
    <View style={styles.statusRow}>
      <View style={styles.statusLabelWrap}>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: healthy ? "#46664a" : "#ba1a1a" },
          ]}
        />
        <Text style={styles.statusLabel}>{label}</Text>
      </View>
      <Text style={[styles.statusValue, { color: healthy ? "#46664a" : "#ba1a1a" }]}>{value}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const [url, setUrl] = useState("");
  const [resolvedWsUrl, setResolvedWsUrl] = useState("");
  const [networkMode, setNetworkModeState] = useState<NetworkMode>("unknown");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastResult, setLastResult] = useState<ConnectionTestResult | null>(null);

  useEffect(() => {
    Promise.all([getBackendUrl(), getResolvedWsUrl(), getNetworkMode()]).then(
      ([backendUrl, wsUrl, mode]) => {
        setUrl(backendUrl);
        setResolvedWsUrl(wsUrl);
        setNetworkModeState(mode);
      }
    );
  }, []);

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await testConnection(url);
      setLastResult(result);
      setResolvedWsUrl(result.resolvedWsUrl);
      setNetworkModeState(result.networkMode);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setBackendUrl(url);
      const result = await testConnection(url);
      setLastResult(result);
      setResolvedWsUrl(result.resolvedWsUrl);
      setNetworkModeState(result.networkMode);
      Alert.alert("已保存", "后端地址已更新。");
    } catch (error) {
      Alert.alert("保存失败", error instanceof Error ? error.message : "无法保存设置。");
    } finally {
      setSaving(false);
    }
  };

  const overallStatus = useMemo(() => {
    if (!lastResult) return "尚未检测";
    if (lastResult.rest && lastResult.websocket) return "REST / WebSocket 均可用";
    if (lastResult.rest) return "REST 可用，WebSocket 异常";
    return "连接失败";
  }, [lastResult]);

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.muted }]}>Connection Settings</Text>
          <Text style={[styles.title, { color: colors.primary }]}>Backend Address</Text>
          <Text style={[styles.description, { color: colors.foreground }]}>
            手机端只需要知道 FastAPI 的基础地址。REST 与 WebSocket 地址会自动推导，不修改原有后端逻辑。
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.muted }]}>Backend Base URL</Text>
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: "#f1f4f1" }]}>
            <MaterialIcons name="lan" size={18} color={colors.muted} />
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder="http://192.168.1.100:8000"
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.foreground }]}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>
          <Text style={[styles.hint, { color: colors.muted }]}>
            局域网联调建议填电脑内网地址；若使用 ngrok、cloudflared、frp 等内网穿透，则填写公网 HTTPS 地址。
          </Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              onPress={handleTest}
              disabled={testing}
              style={[styles.secondaryButton, { borderColor: colors.border }]}
            >
              {testing ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <MaterialIcons name="sync" size={18} color={colors.primary} />
                  <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>测试连接</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            >
              {saving ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <MaterialIcons name="save" size={18} color="#ffffff" />
                  <Text style={styles.primaryButtonText}>保存</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.healthHeader}>
            <Text style={[styles.healthTitle, { color: colors.foreground }]}>Connection Health</Text>
            <Text style={[styles.healthValue, { color: colors.primary }]}>{overallStatus}</Text>
          </View>
          <StatusRow
            label="REST API"
            value={lastResult?.rest ? "Connected" : "Pending"}
            healthy={Boolean(lastResult?.rest)}
          />
          <StatusRow
            label="WebSocket"
            value={lastResult?.websocket ? "Connected" : "Pending"}
            healthy={Boolean(lastResult?.websocket)}
          />
          <StatusRow
            label="Network Mode"
            value={networkMode === "lan" ? "LAN" : networkMode === "public" ? "Public / Tunnel" : "Unknown"}
            healthy={networkMode !== "unknown"}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text style={[styles.metaLine, { color: colors.muted }]}>Resolved WS: {resolvedWsUrl || "未生成"}</Text>
        </View>

        <View style={[styles.infoCard, { borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Connection Strategy</Text>
          <Text style={[styles.infoText, { color: colors.muted }]}>
            1. 局域网模式：手机与电脑处于同一 Wi-Fi，使用 `http://内网IP:8000`。
          </Text>
          <Text style={[styles.infoText, { color: colors.muted }]}>
            2. 公网 / 穿透模式：填写 tunnel 地址，App 会自动把 `https://` 推导为 `wss://`。
          </Text>
          <Text style={[styles.infoText, { color: colors.muted }]}>
            3. 测试连接时会同时检查 `GET /api/tasks` 和 `/ws` 握手。
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 18,
    paddingBottom: 110,
    gap: 16,
  },
  header: {
    gap: 8,
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
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
  },
  inputWrap: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 14,
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  secondaryButton: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  primaryButton: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  healthHeader: {
    gap: 4,
    marginBottom: 4,
  },
  healthTitle: {
    fontSize: 20,
    fontFamily: Fonts.serif,
    fontWeight: "700",
  },
  healthValue: {
    fontSize: 13,
    fontWeight: "700",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  statusLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  statusLabel: {
    fontSize: 13,
    color: "#181c1b",
  },
  statusValue: {
    fontSize: 12,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    marginVertical: 6,
  },
  metaLine: {
    fontSize: 11,
    lineHeight: 18,
    fontFamily: Fonts.mono,
  },
  infoCard: {
    borderWidth: 1,
    borderRadius: 24,
    backgroundColor: "#f8f3eb",
    padding: 18,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: Fonts.serif,
    fontWeight: "700",
  },
  infoText: {
    fontSize: 13,
    lineHeight: 20,
  },
});
