import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
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
  fetchConnectionInfo,
  getBackendSelection,
  getBackendUrl,
  getNetworkMode,
  getResolvedWsUrl,
  setBackendUrl,
  testConnection,
} from "@/lib/api";
import type {
  ConnectionAddress,
  ConnectionInfo,
  ConnectionTestResult,
  DiscoveredDevice,
  NetworkMode,
  SavedBackendSelection,
} from "@/lib/types";

let getMdnsBrowser: (() => any) | null = null;
let serviceToDiscoveredDevice: ((service: any) => DiscoveredDevice) | null = null;

if (Platform.OS !== "web") {
  try {
    const discoveryModule = require("@/lib/discovery/zeroconf");
    getMdnsBrowser = discoveryModule.getMdnsBrowser;
    serviceToDiscoveredDevice = discoveryModule.serviceToDiscoveredDevice;
  } catch {
    getMdnsBrowser = null;
    serviceToDiscoveredDevice = null;
  }
}

const AUTO_SCAN_MS = 15000;

function StatusRow({
  label,
  value,
  healthy,
  colors,
}: {
  label: string;
  value: string;
  healthy: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const statusColor = healthy ? colors.success : colors.error;
  return (
    <View style={styles.statusRow}>
      <View style={styles.statusLabelWrap}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusLabel, { color: colors.foreground }]}>{label}</Text>
      </View>
      <Text style={[styles.statusValue, { color: statusColor }]}>{value}</Text>
    </View>
  );
}

function AddressList({
  title,
  subtitle,
  addresses,
}: {
  title: string;
  subtitle: string;
  addresses: ConnectionAddress[];
}) {
  return (
    <View style={styles.addressCard}>
      <Text style={styles.addressTitle}>{title}</Text>
      <Text style={styles.addressSubtitle}>{subtitle}</Text>
      {addresses.length ? (
        addresses.map((address) => (
          <Text key={`${address.scope}-${address.url}`} selectable style={styles.addressLine}>
            {address.url}
          </Text>
        ))
      ) : (
        <Text style={styles.addressEmpty}>暂无可用地址</Text>
      )}
    </View>
  );
}

function buildSavedSelection(device: DiscoveredDevice, url: string): SavedBackendSelection {
  return {
    url,
    source: "mdns",
    deviceId: device.deviceId,
    displayName: device.displayName,
    host: device.host,
    port: device.port,
    lastSeenAt: new Date().toISOString(),
  };
}

function sortDevices(devices: DiscoveredDevice[], selection: SavedBackendSelection | null) {
  return [...devices].sort((left, right) => {
    const leftScore =
      (selection?.deviceId && left.deviceId === selection.deviceId ? 10 : 0) +
      (selection?.url && left.url === selection.url ? 5 : 0);
    const rightScore =
      (selection?.deviceId && right.deviceId === selection.deviceId ? 10 : 0) +
      (selection?.url && right.url === selection.url ? 5 : 0);

    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    return left.displayName.localeCompare(right.displayName);
  });
}

