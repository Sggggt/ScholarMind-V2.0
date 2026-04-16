import { Copy, Cpu, FolderCog, Globe2, PlugZap, Save, Wifi } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { EditorialPage, SectionBlock, StatusBadge } from "../components/ui/Primitives";
import {
  getConnectionInfo,
  getRuntimeSettings,
  getSshStatus,
  saveRuntimeSettings,
  testSshConnection,
} from "../services/api";
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
  BackendSshStatusResponse,
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
  ssh_enabled: true,
  ssh_host: "",
  ssh_port: 22,
  ssh_user: "",
  ssh_key_path: "",
  ssh_password: "",
  ssh_work_dir: "/tmp/scholarmind",
  ssh_conda_env: "",
  llm_simulation_enabled: true,
  public_base_url: "",
  env_path: "backend/.env",
};

const PRESETS = [
  { id: "openai-gpt-4o", label: "OpenAI / GPT-4o", provider: "openai", model: "gpt-4o", baseUrl: "https://api.openai.com/v1" },
  { id: "openai-gpt-4.1", label: "OpenAI / GPT-4.1", provider: "openai", model: "gpt-4.1", baseUrl: "https://api.openai.com/v1" },
  { id: "deepseek-chat", label: "DeepSeek / deepseek-chat", provider: "openai", model: "deepseek-chat", baseUrl: "https://api.deepseek.com/v1" },
  { id: "zhipu-glm-4-flash", label: "智谱 AI / GLM-4-Flash", provider: "openai", model: "glm-4-flash", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  { id: "local-gguf", label: "本地模型 / LM Studio", provider: LOCAL_PROVIDER, model: "local-gguf", baseUrl: "http://127.0.0.1:1234/v1" },
] as const;

type SshDraft = Pick<
  BackendRuntimeSettingsResponse,
  "ssh_host" | "ssh_port" | "ssh_user" | "ssh_key_path" | "ssh_password" | "ssh_work_dir" | "ssh_conda_env"
>;

function inferPresetId(settings: BackendRuntimeSettingsResponse) {
  if (settings.llm_provider === LOCAL_PROVIDER) return "local-gguf";
  return (
    PRESETS.find((preset) =>
      preset.provider === settings.llm_provider &&
      preset.model === settings.model &&
      preset.baseUrl === settings.provider_base_url,
    )?.id ?? CUSTOM_PRESET
  );
}

function inferLocalAlias(path: string, alias: string, fallback: string) {
  if (alias.trim()) return alias.trim();
  const filename = path.split(/[/\\]/).pop() ?? "";
  const stem = filename.replace(/\.gguf$/i, "").trim();
  return stem || fallback;
}

function createSshDraft(settings: BackendRuntimeSettingsResponse): SshDraft {
  return {
    ssh_host: settings.ssh_host,
    ssh_port: settings.ssh_port || 22,
    ssh_user: settings.ssh_user,
    ssh_key_path: settings.ssh_key_path,
    ssh_password: settings.ssh_password,
    ssh_work_dir: settings.ssh_work_dir || "/tmp/scholarmind",
    ssh_conda_env: settings.ssh_conda_env,
  };
}

function hasSshConnectionSettings(settings: Pick<BackendRuntimeSettingsResponse, "ssh_host" | "ssh_user">) {
  return Boolean(settings.ssh_host.trim() && settings.ssh_user.trim());
}

function dedupeAddresses(addresses: BackendConnectionAddress[]) {
  const seen = new Set<string>();
  return addresses.filter((address) => {
    if (!address.url || seen.has(address.url)) return false;
    seen.add(address.url);
    return true;
  });
}

function mergeConnectionInfo(info: BackendConnectionInfoResponse | null, manualPublicBaseUrl: string) {
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

function SettingsSwitchCard({
  title,
  description,
  checked,
  onToggle,
  action,
}: {
  title: string;
  description: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
  action?: ReactNode;
}) {
  return (
    <div className="settings-switch-card">
      <div className="settings-switch-copy">
        <div className="space-between">
          <span className="form-label">{title}</span>
          {action}
        </div>
        <span className="tiny muted">{description}</span>
      </div>
      <button
        aria-checked={checked}
        className={`settings-switch${checked ? " on" : ""}`}
        onClick={() => onToggle(!checked)}
        role="switch"
        type="button"
      >
        <span className="settings-switch-knob" />
      </button>
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
  const [sshStatus, setSshStatus] = useState<BackendSshStatusResponse | null>(null);
  const [sshDialogOpen, setSshDialogOpen] = useState(false);
  const [sshDraft, setSshDraft] = useState<SshDraft>(() => createSshDraft(DEFAULT_RUNTIME));
  const [loadingRuntime, setLoadingRuntime] = useState(true);
  const [loadingConnection, setLoadingConnection] = useState(true);
  const [loadingSsh, setLoadingSsh] = useState(true);
  const [testingSsh, setTestingSsh] = useState(false);
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
        setSshDraft(createSshDraft(settings));
        setSelectedPresetId(inferPresetId(settings));
      })
      .catch((error) => {
        if (!cancelled) {
          showToast(error instanceof Error ? error.message : "加载运行时设置失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRuntime(false);
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
        if (!cancelled) {
          setConnectionInfo(info);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setConnectionInfo(null);
          showToast(error instanceof Error ? error.message : "解析连接地址失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingConnection(false);
      });
    return () => {
      cancelled = true;
    };
  }, [desktopSettings.apiBase, showToast]);

  useEffect(() => {
    let cancelled = false;
    setLoadingSsh(true);
    void getSshStatus()
      .then((status) => {
        if (!cancelled) {
          setSshStatus(status);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSshStatus(null);
          showToast(error instanceof Error ? error.message : "加载 SSH 状态失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSsh(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const updateDesktop = <K extends keyof DesktopSettings>(key: K, value: DesktopSettings[K]) => {
    setDesktopSettings((current) => ({ ...current, [key]: value }));
  };

  const updateTaskConfig = <K extends keyof DesktopSettings["taskConfig"]>(
    key: K,
    value: DesktopSettings["taskConfig"][K],
  ) => {
    setDesktopSettings((current) => ({ ...current, taskConfig: { ...current.taskConfig, [key]: value } }));
  };

  const updateRuntime = <K extends keyof BackendRuntimeSettingsResponse>(
    key: K,
    value: BackendRuntimeSettingsResponse[K],
  ) => {
    setRuntimeSettings((current) => ({ ...current, [key]: value }));
  };

  const updateSshDraft = <K extends keyof SshDraft>(key: K, value: SshDraft[K]) => {
    setSshDraft((current) => ({ ...current, [key]: value }));
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

      return {
        ...current,
        llm_provider: preset.provider,
        model: preset.model,
        provider_base_url: preset.baseUrl,
      };
    });
  };

  const openSshDialog = () => {
    setSshDraft(createSshDraft(runtimeSettings));
    setSshDialogOpen(true);
  };

  const closeSshDialog = () => {
    setSshDialogOpen(false);
    setSshDraft(createSshDraft(runtimeSettings));
  };

  const applySshDialog = () => {
    if (!hasSshConnectionSettings(sshDraft)) {
      showToast("SSH 至少需要填写 Host 和 User");
      return;
    }

    setRuntimeSettings((current) => ({
      ...current,
      ssh_enabled: true,
      ssh_host: sshDraft.ssh_host.trim(),
      ssh_port: Math.max(1, Number(sshDraft.ssh_port) || 22),
      ssh_user: sshDraft.ssh_user.trim(),
      ssh_key_path: sshDraft.ssh_key_path.trim(),
      ssh_password: sshDraft.ssh_password,
      ssh_work_dir: sshDraft.ssh_work_dir.trim() || "/tmp/scholarmind",
      ssh_conda_env: sshDraft.ssh_conda_env.trim(),
    }));
    setSshDialogOpen(false);
  };

  const handleSshToggle = (next: boolean) => {
    if (next) {
      openSshDialog();
      return;
    }

    updateRuntime("ssh_enabled", false);
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const nextDesktopSettings = sanitizeDesktopSettings(desktopSettings);
      const nextRuntimeSettings = await saveRuntimeSettings(runtimeSettings);
      saveDesktopSettings(nextDesktopSettings);
      setDesktopSettings(nextDesktopSettings);
      setRuntimeSettings(nextRuntimeSettings);
      window.dispatchEvent(new CustomEvent("scholarmind:runtime-settings-updated", { detail: nextRuntimeSettings }));
      setSshDraft(createSshDraft(nextRuntimeSettings));
      setSelectedPresetId(inferPresetId(nextRuntimeSettings));
      setConnectionInfo(await getConnectionInfo(nextDesktopSettings.apiBase));
      setSshStatus(await getSshStatus());
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

  const runSshTest = async () => {
    setTestingSsh(true);
    try {
      const result = await testSshConnection();
      const gpuText =
        typeof result.gpu === "string"
          ? result.gpu
          : result.gpu
            ? JSON.stringify(result.gpu)
            : "已连通";
      showToast(`SSH 测试成功: ${gpuText}`);
      setSshStatus(await getSshStatus());
    } catch (error) {
      showToast(error instanceof Error ? error.message : "SSH 测试失败");
    } finally {
      setTestingSsh(false);
    }
  };

  return (
    <EditorialPage
      eyebrow="配置"
      title="管理连接、运行时和工作空间设置"
      description="桌面端、移动端和后端共享同一套连接与运行时配置。"
      actions={
        <button className="button-primary" onClick={() => void saveAll()} type="button">
          <Save size={14} />
          {saving ? "保存中..." : "保存设置"}
        </button>
      }
    >
      <div className="stack">
        <div className="settings-nav">
          <button className={`settings-nav-item${tab === "connection" ? " active" : ""}`} onClick={() => setTab("connection")} type="button">
            <PlugZap size={14} />
            连接
          </button>
          <button className={`settings-nav-item${tab === "runtime" ? " active" : ""}`} onClick={() => setTab("runtime")} type="button">
            <Cpu size={14} />
            运行时
          </button>
          <button className={`settings-nav-item${tab === "local" ? " active" : ""}`} onClick={() => setTab("local")} type="button">
            <FolderCog size={14} />
            工作空间
          </button>
        </div>

        {tab === "connection" ? (
          <SectionBlock
            title="前端和移动端连接"
            description="桌面端可使用 /api 代理，手机必须使用实际后端地址。"
            action={<StatusBadge status={loadingConnection ? "in-progress" : "completed"} label={loadingConnection ? "解析中" : "就绪"} />}
          >
            <div className="settings-form">
              <label className="form-row">
                <span className="form-label">API 基础路径</span>
                <input className="toolbar-input" value={desktopSettings.apiBase} onChange={(event) => updateDesktop("apiBase", event.target.value)} placeholder="/api" type="text" />
              </label>
              <label className="form-row">
                <span className="form-label">WebSocket 基础路径</span>
                <input className="toolbar-input" value={desktopSettings.wsBase} onChange={(event) => updateDesktop("wsBase", event.target.value)} placeholder="留空则从 API 路径自动推导" type="text" />
              </label>
              <label className="form-row">
                <span className="form-label">后端访问令牌</span>
                <input className="toolbar-input" value={desktopSettings.backendAccessToken} onChange={(event) => updateDesktop("backendAccessToken", event.target.value)} placeholder="仅当后端需要认证时填写" type="password" />
              </label>
              <label className="form-row">
                <span className="form-label">公网 / 隧道基础 URL</span>
                <input className="toolbar-input" value={runtimeSettings.public_base_url} onChange={(event) => updateRuntime("public_base_url", event.target.value)} placeholder="https://your-public-domain-or-tunnel" type="text" />
              </label>

              <div className="connection-address-grid">
                <AddressCard icon={<Wifi size={15} />} title="局域网地址" subtitle="同一 Wi-Fi 下使用" addresses={connectionView.lanUrls} emptyText="未检测到局域网地址" onCopy={copyValue} />
                <AddressCard icon={<Globe2 size={15} />} title="公网地址" subtitle="互联网远程访问使用" addresses={connectionView.publicUrls} emptyText="未检测到公网或隧道地址" onCopy={copyValue} />
              </div>

              <div className="callout-note">推荐的移动端基础 URL: <code>{connectionView.recommendedMobileUrl || "暂不可用"}</code></div>
              <div className="callout-note">推荐的移动端 WebSocket URL: <code>{connectionView.recommendedMobileWsUrl || "暂不可用"}</code></div>
              <div className="callout-note">
                {desktopSettings.apiBase.trim().startsWith("/")
                  ? "桌面开发环境可使用相对路径 /api 代理，手机必须使用上面的绝对地址。"
                  : "桌面端当前使用的是绝对后端地址。"}
              </div>
              {connectionView.notes.length ? <div className="callout-note">{connectionView.notes.join(" ")}</div> : null}
            </div>
          </SectionBlock>
        ) : null}

        {tab === "runtime" ? (
          <SectionBlock
            title="后端运行时设置"
            description="这些值会写入 backend/.env，并用于 ScholarMind 管道运行。"
            action={<StatusBadge status={loadingRuntime ? "in-progress" : "completed"} label={loadingRuntime ? "加载中" : "环境就绪"} />}
          >
            <div className="settings-form">
              <label className="form-row">
                <span className="form-label">模型预设</span>
                <select className="toolbar-input" value={selectedPresetId} onChange={(event) => applyPreset(event.target.value)}>
                  {PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                  <option value={CUSTOM_PRESET}>自定义</option>
                </select>
              </label>
              <label className="form-row">
                <span className="form-label">提供商</span>
                <input className="toolbar-input" value={runtimeSettings.llm_provider} onChange={(event) => updateRuntime("llm_provider", event.target.value)} type="text" />
              </label>
              <label className="form-row">
                <span className="form-label">模型</span>
                <input className="toolbar-input" value={runtimeSettings.model} onChange={(event) => updateRuntime("model", event.target.value)} type="text" />
              </label>
              <label className="form-row">
                <span className="form-label">提供商基础 URL</span>
                <input className="toolbar-input" value={runtimeSettings.provider_base_url} onChange={(event) => updateRuntime("provider_base_url", event.target.value)} type="text" />
              </label>
              <label className="form-row">
                <span className="form-label">提供商 API 密钥</span>
                <input className="toolbar-input" value={runtimeSettings.api_key} onChange={(event) => updateRuntime("api_key", event.target.value)} type="password" />
              </label>
              <label className="form-row">
                <span className="form-label">搜索提供商</span>
                <input className="toolbar-input" value={runtimeSettings.search_provider} onChange={(event) => updateRuntime("search_provider", event.target.value)} type="text" />
              </label>
              <label className="form-row">
                <span className="form-label">搜索 API 密钥</span>
                <input className="toolbar-input" value={runtimeSettings.search_api_key} onChange={(event) => updateRuntime("search_api_key", event.target.value)} type="password" />
              </label>
              <label className="form-row">
                <span className="form-label">本地引擎</span>
                <input className="toolbar-input" value={runtimeSettings.local_engine} onChange={(event) => updateRuntime("local_engine", event.target.value)} type="text" />
              </label>
              <label className="form-row">
                <span className="form-label">本地服务器 URL</span>
                <input className="toolbar-input" value={runtimeSettings.local_server_url} onChange={(event) => updateRuntime("local_server_url", event.target.value)} type="text" />
              </label>
              <label className="form-row">
                <span className="form-label">本地模型路径</span>
                <input className="toolbar-input" value={runtimeSettings.local_model_path} onChange={(event) => updateRuntime("local_model_path", event.target.value)} type="text" />
              </label>
              <label className="form-row">
                <span className="form-label">本地模型别名</span>
                <input className="toolbar-input" value={runtimeSettings.local_model_alias} onChange={(event) => updateRuntime("local_model_alias", event.target.value)} type="text" />
              </label>

              <div className="field-grid">
                <label className="form-row">
                  <span className="form-label">上下文大小</span>
                  <input className="toolbar-input" value={runtimeSettings.local_context_size} onChange={(event) => updateRuntime("local_context_size", Number(event.target.value) || 512)} type="number" />
                </label>
                <label className="form-row">
                  <span className="form-label">GPU 层数</span>
                  <input className="toolbar-input" value={runtimeSettings.local_gpu_layers} onChange={(event) => updateRuntime("local_gpu_layers", Math.max(0, Number(event.target.value) || 0))} type="number" />
                </label>
              </div>

              <div className="settings-switch-grid">
                <SettingsSwitchCard
                  action={
                    <button className="button-ghost settings-inline-action" onClick={() => openSshDialog()} type="button">
                      配置
                    </button>
                  }
                  checked={runtimeSettings.ssh_enabled}
                  description="允许 M6 使用已配置的 SSH 远程 GPU。打开时会弹出圆角配置框填写 Host、User 和远程目录。"
                  onToggle={handleSshToggle}
                  title="SSH 实验执行"
                />
                <SettingsSwitchCard
                  checked={runtimeSettings.llm_simulation_enabled}
                  description="控制 M6 是否在本地真实实验后追加 run_sim 模拟结果。"
                  onToggle={(next) => updateRuntime("llm_simulation_enabled", next)}
                  title="LLM 模拟数据"
                />
              </div>

              <div className="ssh-status-row">
                <div className="callout-note ssh-status-note">
                  {loadingSsh
                    ? "正在检测 SSH 状态..."
                    : sshStatus?.enabled
                      ? `SSH 已启用：${sshStatus.user ?? "user"}@${sshStatus.host ?? "host"}${sshStatus.port ? `:${sshStatus.port}` : ""}`
                      : sshStatus?.configured
                        ? "SSH 已配置，但当前被设置开关禁用。"
                        : "SSH 未配置：需要后端 .env 中至少提供 SSH_HOST 和 SSH_USER。"}
                  {sshStatus?.work_dir ? ` 工作目录：${sshStatus.work_dir}` : ""}
                </div>
                <button
                  className="button-secondary"
                  disabled={testingSsh || loadingSsh || !runtimeSettings.ssh_enabled || !hasSshConnectionSettings(runtimeSettings)}
                  onClick={() => void runSshTest()}
                  type="button"
                >
                  <Wifi size={14} />
                  {testingSsh ? "测试中..." : "测试 SSH"}
                </button>
              </div>

              <div className="callout-note">本地模型别名提示: <code>{inferLocalAlias(runtimeSettings.local_model_path, runtimeSettings.local_model_alias, runtimeSettings.model)}</code></div>
              <div className="callout-note">环境文件: {runtimeSettings.env_path}</div>
            </div>
          </SectionBlock>
        ) : null}

        {tab === "local" ? (
          <SectionBlock
            title="工作空间默认设置"
            description="这些偏好会影响新任务和本地工作目录。"
            action={<StatusBadge status="completed" label="工作空间设置" />}
          >
            <div className="stack">
              <div className="field-grid">
                <label className="form-row">
                  <span className="form-label">工作目录</span>
                  <input className="toolbar-input" value={desktopSettings.workingDirectoryPath} onChange={(event) => updateDesktop("workingDirectoryPath", event.target.value)} type="text" />
                </label>
                <label className="form-row">
                  <span className="form-label">目录标签</span>
                  <input className="toolbar-input" value={desktopSettings.workingDirectoryLabel} onChange={(event) => updateDesktop("workingDirectoryLabel", event.target.value)} type="text" />
                </label>
              </div>
              <label className="form-row">
                <span className="form-label">任务描述模板</span>
                <textarea className="text-area" value={desktopSettings.taskDescriptionTemplate} onChange={(event) => updateDesktop("taskDescriptionTemplate", event.target.value)} />
              </label>
              <div className="field-grid">
                <label className="form-row">
                  <span className="form-label">最大想法数</span>
                  <input className="toolbar-input" value={desktopSettings.taskConfig.maxIdeas} onChange={(event) => updateTaskConfig("maxIdeas", Number(event.target.value) || 1)} type="number" />
                </label>
                <label className="form-row">
                  <span className="form-label">反思次数</span>
                  <input className="toolbar-input" value={desktopSettings.taskConfig.numReflections} onChange={(event) => updateTaskConfig("numReflections", Number(event.target.value) || 1)} type="number" />
                </label>
                <label className="form-row">
                  <span className="form-label">最大重试次数</span>
                  <input className="toolbar-input" value={desktopSettings.taskConfig.maxRetries} onChange={(event) => updateTaskConfig("maxRetries", Number(event.target.value) || 0)} type="number" />
                </label>
              </div>
            </div>
          </SectionBlock>
        ) : null}

        {sshDialogOpen ? (
          <div className="settings-modal-backdrop" onClick={() => closeSshDialog()} role="presentation">
            <div
              aria-labelledby="ssh-config-title"
              aria-modal="true"
              className="settings-modal-shell"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="section-header">
                <div>
                  <h2 className="section-title" id="ssh-config-title">SSH 连接配置</h2>
                  <div className="section-copy">打开 SSH 开关前，先填写远程主机信息。最少需要 Host 和 User。</div>
                </div>
              </div>
              <div className="settings-form">
                <div className="field-grid">
                  <label className="form-row">
                    <span className="form-label">Host</span>
                    <input autoFocus className="toolbar-input" onChange={(event) => updateSshDraft("ssh_host", event.target.value)} placeholder="gpu.example.com" type="text" value={sshDraft.ssh_host} />
                  </label>
                  <label className="form-row">
                    <span className="form-label">Port</span>
                    <input className="toolbar-input" onChange={(event) => updateSshDraft("ssh_port", Math.max(1, Number(event.target.value) || 22))} type="number" value={sshDraft.ssh_port} />
                  </label>
                </div>
                <div className="field-grid">
                  <label className="form-row">
                    <span className="form-label">User</span>
                    <input className="toolbar-input" onChange={(event) => updateSshDraft("ssh_user", event.target.value)} placeholder="ubuntu" type="text" value={sshDraft.ssh_user} />
                  </label>
                  <label className="form-row">
                    <span className="form-label">Key Path</span>
                    <input className="toolbar-input" onChange={(event) => updateSshDraft("ssh_key_path", event.target.value)} placeholder="C:\\Users\\you\\.ssh\\id_rsa" type="text" value={sshDraft.ssh_key_path} />
                  </label>
                </div>
                <label className="form-row">
                  <span className="form-label">Password</span>
                  <input className="toolbar-input" onChange={(event) => updateSshDraft("ssh_password", event.target.value)} placeholder="可选，使用密码登录时填写" type="password" value={sshDraft.ssh_password} />
                </label>
                <div className="field-grid">
                  <label className="form-row">
                    <span className="form-label">Remote Work Dir</span>
                    <input className="toolbar-input" onChange={(event) => updateSshDraft("ssh_work_dir", event.target.value)} placeholder="/tmp/scholarmind" type="text" value={sshDraft.ssh_work_dir} />
                  </label>
                  <label className="form-row">
                    <span className="form-label">Conda Env</span>
                    <input className="toolbar-input" onChange={(event) => updateSshDraft("ssh_conda_env", event.target.value)} placeholder="可选，例如 research" type="text" value={sshDraft.ssh_conda_env} />
                  </label>
                </div>
                <div className="callout-note">这些配置会在保存设置后写入 backend/.env，并供 M6 的 SSH 实验执行器使用。</div>
                <div className="settings-modal-actions">
                  <button className="button-ghost" onClick={() => closeSshDialog()} type="button">取消</button>
                  <button className="button-primary" onClick={() => applySshDialog()} type="button">启用 SSH</button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </EditorialPage>
  );
}
