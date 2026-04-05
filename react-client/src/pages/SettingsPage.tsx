import { Copy, Cpu, FolderCog, Globe2, PlugZap, Save, Wifi } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { EditorialPage, SectionBlock, StatusBadge } from "../components/ui/Primitives";
import { getConnectionInfo, getRuntimeSettings, saveRuntimeSettings } from "../services/api";
import {
  getDesktopSettings,
  saveDesktopSettings,
  sanitizeDesktopSettings,
  type DesktopSettings,
} from "../services/preferences";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type {
  BackendConnectionAddress,
  BackendConnectionInfoResponse,
  BackendRuntimeSettingsResponse,
} from "../types/backend";

const LOCAL_PROVIDER = "local-gguf";
const CUSTOM_PRESET = "custom";

const DEFAULT_RUNTIME: BackendRuntimeSettingsResponse = {
  llm_provider: "openai",
  api_key: "",
  model: "gpt-4o",
  provider_base_url: "https://api.openai.com/v1",
  search_provider: "brave",
  search_api_key: "",
  local_engine: "lm-studio",
  local_server_url: "http://127.0.0.1:1234/v1",
  local_model_path: "",
  local_model_alias: "local-gguf",
  local_context_size: 4096,
  local_gpu_layers: 0,
  public_base_url: "",
  env_path: "backend/.env",
};

