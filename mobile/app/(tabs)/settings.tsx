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
  fetchConnectionInfo,
  getBackendUrl,
  getNetworkMode,
  getResolvedWsUrl,
  setBackendUrl,
  testConnection,
} from "@/lib/api";
import type { ConnectionAddress, ConnectionInfo, ConnectionTestResult, NetworkMode } from "@/lib/types";

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
        <View style={[styles.statusDot, { backgroundColor: healthy ? "#46664a" : "#ba1a1a" }]} />
        <Text style={styles.statusLabel}>{label}</Text>
      </View>
      <Text style={[styles.statusValue, { color: healthy ? "#46664a" : "#ba1a1a" }]}>{value}</Text>
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
        <Text style={styles.addressEmpty}>Not available</Text>
      )}
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
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);

  useEffect(() => {
    Promise.all([getBackendUrl(), getResolvedWsUrl(), getNetworkMode()])
      .then(([backendUrl, wsUrl, mode]) => {
        setUrl(backendUrl);
        setResolvedWsUrl(wsUrl);
        setNetworkModeState(mode);
        if (backendUrl) {
          return fetchConnectionInfo(backendUrl).then(setConnectionInfo).catch(() => undefined);
        }
        return undefined;
      })
      .catch(() => undefined);
  }, []);

  const refreshConnectionState = async (targetUrl: string) => {
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
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await refreshConnectionState(url);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setBackendUrl(url);
      await refreshConnectionState(url);
      Alert.alert("Saved", "Backend base URL updated.");
    } catch (error) {
      Alert.alert("Save failed", error instanceof Error ? error.message : "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const overallStatus = useMemo(() => {
    if (!lastResult) return "Not checked";
    if (lastResult.rest && lastResult.websocket) return "REST and WebSocket healthy";
    if (lastResult.rest) return "REST healthy, WebSocket failed";
    return "Connection failed";
  }, [lastResult]);

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.muted }]}>Connection Settings</Text>
          <Text style={[styles.title, { color: colors.primary }]}>Backend Address</Text>
          <Text style={[styles.description, { color: colors.foreground }]}>
            Enter the ScholarMind backend root URL. The app derives REST and WebSocket paths automatically.
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
            Same Wi-Fi: use the LAN URL. Remote access: use the public or tunnel URL.
          </Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity onPress={handleTest} disabled={testing} style={[styles.secondaryButton, { borderColor: colors.border }]}>
              {testing ? <ActivityIndicator color={colors.primary} /> : <><MaterialIcons name="sync" size={18} color={colors.primary} /><Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Test</Text></>}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} disabled={saving} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
              {saving ? <ActivityIndicator color="#ffffff" /> : <><MaterialIcons name="save" size={18} color="#ffffff" /><Text style={styles.primaryButtonText}>Save</Text></>}
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.healthHeader}>
            <Text style={[styles.healthTitle, { color: colors.foreground }]}>Connection Health</Text>
            <Text style={[styles.healthValue, { color: colors.primary }]}>{overallStatus}</Text>
          </View>
          <StatusRow label="REST API" value={lastResult?.rest ? "Connected" : "Pending"} healthy={Boolean(lastResult?.rest)} />
          <StatusRow label="WebSocket" value={lastResult?.websocket ? "Connected" : "Pending"} healthy={Boolean(lastResult?.websocket)} />
          <StatusRow label="Network Mode" value={networkMode === "lan" ? "LAN" : networkMode === "public" ? "Public / Tunnel" : "Unknown"} healthy={networkMode !== "unknown"} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text style={[styles.metaLine, { color: colors.muted }]}>Resolved WS: {resolvedWsUrl || "Not generated"}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.healthTitle, { color: colors.foreground }]}>Backend Recommended URLs</Text>
          <Text style={[styles.hint, { color: colors.muted }]}>
            These addresses are returned by the backend and are the same ones shown on the desktop settings page.
          </Text>
          <AddressList title="LAN URL" subtitle="Use this on the same Wi-Fi." addresses={connectionInfo?.lan_urls ?? []} />
          <AddressList title="Public URL" subtitle="Use this over the internet." addresses={connectionInfo?.public_urls ?? []} />
          <Text style={[styles.metaLine, { color: colors.muted }]}>
            Recommended mobile URL: {connectionInfo?.recommended_mobile_url || "Not available"}
          </Text>
          <Text style={[styles.metaLine, { color: colors.muted }]}>
            Recommended mobile WS: {connectionInfo?.recommended_mobile_ws_url || "Not available"}
          </Text>
          {connectionInfo?.notes?.length ? (
            <Text style={[styles.hint, { color: colors.muted }]}>{connectionInfo.notes.join(" ")}</Text>
          ) : null}
        </View>

        <View style={[styles.infoCard, { borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Connection Strategy</Text>
          <Text style={[styles.infoText, { color: colors.muted }]}>
            1. LAN mode: fill a private IP such as `http://192.168.x.x:8000`.
          </Text>
          <Text style={[styles.infoText, { color: colors.muted }]}>
            2. Public / tunnel mode: fill a public HTTPS address. The app will switch `https://` to `wss://`.
          </Text>
          <Text style={[styles.infoText, { color: colors.muted }]}>
            3. Connection test checks `GET /api/health` and then the `/ws` handshake.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 110, gap: 16 },
  header: { gap: 8 },
  eyebrow: { fontSize: 10, fontFamily: Fonts.mono, textTransform: "uppercase", letterSpacing: 1.8 },
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
  statusLabel: { fontSize: 13, color: "#181c1b" },
  statusValue: { fontSize: 12, fontWeight: "700" },
  divider: { height: 1, marginVertical: 6 },
  metaLine: { fontSize: 11, lineHeight: 18, fontFamily: Fonts.mono },
  infoCard: { borderWidth: 1, borderRadius: 24, backgroundColor: "#f8f3eb", padding: 18, gap: 10 },
  sectionTitle: { fontSize: 20, fontFamily: Fonts.serif, fontWeight: "700" },
  infoText: { fontSize: 13, lineHeight: 20 },
  addressCard: { gap: 6, paddingTop: 4 },
  addressTitle: { fontSize: 13, fontWeight: "700", color: "#181c1b" },
  addressSubtitle: { fontSize: 12, lineHeight: 18, color: "#66726b" },
  addressLine: { fontSize: 12, lineHeight: 18, fontFamily: Fonts.mono, color: "#181c1b" },
  addressEmpty: { fontSize: 12, lineHeight: 18, color: "#66726b" },
});