function DeviceCard({
  device,
  colors,
  active,
  busy,
  onPress,
}: {
  device: DiscoveredDevice;
  colors: ReturnType<typeof useColors>;
  active: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={busy}
      style={[
        styles.deviceCard,
        {
          backgroundColor: colors.surface,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      <View style={styles.deviceHeader}>
        <View style={[styles.deviceIcon, { backgroundColor: `${colors.primary}20` }]}>
          <MaterialIcons name="router" size={22} color={colors.primary} />
        </View>
        <View style={styles.deviceInfo}>
          <Text style={[styles.deviceName, { color: colors.foreground }]}>{device.displayName}</Text>
          <Text style={[styles.deviceUrl, { color: colors.muted }]}>{device.url}</Text>
        </View>
        {busy ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
        )}
      </View>
      <Text style={[styles.deviceId, { color: colors.muted }]}>
        设备 ID: {device.deviceId.slice(0, 8)}...{device.role === "backend" ? " 服务端" : ""}
      </Text>
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const [url, setUrl] = useState("");
  const [resolvedWsUrl, setResolvedWsUrl] = useState("");
  const [networkMode, setNetworkModeState] = useState<NetworkMode>("unknown");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connectingDeviceId, setConnectingDeviceId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ConnectionTestResult | null>(null);
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);
  const [backendSelection, setBackendSelectionState] = useState<SavedBackendSelection | null>(null);
  const [mdnsAvailable, setMdnsAvailable] = useState(false);
  const [discoveryEnabled, setDiscoveryEnabled] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const mdnsBrowserRef = useRef<any>(null);

  const sortedDevices = useMemo(
    () => sortDevices(discoveredDevices, backendSelection),
    [backendSelection, discoveredDevices]
  );

  const refreshConnectionState = useCallback(async (targetUrl: string) => {
    const result = await testConnection(targetUrl);
    setLastResult(result);
    setResolvedWsUrl(result.resolvedWsUrl);
    setNetworkModeState(result.networkMode);

    if (result.rest) {
      try {
        setConnectionInfo(await fetchConnectionInfo(targetUrl));
      } catch {
        setConnectionInfo(null);
      }
    } else {
      setConnectionInfo(null);
    }

    return result;
  }, []);

  const connectToDevice = useCallback(
    async (device: DiscoveredDevice) => {
      setConnectingDeviceId(device.deviceId);
      setUrl(device.url);

      try {
        const result = await refreshConnectionState(device.url);
        if (!result.rest) {
          Alert.alert("连接失败", "发现的服务端没有正确响应 `/api/health`。");
          return;
        }

        const nextSelection = buildSavedSelection(device, result.normalizedUrl || device.url);
        await setBackendUrl(device.url, { selection: nextSelection });
        setBackendSelectionState(nextSelection);
        setDiscoveryEnabled(false);

        if (result.websocket) {
          Alert.alert("连接成功", "已发现并保存局域网服务端。");
        } else {
          Alert.alert("已保存，但会降级", "REST 连接正常，但 WebSocket 失败，应用可能退回轮询模式。");
        }
      } catch (error) {
        Alert.alert("连接失败", error instanceof Error ? error.message : "暂时无法连接到该服务端。");
      } finally {
        setConnectingDeviceId(null);
      }
    },
    [refreshConnectionState]
  );

  useEffect(() => {
    const browser = getMdnsBrowser?.();
    if (!browser) {
      setMdnsAvailable(false);
      return;
    }

    mdnsBrowserRef.current = browser;
    setMdnsAvailable(true);

    const handleStart = () => {
      setScanning(true);
      setDiscoveryError(null);
    };
    const handleStop = () => setScanning(false);
    const handleFound = (service?: unknown) => {
      if (!service || !serviceToDiscoveredDevice) {
        return;
      }

      const device = serviceToDiscoveredDevice(service);
      if (device.role && device.role !== "backend") {
        return;
      }

      setDiscoveredDevices((current) => {
        const next = current.filter(
          (item) => item.deviceId !== device.deviceId && item.url !== device.url
        );
        next.push(device);
        return next;
      });
    };
    const handleRemove = (service?: unknown) => {
      if (!service || !serviceToDiscoveredDevice) {
        return;
      }

      const device = serviceToDiscoveredDevice(service);
      setDiscoveredDevices((current) =>
        current.filter((item) => item.deviceId !== device.deviceId && item.url !== device.url)
      );
    };
    const handleError = (error?: unknown) => {
      const message = error instanceof Error ? error.message : "局域网扫描失败。";
      setDiscoveryError(message);
      setScanning(false);
    };

    browser.on("start", handleStart);
    browser.on("stop", handleStop);
    browser.on("found", handleFound);
    browser.on("remove", handleRemove);
    browser.on("error", handleError);

    return () => {
      browser.off("start", handleStart);
      browser.off("stop", handleStop);
      browser.off("found", handleFound);
      browser.off("remove", handleRemove);
      browser.off("error", handleError);
      browser.stop();
    };
  }, []);

  useEffect(() => {
    Promise.all([getBackendUrl(), getResolvedWsUrl(), getNetworkMode(), getBackendSelection()])
      .then(([backendUrl, wsUrl, mode, savedSelection]) => {
        setUrl(backendUrl);
        setResolvedWsUrl(wsUrl);
        setNetworkModeState(mode);
        setBackendSelectionState(savedSelection);

        if (backendUrl) {
          return refreshConnectionState(backendUrl);
        }
        return undefined;
      })
      .catch(() => undefined);
  }, [refreshConnectionState]);

  useEffect(() => {
    if (!mdnsAvailable || connectingDeviceId) {
      return;
    }

    if (backendSelection?.source === "mdns") {
      setDiscoveryEnabled(true);
      return;
    }

    if (!url) {
      setDiscoveryEnabled(true);
    }
  }, [backendSelection, connectingDeviceId, mdnsAvailable, url]);

  useEffect(() => {
    const browser = mdnsBrowserRef.current;
    if (!browser) {
      return;
    }

    if (!discoveryEnabled) {
      browser.stop();
      setScanning(false);
      return;
    }

    setDiscoveredDevices([]);
    browser.start();

    const timer = setTimeout(() => {
      setDiscoveryEnabled(false);
    }, AUTO_SCAN_MS);

    return () => {
      clearTimeout(timer);
      browser.stop();
    };
  }, [discoveryEnabled]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    try {
      await refreshConnectionState(url);
    } finally {
      setTesting(false);
    }
  }, [refreshConnectionState, url]);

  const handleSaveManual = useCallback(async () => {
    setSaving(true);
    try {
      const result = await refreshConnectionState(url);
      if (!result.rest) {
        Alert.alert("保存失败", "服务端没有正确响应 `/api/health`。");
        return;
      }

      await setBackendUrl(url, {
        selection: {
          url: result.normalizedUrl,
          source: "manual",
          displayName: "手动配置服务端",
          lastSeenAt: new Date().toISOString(),
        },
      });

      setBackendSelectionState(await getBackendSelection());
      Alert.alert("保存成功", "已更新手动配置的服务端地址。");
    } catch (error) {
      Alert.alert("保存失败", error instanceof Error ? error.message : "暂时无法保存设置。");
    } finally {
      setSaving(false);
    }
  }, [refreshConnectionState, url]);

  const handleToggleDiscovery = useCallback(() => {
    setDiscoveryEnabled((current) => !current);
  }, []);

  const overallStatus = useMemo(() => {
    if (!lastResult) return "未检测";
    if (lastResult.rest && lastResult.websocket) return "REST 与 WebSocket 正常";
    if (lastResult.rest) return "REST 正常，WebSocket 已降级";
    return "连接失败";
  }, [lastResult]);

  const discoverySummary = useMemo(() => {
    if (!mdnsAvailable) {
      return "局域网发现功能需要原生 Android/iOS 构建，并启用 react-native-zeroconf。";
    }
    if (discoveryError) {
      return discoveryError;
    }
    if (scanning) {
      return "正在扫描当前局域网中的 ScholarMind 服务端。";
    }
    if (sortedDevices.length > 0) {
      return `已在当前局域网发现 ${sortedDevices.length} 个服务端。`;
    }
    return "暂未发现服务端。请确认手机和后端主机连接到同一 Wi-Fi。";
  }, [discoveryError, mdnsAvailable, scanning, sortedDevices.length]);

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.muted }]}>连接设置</Text>
          <Text style={[styles.title, { color: colors.primary }]}>局域网发现</Text>
          <Text style={[styles.description, { color: colors.foreground }]}>
            应用会优先在局域网内发现 ScholarMind 服务端，手动输入地址则作为兜底方式保留。
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.discoveryHeader}>
            <View style={styles.discoveryTitleWrap}>
              <MaterialIcons name="wifi-find" size={20} color={colors.primary} />
              <Text style={[styles.discoveryTitle, { color: colors.foreground }]}>发现服务端</Text>
            </View>
            <TouchableOpacity
              onPress={handleToggleDiscovery}
              style={[
                styles.discoveryButton,
                {
                  backgroundColor: discoveryEnabled ? colors.error : colors.primary,
                  opacity: mdnsAvailable ? 1 : 0.55,
                },
              ]}
              disabled={!mdnsAvailable}
            >
              {scanning ? (
                <>
                  <ActivityIndicator size="small" color="#ffffff" />
                  <Text style={styles.discoveryButtonText}>扫描中</Text>
                </>
              ) : (
                <>
                  <MaterialIcons name={discoveryEnabled ? "close" : "search"} size={16} color="#ffffff" />
                  <Text style={styles.discoveryButtonText}>{discoveryEnabled ? "停止" : "扫描"}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          <Text style={[styles.hint, { color: colors.muted }]}>{discoverySummary}</Text>

          {backendSelection ? (
            <View style={[styles.selectionCard, { borderColor: colors.border }]}>
              <Text style={[styles.selectionTitle, { color: colors.foreground }]}>已保存的服务端</Text>
              <Text style={[styles.selectionValue, { color: colors.primary }]}>{backendSelection.displayName}</Text>
              <Text style={[styles.selectionMeta, { color: colors.muted }]}>
                {backendSelection.url}
                {backendSelection.deviceId ? ` · ${backendSelection.deviceId.slice(0, 8)}...` : ""}
              </Text>
            </View>
          ) : null}

          {sortedDevices.length > 0 ? (
            <View style={styles.deviceList}>
              {sortedDevices.map((device) => (
                <DeviceCard
                  key={`${device.deviceId}-${device.url}`}
                  device={device}
                  colors={colors}
                  active={backendSelection?.deviceId === device.deviceId || backendSelection?.url === device.url}
                  busy={connectingDeviceId === device.deviceId}
                  onPress={() => void connectToDevice(device)}
                />
              ))}
            </View>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.muted }]}>手动填写服务端地址</Text>
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
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
            只有在自动发现不可用，或者你需要覆盖自动发现结果时，才建议手动填写。
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
              onPress={handleSaveManual}
              disabled={saving}
              style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            >
              {saving ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <MaterialIcons name="save" size={18} color="#ffffff" />
                  <Text style={styles.primaryButtonText}>保存地址</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.healthHeader}>
            <Text style={[styles.healthTitle, { color: colors.foreground }]}>连接状态</Text>
            <Text style={[styles.healthValue, { color: colors.primary }]}>{overallStatus}</Text>
          </View>
          <StatusRow label="REST API" value={lastResult?.rest ? "已连接" : "待检测"} healthy={Boolean(lastResult?.rest)} colors={colors} />
          <StatusRow label="WebSocket" value={lastResult?.websocket ? "已连接" : "待检测"} healthy={Boolean(lastResult?.websocket)} colors={colors} />
          <StatusRow
            label="网络模式"
            value={networkMode === "lan" ? "局域网" : networkMode === "public" ? "公网 / 隧道" : "未知"}
            healthy={networkMode !== "unknown"}
            colors={colors}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text style={[styles.metaLine, { color: colors.muted }]}>解析后的 WS 地址：{resolvedWsUrl || "尚未生成"}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.healthTitle, { color: colors.foreground }]}>后端推荐地址</Text>
          <Text style={[styles.hint, { color: colors.muted }]}>
            这些地址由后端返回，理论上应与自动发现结果保持一致。
          </Text>
          <AddressList title="局域网地址" subtitle="同一 Wi-Fi 下优先使用此地址。" addresses={connectionInfo?.lan_urls ?? []} />
          <AddressList title="公网地址" subtitle="跨网络访问时使用此地址。" addresses={connectionInfo?.public_urls ?? []} />
          <Text style={[styles.metaLine, { color: colors.muted }]}>
            推荐移动端 URL：{connectionInfo?.recommended_mobile_url || "暂无"}
          </Text>
          <Text style={[styles.metaLine, { color: colors.muted }]}>
            推荐移动端 WS：{connectionInfo?.recommended_mobile_ws_url || "暂无"}
          </Text>
          {connectionInfo?.notes?.length ? (
            <Text style={[styles.hint, { color: colors.muted }]}>{connectionInfo.notes.join(" ")}</Text>
          ) : null}
        </View>

        <View style={[styles.infoCard, { borderColor: colors.border, backgroundColor: `${colors.warning}15` }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>连接策略</Text>
          <Text style={[styles.infoText, { color: colors.muted }]}>
            1. 应用会先扫描 `_scholarmind._tcp.local.`，优先连接同一局域网内的服务端。
          </Text>
          <Text style={[styles.infoText, { color: colors.muted }]}>
            2. 发现服务端后，应用会先校验 `GET /api/health`，再检测 `/api/ws` 握手是否可用。
          </Text>
          <Text style={[styles.infoText, { color: colors.muted }]}>
            3. 手动地址仅作为兜底方案，适用于自定义隧道或关闭发现能力的环境。
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 110, gap: 16 },
  header: { gap: 8 },
  eyebrow: { fontSize: 10, fontFamily: Fonts.mono, letterSpacing: 1.2 },
  title: { fontSize: 34, lineHeight: 36, fontFamily: Fonts.serif, fontWeight: "700" },
  description: { fontSize: 14, lineHeight: 22 },
  card: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 12 },
  label: { fontSize: 12, fontWeight: "700" },
  inputWrap: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  input: { flex: 1, fontSize: 14, paddingVertical: 14 },
  hint: { fontSize: 12, lineHeight: 18 },
  buttonRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  secondaryButton: { flex: 1, height: 50, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  secondaryButtonText: { fontSize: 13, fontWeight: "700" },
  primaryButton: { flex: 1, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  healthHeader: { gap: 4, marginBottom: 4 },
  healthTitle: { fontSize: 20, fontFamily: Fonts.serif, fontWeight: "700" },
  healthValue: { fontSize: 13, fontWeight: "700" },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  statusLabelWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 999 },
  statusLabel: { fontSize: 13 },
  statusValue: { fontSize: 12, fontWeight: "700" },
  divider: { height: 1, marginVertical: 6 },
  metaLine: { fontSize: 11, lineHeight: 18, fontFamily: Fonts.mono },
  infoCard: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 10 },
  sectionTitle: { fontSize: 20, fontFamily: Fonts.serif, fontWeight: "700" },
  infoText: { fontSize: 13, lineHeight: 20 },
  addressCard: { gap: 6, paddingTop: 4 },
  addressTitle: { fontSize: 13, fontWeight: "700" },
  addressSubtitle: { fontSize: 12, lineHeight: 18 },
  addressLine: { fontSize: 12, lineHeight: 18, fontFamily: Fonts.mono },
  addressEmpty: { fontSize: 12, lineHeight: 18 },
  discoveryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  discoveryTitleWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  discoveryTitle: { fontSize: 20, fontFamily: Fonts.serif, fontWeight: "700" },
  discoveryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    minWidth: 72,
    justifyContent: "center",
  },
  discoveryButtonText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
  selectionCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 4 },
  selectionTitle: { fontSize: 12, fontWeight: "700", letterSpacing: 0.4 },
  selectionValue: { fontSize: 16, fontWeight: "700" },
  selectionMeta: { fontSize: 12, lineHeight: 18 },
  deviceList: { gap: 10, marginTop: 8 },
  deviceCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  deviceHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  deviceIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  deviceInfo: { flex: 1 },
  deviceName: { fontSize: 16, fontWeight: "700" },
  deviceUrl: { fontSize: 13, marginTop: 2 },
  deviceId: { fontSize: 11, fontFamily: Fonts.mono },
});