const PRESETS = [
  { id: "openai-gpt-4o", label: "OpenAI / GPT-4o", provider: "openai", model: "gpt-4o", baseUrl: "https://api.openai.com/v1" },
  { id: "openai-gpt-4.1", label: "OpenAI / GPT-4.1", provider: "openai", model: "gpt-4.1", baseUrl: "https://api.openai.com/v1" },
  { id: "deepseek-chat", label: "DeepSeek / deepseek-chat", provider: "openai", model: "deepseek-chat", baseUrl: "https://api.deepseek.com/v1" },
  { id: "zhipu-glm-4-flash", label: "智谱AI / GLM-4-Flash", provider: "openai", model: "glm-4-flash", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  { id: "local-gguf", label: "本地模型 / LM Studio", provider: LOCAL_PROVIDER, model: "local-gguf", baseUrl: "http://127.0.0.1:1234/v1" },
] as const;

function inferPresetId(settings: BackendRuntimeSettingsResponse) {
  if (settings.llm_provider === LOCAL_PROVIDER) return "local-gguf";
  return (
    PRESETS.find((preset) => preset.provider === settings.llm_provider && preset.model === settings.model && preset.baseUrl === settings.provider_base_url)?.id ??
    CUSTOM_PRESET
  );
}

function inferLocalAlias(path: string, alias: string, fallback: string) {
  if (alias.trim()) return alias.trim();
  const filename = path.split(/[/\\]/).pop() ?? "";
  const stem = filename.replace(/\.gguf$/i, "").trim();
  return stem || fallback;
}

function dedupeAddresses(addresses: BackendConnectionAddress[]) {
  const seen = new Set<string>();
  return addresses.filter((address) => {
    if (!address.url || seen.has(address.url)) return false;
    seen.add(address.url);
    return true;
  });
}

function mergeConnectionInfo(
  info: BackendConnectionInfoResponse | null,
  manualPublicBaseUrl: string,
) {
  const manualUrl = manualPublicBaseUrl.trim().replace(/\/$/, "");
  const manualAddresses: BackendConnectionAddress[] = manualUrl
    ? [{
        scope: "public",
        label: "公网 / 隧道",
        url: manualUrl,
        ws_url: `${manualUrl.replace(/^http/i, "ws")}/ws`,
        source: "manual_runtime_setting",
        recommended: false,
      }]
    : [];
  const publicUrls = dedupeAddresses([...(info?.public_urls ?? []), ...manualAddresses]);
  const lanUrls = info?.lan_urls ?? [];
  return {
    notes: info?.notes ?? [],
    lanUrls,
    publicUrls,
    recommendedMobileUrl: info?.recommended_mobile_url || publicUrls[0]?.url || lanUrls[0]?.url || "",
    recommendedMobileWsUrl: info?.recommended_mobile_ws_url || publicUrls[0]?.ws_url || lanUrls[0]?.ws_url || "",
  };
}

function AddressCard({
  icon,
  title,
  subtitle,
  addresses,
  emptyText,
  onCopy,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  addresses: BackendConnectionAddress[];
  emptyText: string;
  onCopy: (value: string, label: string) => void;
}) {
  return (
    <div className="connection-address-card">
      <div className="connection-address-header">
        <div className="connection-address-icon">{icon}</div>
        <div>
          <div className="form-label">{title}</div>
          <div className="tiny muted">{subtitle}</div>
        </div>
      </div>
      {addresses.length ? (
        <div className="stack">
          {addresses.map((address) => (
            <div key={`${address.scope}-${address.url}`} className="connection-address-row">
              <code>{address.url}</code>
              <button className="button-secondary connection-copy-button" onClick={() => void onCopy(address.url, title)} type="button">
                <Copy size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="callout-note">{emptyText}</div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const showToast = useWorkspaceStore((state) => state.showToast);
  const [tab, setTab] = useState<"connection" | "runtime" | "local">("connection");
  const [desktopSettings, setDesktopSettings] = useState<DesktopSettings>(() => getDesktopSettings());
  const [runtimeSettings, setRuntimeSettings] = useState(DEFAULT_RUNTIME);
  const [selectedPresetId, setSelectedPresetId] = useState(() => inferPresetId(DEFAULT_RUNTIME));
  const [connectionInfo, setConnectionInfo] = useState<BackendConnectionInfoResponse | null>(null);
  const [loadingRuntime, setLoadingRuntime] = useState(true);
  const [loadingConnection, setLoadingConnection] = useState(true);
  const [saving, setSaving] = useState(false);

  const connectionView = useMemo(
    () => mergeConnectionInfo(connectionInfo, runtimeSettings.public_base_url),
    [connectionInfo, runtimeSettings.public_base_url],
  );

  useEffect(() => {
    let cancelled = false;
    void getRuntimeSettings()
      .then((settings) => {
        if (cancelled) return;
        setRuntimeSettings(settings);
        setSelectedPresetId(inferPresetId(settings));
      })
      .catch((error) => {
        if (!cancelled) {
          showToast(error instanceof Error ? error.message : "加载运行时设置失败");
        }
      })
      .finally(() => {
        if (cancelled) setLoadingRuntime(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  useEffect(() => {
    let cancelled = false;
    setLoadingConnection(true);
    void getConnectionInfo(desktopSettings.apiBase)
      .then((info) => {
        if (cancelled) setConnectionInfo(info);
      })
      .catch((error) => {
        if (!cancelled) {
          setConnectionInfo(null);
          showToast(error instanceof Error ? error.message : "解析连接地址失败");
        }
      })
      .finally(() => {
        if (cancelled) setLoadingConnection(false);
      });
    return () => {
      cancelled = true;
    };
  }, [desktopSettings.apiBase, showToast]);

  const updateDesktop = <K extends keyof DesktopSettings>(key: K, value: DesktopSettings[K]) => {
    setDesktopSettings((current) => ({ ...current, [key]: value }));
  };

  const updateTaskConfig = <K extends keyof DesktopSettings["taskConfig"]>(key: K, value: DesktopSettings["taskConfig"][K]) => {
    setDesktopSettings((current) => ({ ...current, taskConfig: { ...current.taskConfig, [key]: value } }));
  };

  const updateRuntime = <K extends keyof BackendRuntimeSettingsResponse>(key: K, value: BackendRuntimeSettingsResponse[K]) => {
    setRuntimeSettings((current) => ({ ...current, [key]: value }));
  };

  const applyPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setRuntimeSettings((current) => {
      if (preset.provider === LOCAL_PROVIDER) {
        const alias = inferLocalAlias(current.local_model_path, current.local_model_alias, preset.model);
        return {
          ...current,
          llm_provider: LOCAL_PROVIDER,
          api_key: current.api_key.trim() || "not-needed",
          model: alias,
          local_model_alias: alias,
          provider_base_url: current.local_server_url || preset.baseUrl,
          local_server_url: current.local_server_url || preset.baseUrl,
        };
      }
      return { ...current, llm_provider: preset.provider, model: preset.model, provider_base_url: preset.baseUrl };
    });
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const nextDesktopSettings = sanitizeDesktopSettings(desktopSettings);
      const nextRuntimeSettings = await saveRuntimeSettings(runtimeSettings);
      saveDesktopSettings(nextDesktopSettings);
      setDesktopSettings(nextDesktopSettings);
      setRuntimeSettings(nextRuntimeSettings);
      setSelectedPresetId(inferPresetId(nextRuntimeSettings));
      setConnectionInfo(await getConnectionInfo(nextDesktopSettings.apiBase));
      showToast(`设置已保存到 ${nextRuntimeSettings.env_path}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存设置失败");
    } finally {
      setSaving(false);
    }
  };

  const copyValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(`${label} 已复制`);
    } catch {
      showToast(`复制 ${label} 失败`);
    }
  };

  return (
    <EditorialPage
      eyebrow="配置"
      title="管理连接、运行时和工作空间设置"
      description="后端发布相同的局域网和公网连接信息，供桌面端和移动端使用"
      actions={<button className="button-primary" onClick={() => void saveAll()} type="button"><Save size={14} />{saving ? "保存中..." : "保存设置"}</button>}
    >
      <div className="stack">
        <div className="settings-nav">
          <button className={`settings-nav-item${tab === "connection" ? " active" : ""}`} onClick={() => setTab("connection")} type="button"><PlugZap size={14} />连接</button>
          <button className={`settings-nav-item${tab === "runtime" ? " active" : ""}`} onClick={() => setTab("runtime")} type="button"><Cpu size={14} />运行时</button>
          <button className={`settings-nav-item${tab === "local" ? " active" : ""}`} onClick={() => setTab("local")} type="button"><FolderCog size={14} />工作空间</button>
        </div>

        {tab === "connection" ? (
          <SectionBlock
            title="前端和移动端连接"
            description="桌面端可使用 /api，但手机必须使用真实的后端地址"
            action={<StatusBadge status={loadingConnection ? "in-progress" : "completed"} label={loadingConnection ? "解析中" : "就绪"} />}
          >
            <div className="settings-form">
              <label className="form-row"><span className="form-label">API 基础路径</span><input className="toolbar-input" value={desktopSettings.apiBase} onChange={(event) => updateDesktop("apiBase", event.target.value)} placeholder="/api" type="text" /></label>
              <label className="form-row"><span className="form-label">WebSocket 基础路径</span><input className="toolbar-input" value={desktopSettings.wsBase} onChange={(event) => updateDesktop("wsBase", event.target.value)} placeholder="留空则从 API 路径自动推导" type="text" /></label>
              <label className="form-row"><span className="form-label">后端访问令牌</span><input className="toolbar-input" value={desktopSettings.backendAccessToken} onChange={(event) => updateDesktop("backendAccessToken", event.target.value)} placeholder="仅当后端需要认证时填写" type="password" /></label>
              <label className="form-row"><span className="form-label">公网 / 隧道基础 URL</span><input className="toolbar-input" value={runtimeSettings.public_base_url} onChange={(event) => updateRuntime("public_base_url", event.target.value)} placeholder="https://your-public-domain-or-tunnel" type="text" /></label>
              <div className="connection-address-grid">
                <AddressCard icon={<Wifi size={15} />} title="局域网地址" subtitle="同一 WiFi 下使用" addresses={connectionView.lanUrls} emptyText="未检测到局域网地址" onCopy={copyValue} />
                <AddressCard icon={<Globe2 size={15} />} title="公网地址" subtitle="互联网远程访问使用" addresses={connectionView.publicUrls} emptyText="未检测到公网或隧道地址" onCopy={copyValue} />
              </div>
              <div className="callout-note">推荐的移动端基础 URL: <code>{connectionView.recommendedMobileUrl || "暂不可用"}</code></div>
              <div className="callout-note">推荐的移动端 WebSocket URL: <code>{connectionView.recommendedMobileWsUrl || "暂不可用"}</code></div>
              <div className="callout-note">{desktopSettings.apiBase.trim().startsWith("/") ? "桌面开发环境可使用相对路径 /api 代理。手机必须使用上述绝对地址之一。" : "桌面端已使用绝对后端地址。"}</div>
              {connectionView.notes.length ? <div className="callout-note">{connectionView.notes.join(" ")}</div> : null}
            </div>
          </SectionBlock>
        ) : null}

        {tab === "runtime" ? (
          <SectionBlock
            title="后端运行时设置"
            description="这些值将写入 backend/.env，供 ScholarMind 管道使用"
            action={<StatusBadge status={loadingRuntime ? "in-progress" : "completed"} label={loadingRuntime ? "加载中" : "环境就绪"} />}
          >
            <div className="settings-form">
              <label className="form-row"><span className="form-label">模型预设</span><select className="toolbar-input" value={selectedPresetId} onChange={(event) => applyPreset(event.target.value)}>{PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}<option value={CUSTOM_PRESET}>自定义</option></select></label>
              <label className="form-row"><span className="form-label">提供商</span><input className="toolbar-input" value={runtimeSettings.llm_provider} onChange={(event) => updateRuntime("llm_provider", event.target.value)} type="text" /></label>
              <label className="form-row"><span className="form-label">模型</span><input className="toolbar-input" value={runtimeSettings.model} onChange={(event) => updateRuntime("model", event.target.value)} type="text" /></label>
              <label className="form-row"><span className="form-label">提供商基础 URL</span><input className="toolbar-input" value={runtimeSettings.provider_base_url} onChange={(event) => updateRuntime("provider_base_url", event.target.value)} type="text" /></label>
              <label className="form-row"><span className="form-label">提供商 API 密钥</span><input className="toolbar-input" value={runtimeSettings.api_key} onChange={(event) => updateRuntime("api_key", event.target.value)} type="password" /></label>
              <label className="form-row"><span className="form-label">搜索提供商</span><input className="toolbar-input" value={runtimeSettings.search_provider} onChange={(event) => updateRuntime("search_provider", event.target.value)} type="text" /></label>
              <label className="form-row"><span className="form-label">搜索 API 密钥</span><input className="toolbar-input" value={runtimeSettings.search_api_key} onChange={(event) => updateRuntime("search_api_key", event.target.value)} type="password" /></label>
              <label className="form-row"><span className="form-label">本地引擎</span><input className="toolbar-input" value={runtimeSettings.local_engine} onChange={(event) => updateRuntime("local_engine", event.target.value)} type="text" /></label>
              <label className="form-row"><span className="form-label">本地服务器 URL</span><input className="toolbar-input" value={runtimeSettings.local_server_url} onChange={(event) => updateRuntime("local_server_url", event.target.value)} type="text" /></label>
              <label className="form-row"><span className="form-label">本地模型路径</span><input className="toolbar-input" value={runtimeSettings.local_model_path} onChange={(event) => updateRuntime("local_model_path", event.target.value)} type="text" /></label>
              <label className="form-row"><span className="form-label">本地模型别名</span><input className="toolbar-input" value={runtimeSettings.local_model_alias} onChange={(event) => updateRuntime("local_model_alias", event.target.value)} type="text" /></label>
              <div className="field-grid">
                <label className="form-row"><span className="form-label">上下文大小</span><input className="toolbar-input" value={runtimeSettings.local_context_size} onChange={(event) => updateRuntime("local_context_size", Number(event.target.value) || 512)} type="number" /></label>
                <label className="form-row"><span className="form-label">GPU 层数</span><input className="toolbar-input" value={runtimeSettings.local_gpu_layers} onChange={(event) => updateRuntime("local_gpu_layers", Math.max(0, Number(event.target.value) || 0))} type="number" /></label>
              </div>
              <div className="callout-note">本地模型别名提示: <code>{inferLocalAlias(runtimeSettings.local_model_path, runtimeSettings.local_model_alias, runtimeSettings.model)}</code></div>
              <div className="callout-note">环境文件: {runtimeSettings.env_path}</div>
            </div>
          </SectionBlock>
        ) : null}

        {tab === "local" ? (
          <SectionBlock title="工作空间默认设置" description="这些偏好设置会影响新任务和本地工作空间路径" action={<StatusBadge status="completed" label="工作空间设置" />}>
            <div className="stack">
              <div className="field-grid">
                <label className="form-row"><span className="form-label">工作目录</span><input className="toolbar-input" value={desktopSettings.workingDirectoryPath} onChange={(event) => updateDesktop("workingDirectoryPath", event.target.value)} type="text" /></label>
                <label className="form-row"><span className="form-label">目录标签</span><input className="toolbar-input" value={desktopSettings.workingDirectoryLabel} onChange={(event) => updateDesktop("workingDirectoryLabel", event.target.value)} type="text" /></label>
              </div>
              <label className="form-row"><span className="form-label">任务描述模板</span><textarea className="text-area" value={desktopSettings.taskDescriptionTemplate} onChange={(event) => updateDesktop("taskDescriptionTemplate", event.target.value)} /></label>
              <div className="field-grid">
                <label className="form-row"><span className="form-label">最大想法数</span><input className="toolbar-input" value={desktopSettings.taskConfig.maxIdeas} onChange={(event) => updateTaskConfig("maxIdeas", Number(event.target.value) || 1)} type="number" /></label>
                <label className="form-row"><span className="form-label">反思次数</span><input className="toolbar-input" value={desktopSettings.taskConfig.numReflections} onChange={(event) => updateTaskConfig("numReflections", Number(event.target.value) || 1)} type="number" /></label>
                <label className="form-row"><span className="form-label">最大重试次数</span><input className="toolbar-input" value={desktopSettings.taskConfig.maxRetries} onChange={(event) => updateTaskConfig("maxRetries", Number(event.target.value) || 0)} type="number" /></label>
              </div>
            </div>
          </SectionBlock>
        ) : null}
      </div>
    </EditorialPage>
  );
}
