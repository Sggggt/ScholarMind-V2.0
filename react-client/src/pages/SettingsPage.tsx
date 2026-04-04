import { Cpu, FolderCog, PlugZap, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EditorialPage, SectionBlock, StatusBadge } from '../components/ui/Primitives';
import { getRuntimeSettings, saveRuntimeSettings } from '../services/api';
import {
  getDesktopSettings,
  saveDesktopSettings,
  sanitizeDesktopSettings,
  type DesktopSettings,
} from '../services/preferences';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type { BackendRuntimeSettingsResponse } from '../types/backend';

const localGgufProvider = 'local-gguf';
const customModelPresetId = 'custom';

const defaultRuntimeSettings: BackendRuntimeSettingsResponse = {
  llm_provider: 'openai',
  api_key: '',
  model: 'gpt-4o',
  provider_base_url: 'https://api.openai.com/v1',
  search_provider: 'brave',
  search_api_key: '',
  local_engine: 'lm-studio',
  local_server_url: 'http://127.0.0.1:1234/v1',
  local_model_path: '',
  local_model_alias: 'local-gguf',
  local_context_size: 4096,
  local_gpu_layers: 0,
  env_path: 'backend/.env',
};

const searchEngines = [
  { id: 'duckduckgo', label: 'DuckDuckGo', keyLabel: '无需 API Key', needsKey: false },
  { id: 'brave', label: 'Brave Search', keyLabel: 'Brave API Key', needsKey: true, url: 'https://search.brave.com/search-api' },
  { id: 'tavily', label: 'Tavily', keyLabel: 'Tavily API Key', needsKey: true, url: 'https://tavily.com' },
  { id: 'serper', label: 'Serper', keyLabel: 'Serper API Key', needsKey: true, url: 'https://serper.dev' },
];

type ModelPreset = {
  id: string;
  label: string;
  provider: string;
  model: string;
  baseUrl: string;
  note: string;
};

const modelPresets: ModelPreset[] = [
  {
    id: 'openai-gpt-4o',
    label: 'OpenAI · GPT-4o',
    provider: 'openai',
    model: 'gpt-4o',
    baseUrl: 'https://api.openai.com/v1',
    note: '通用主力模型',
  },
  {
    id: 'openai-gpt-4.1',
    label: 'OpenAI · GPT-4.1',
    provider: 'openai',
    model: 'gpt-4.1',
    baseUrl: 'https://api.openai.com/v1',
    note: '更偏代码和长上下文',
  },
  {
    id: 'openai-gpt-4.1-mini',
    label: 'OpenAI · GPT-4.1 mini',
    provider: 'openai',
    model: 'gpt-4.1-mini',
    baseUrl: 'https://api.openai.com/v1',
    note: '更快更省',
  },
  {
    id: 'deepseek-chat',
    label: 'DeepSeek · deepseek-chat',
    provider: 'openai',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
    note: 'DeepSeek 通用对话模型',
  },
  {
    id: 'deepseek-reasoner',
    label: 'DeepSeek · deepseek-reasoner',
    provider: 'openai',
    model: 'deepseek-reasoner',
    baseUrl: 'https://api.deepseek.com/v1',
    note: 'DeepSeek 推理模型',
  },
  {
    id: 'local-gguf',
    label: '本地模型 · LM Studio',
    provider: localGgufProvider,
    model: 'local-gguf',
    baseUrl: 'http://127.0.0.1:1234/v1',
    note: '对接 LM Studio 暴露的本地 OpenAI 兼容服务',
  },
];

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeRuntimeSettings(
  settings?: Partial<BackendRuntimeSettingsResponse> | null,
): BackendRuntimeSettingsResponse {
  const next = settings ?? {};

  return {
    ...defaultRuntimeSettings,
    ...next,
    llm_provider: asString(next.llm_provider, defaultRuntimeSettings.llm_provider),
    api_key: asString(next.api_key, defaultRuntimeSettings.api_key),
    model: asString(next.model, defaultRuntimeSettings.model),
    provider_base_url: asString(next.provider_base_url, defaultRuntimeSettings.provider_base_url),
    search_provider: asString(next.search_provider, defaultRuntimeSettings.search_provider),
    search_api_key: asString(next.search_api_key, defaultRuntimeSettings.search_api_key),
    local_engine: asString(next.local_engine, defaultRuntimeSettings.local_engine),
    local_server_url: asString(next.local_server_url, defaultRuntimeSettings.local_server_url),
    local_model_path: asString(next.local_model_path, defaultRuntimeSettings.local_model_path),
    local_model_alias: asString(next.local_model_alias, defaultRuntimeSettings.local_model_alias),
    local_context_size: asNumber(next.local_context_size, defaultRuntimeSettings.local_context_size),
    local_gpu_layers: asNumber(next.local_gpu_layers, defaultRuntimeSettings.local_gpu_layers),
    env_path: asString(next.env_path, defaultRuntimeSettings.env_path),
  };
}

function inferLocalModelAlias(path: string | undefined, alias: string | undefined, fallback = 'local-gguf') {
  const normalizedAlias = asString(alias).trim();
  if (normalizedAlias) {
    return normalizedAlias;
  }

  const normalizedPath = asString(path).trim();
  if (!normalizedPath) {
    return fallback;
  }

  const segments = normalizedPath.split(/[/\\]/);
  const filename = segments[segments.length - 1] ?? '';
  const stem = filename.replace(/\.gguf$/i, '').trim();
  return stem || fallback;
}

function inferPresetId(settings: BackendRuntimeSettingsResponse) {
  if (settings.llm_provider === localGgufProvider) {
    return 'local-gguf';
  }

  const matched = modelPresets.find(
    (preset) =>
      preset.provider !== localGgufProvider &&
      preset.model === settings.model &&
      preset.baseUrl === settings.provider_base_url &&
      preset.provider === settings.llm_provider,
  );

  return matched?.id ?? customModelPresetId;
}

function buildLocalEngineHint(settings: BackendRuntimeSettingsResponse) {
  if (settings.local_engine === 'lm-studio') {
    return '在 LM Studio 中加载模型后，打开 Developer -> Local Server，然后启动 OpenAI-compatible API server。';
  }

  const modelPath = asString(settings.local_model_path).trim();
  if (!modelPath) {
    return 'llama-server -m "<your-model>.gguf" --host 127.0.0.1 --port 8080';
  }

  const gpuLayers = Math.max(0, asNumber(settings.local_gpu_layers, 0));
  const ctxSize = Math.max(512, asNumber(settings.local_context_size, 4096));

  return `llama-server -m "${modelPath}" --ctx-size ${ctxSize} --gpu-layers ${gpuLayers} --host 127.0.0.1 --port 8080`;
}

export default function SettingsPage() {
  const showToast = useWorkspaceStore((state) => state.showToast);
  const [activeTab, setActiveTab] = useState<'connection' | 'runtime' | 'local'>('connection');
  const [desktopSettings, setDesktopSettings] = useState<DesktopSettings>(() => getDesktopSettings());
  const [runtimeSettings, setRuntimeSettings] =
    useState<BackendRuntimeSettingsResponse>(defaultRuntimeSettings);
  const [selectedModelPresetId, setSelectedModelPresetId] = useState(() =>
    inferPresetId(defaultRuntimeSettings),
  );
  const [isLoadingRuntimeSettings, setIsLoadingRuntimeSettings] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const isLocalProvider = runtimeSettings.llm_provider === localGgufProvider;

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        const nextRuntimeSettings = await getRuntimeSettings();
        if (!cancelled) {
          const normalizedSettings = normalizeRuntimeSettings(nextRuntimeSettings);
          setRuntimeSettings(normalizedSettings);
          setSelectedModelPresetId(inferPresetId(normalizedSettings));
        }
      } catch (error) {
        if (!cancelled) {
          showToast(error instanceof Error ? error.message : '读取后端运行时配置失败');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingRuntimeSettings(false);
        }
      }
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const updateDesktopSettings = <K extends keyof DesktopSettings>(key: K, value: DesktopSettings[K]) => {
    setDesktopSettings((current) => ({ ...current, [key]: value }));
  };

  const updateTaskConfig = <K extends keyof DesktopSettings['taskConfig']>(
    key: K,
    value: DesktopSettings['taskConfig'][K],
  ) => {
    setDesktopSettings((current) => ({
      ...current,
      taskConfig: { ...current.taskConfig, [key]: value },
    }));
  };

  const updateRuntimeSettings = <K extends keyof BackendRuntimeSettingsResponse>(
    key: K,
    value: BackendRuntimeSettingsResponse[K],
  ) => {
    setRuntimeSettings((current) => {
      const nextSettings = { ...current, [key]: value };

      if (key === 'local_model_path' || key === 'local_model_alias') {
        const nextAlias = inferLocalModelAlias(
          key === 'local_model_path' ? String(value) : nextSettings.local_model_path,
          key === 'local_model_alias' ? String(value) : nextSettings.local_model_alias,
          nextSettings.model,
        );
        nextSettings.local_model_alias = nextAlias;
        if (nextSettings.llm_provider === localGgufProvider) {
          nextSettings.model = nextAlias;
        }
      }

      if (key === 'local_server_url' && nextSettings.llm_provider === localGgufProvider) {
        nextSettings.provider_base_url = String(value);
      }

      if (key === 'provider_base_url' && nextSettings.llm_provider === localGgufProvider) {
        nextSettings.local_server_url = String(value);
      }

      if (key === 'model' && nextSettings.llm_provider === localGgufProvider) {
        nextSettings.local_model_alias = String(value).trim() || nextSettings.local_model_alias;
      }

      if (key === 'llm_provider' && value === localGgufProvider) {
        const nextAlias = inferLocalModelAlias(
          nextSettings.local_model_path,
          nextSettings.local_model_alias,
          nextSettings.model,
        );
        nextSettings.local_model_alias = nextAlias;
        nextSettings.model = nextAlias;
        nextSettings.provider_base_url = nextSettings.local_server_url || defaultRuntimeSettings.local_server_url;
        nextSettings.api_key = nextSettings.api_key.trim() || 'not-needed';
      }

      setSelectedModelPresetId(inferPresetId(nextSettings));
      return nextSettings;
    });
  };

  const applyModelPreset = (presetId: string) => {
    setSelectedModelPresetId(presetId);

    if (presetId === customModelPresetId) {
      return;
    }

    const preset = modelPresets.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }

    setRuntimeSettings((current) => {
      if (preset.provider === localGgufProvider) {
        const localAlias = inferLocalModelAlias(
          current.local_model_path,
          current.local_model_alias,
          preset.model,
        );

        return {
          ...current,
          llm_provider: localGgufProvider,
          api_key: current.api_key.trim() || 'not-needed',
          model: localAlias,
          provider_base_url: current.local_server_url || preset.baseUrl,
          local_server_url: current.local_server_url || preset.baseUrl,
          local_model_alias: localAlias,
          local_engine: current.local_engine || 'lm-studio',
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

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const nextDesktopSettings = sanitizeDesktopSettings(desktopSettings);
      const savedRuntimeSettings = await saveRuntimeSettings({
        llm_provider: runtimeSettings.llm_provider,
        api_key: runtimeSettings.api_key,
        model: runtimeSettings.model,
        provider_base_url: runtimeSettings.provider_base_url,
        search_provider: runtimeSettings.search_provider,
        search_api_key: runtimeSettings.search_api_key,
        local_engine: runtimeSettings.local_engine,
        local_server_url: runtimeSettings.local_server_url,
        local_model_path: runtimeSettings.local_model_path,
        local_model_alias: runtimeSettings.local_model_alias,
        local_context_size: runtimeSettings.local_context_size,
        local_gpu_layers: runtimeSettings.local_gpu_layers,
      });
      const nextRuntimeSettings = normalizeRuntimeSettings(savedRuntimeSettings);

      saveDesktopSettings(nextDesktopSettings);
      setDesktopSettings(nextDesktopSettings);
      setRuntimeSettings(nextRuntimeSettings);
      setSelectedModelPresetId(inferPresetId(nextRuntimeSettings));
      showToast(`设置已保存，并写入 ${nextRuntimeSettings.env_path}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存设置失败');
    } finally {
      setIsSaving(false);
    }
  };

  const currentSearchEngine =
    searchEngines.find((engine) => engine.id === runtimeSettings.search_provider) ?? searchEngines[0];

  return (
    <EditorialPage
      eyebrow="Configuration"
      title="统一管理连接、模型与本地工作上下文"
      description="前端连接配置保存在浏览器本地，模型与搜索配置写入后端 `.env`。本页现已支持通过 LM Studio 调用本地模型。"
      actions={
        <button className="button-primary" onClick={() => void handleSave()} type="button" disabled={isSaving}>
          <Save size={14} />
          {isSaving ? '保存中...' : '保存设置'}
        </button>
      }
    >
      <div className="stack">
        <div className="settings-nav">
          <button
            className={`settings-nav-item${activeTab === 'connection' ? ' active' : ''}`}
            onClick={() => setActiveTab('connection')}
            type="button"
          >
            <PlugZap size={14} />
            连接参数
          </button>
          <button
            className={`settings-nav-item${activeTab === 'runtime' ? ' active' : ''}`}
            onClick={() => setActiveTab('runtime')}
            type="button"
          >
            <Cpu size={14} />
            运行时
          </button>
          <button
            className={`settings-nav-item${activeTab === 'local' ? ' active' : ''}`}
            onClick={() => setActiveTab('local')}
            type="button"
          >
            <FolderCog size={14} />
            本地偏好
          </button>
        </div>

        {activeTab === 'connection' ? (
          <SectionBlock
            title="前端到后端的连接配置"
            description="这些参数决定 React 前端如何访问 API、WebSocket 和授权头。"
            action={<StatusBadge status="completed" label="Browser Local" />}
          >
            <div className="settings-form">
              <label className="form-row">
                <span className="form-label">API Base</span>
                <input
                  className="toolbar-input"
                  value={desktopSettings.apiBase}
                  onChange={(event) => updateDesktopSettings('apiBase', event.target.value)}
                  placeholder="/api"
                  type="text"
                />
              </label>
              <label className="form-row">
                <span className="form-label">WebSocket Base</span>
                <input
                  className="toolbar-input"
                  value={desktopSettings.wsBase}
                  onChange={(event) => updateDesktopSettings('wsBase', event.target.value)}
                  placeholder="留空时自动推导"
                  type="text"
                />
              </label>
              <label className="form-row">
                <span className="form-label">Backend Access Token</span>
                <input
                  className="toolbar-input"
                  value={desktopSettings.backendAccessToken}
                  onChange={(event) => updateDesktopSettings('backendAccessToken', event.target.value)}
                  placeholder="仅当后端要求 Authorization 时填写"
                  type="password"
                />
              </label>
            </div>
          </SectionBlock>
        ) : null}

        {activeTab === 'runtime' ? (
          <SectionBlock
            title="后端运行时配置"
            description="这里维护任务真正会使用的模型、搜索和本地推理参数。保存后会直接写入后端 `.env`。"
            action={
              <StatusBadge
                status={isLoadingRuntimeSettings ? 'in-progress' : 'completed'}
                label={isLoadingRuntimeSettings ? '加载中' : 'Env Ready'}
              />
            }
          >
            <div className="settings-form">
              <label className="form-row">
                <span className="form-label">模型预设</span>
                <select
                  className="toolbar-input"
                  value={selectedModelPresetId}
                  onChange={(event) => applyModelPreset(event.target.value)}
                >
                  {modelPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                  <option value={customModelPresetId}>自定义模型</option>
                </select>
              </label>

              {isLocalProvider ? (
                <>
                  <label className="form-row">
                    <span className="form-label">本地引擎</span>
                    <select
                      className="toolbar-input"
                      value={runtimeSettings.local_engine}
                      onChange={(event) => updateRuntimeSettings('local_engine', event.target.value)}
                    >
                      <option value="lm-studio">LM Studio</option>
                      <option value="llama.cpp">llama.cpp</option>
                    </select>
                  </label>
                  {runtimeSettings.local_engine === 'llama.cpp' ? (
                    <label className="form-row">
                      <span className="form-label">GGUF 文件路径</span>
                      <input
                        className="toolbar-input"
                        value={runtimeSettings.local_model_path}
                        onChange={(event) => updateRuntimeSettings('local_model_path', event.target.value)}
                        placeholder="D:\\Models\\Qwen2.5-7B-Instruct-Q4_K_M.gguf"
                        type="text"
                      />
                    </label>
                  ) : null}
                  <label className="form-row">
                    <span className="form-label">模型别名</span>
                    <input
                      className="toolbar-input"
                      value={runtimeSettings.local_model_alias}
                      onChange={(event) => updateRuntimeSettings('local_model_alias', event.target.value)}
                      placeholder="qwen2.5-7b-instruct"
                      type="text"
                    />
                  </label>
                  <label className="form-row">
                    <span className="form-label">本地服务地址</span>
                    <input
                      className="toolbar-input"
                      value={runtimeSettings.local_server_url}
                      onChange={(event) => updateRuntimeSettings('local_server_url', event.target.value)}
                      placeholder="http://127.0.0.1:1234/v1"
                      type="text"
                    />
                  </label>
                  <label className="form-row">
                    <span className="form-label">请求模型名</span>
                    <input
                      className="toolbar-input"
                      value={runtimeSettings.model}
                      onChange={(event) => updateRuntimeSettings('model', event.target.value)}
                      placeholder="通常与模型别名一致"
                      type="text"
                    />
                  </label>
                  {runtimeSettings.local_engine === 'llama.cpp' ? (
                    <div className="field-grid">
                      <label className="form-row">
                        <span className="form-label">上下文长度</span>
                        <input
                          className="toolbar-input"
                          value={runtimeSettings.local_context_size}
                          onChange={(event) =>
                            updateRuntimeSettings('local_context_size', Number(event.target.value) || 512)
                          }
                          min={512}
                          step={256}
                          type="number"
                        />
                      </label>
                      <label className="form-row">
                        <span className="form-label">GPU Layers</span>
                        <input
                          className="toolbar-input"
                          value={runtimeSettings.local_gpu_layers}
                          onChange={(event) =>
                            updateRuntimeSettings('local_gpu_layers', Math.max(0, Number(event.target.value) || 0))
                          }
                          min={0}
                          type="number"
                        />
                      </label>
                    </div>
                  ) : null}
                  <label className="form-row">
                    <span className="form-label">本地服务 API Key</span>
                    <input
                      className="toolbar-input"
                      value={runtimeSettings.api_key}
                      onChange={(event) => updateRuntimeSettings('api_key', event.target.value)}
                      placeholder="可留空，默认保存为 not-needed"
                      type="password"
                    />
                  </label>
                  <div className="callout-note">
                    ScholarMind 不直接加载模型文件，而是通过本地 OpenAI 兼容接口访问已启动的本地模型服务。
                    如果你用 LM Studio，只需要在 LM Studio 里加载模型并启动本地服务。
                  </div>
                  <div className="callout-note">
                    使用提示：
                    <br />
                    <code>{buildLocalEngineHint(runtimeSettings)}</code>
                  </div>
                </>
              ) : (
                <>
                  <label className="form-row">
                    <span className="form-label">Provider API Key</span>
                    <input
                      className="toolbar-input"
                      value={runtimeSettings.api_key}
                      onChange={(event) => updateRuntimeSettings('api_key', event.target.value)}
                      placeholder="sk-... / glm-... / provider-key"
                      type="password"
                    />
                  </label>
                  <label className="form-row">
                    <span className="form-label">Model</span>
                    <input
                      className="toolbar-input"
                      value={runtimeSettings.model}
                      onChange={(event) => updateRuntimeSettings('model', event.target.value)}
                      placeholder="例如 gpt-4.1 / glm-5 / claude-sonnet-4"
                      type="text"
                    />
                  </label>
                  <label className="form-row">
                    <span className="form-label">LLM Provider</span>
                    <input
                      className="toolbar-input"
                      value={runtimeSettings.llm_provider}
                      onChange={(event) => updateRuntimeSettings('llm_provider', event.target.value)}
                      placeholder="openai / anthropic / azure-openai / local-gguf"
                      type="text"
                    />
                  </label>
                  <label className="form-row">
                    <span className="form-label">Provider Base URL</span>
                    <input
                      className="toolbar-input"
                      value={runtimeSettings.provider_base_url}
                      onChange={(event) => updateRuntimeSettings('provider_base_url', event.target.value)}
                      placeholder="https://api.openai.com/v1"
                      type="text"
                    />
                  </label>
                </>
              )}

              <label className="form-row">
                <span className="form-label">搜索引擎</span>
                <select
                  className="toolbar-input"
                  value={runtimeSettings.search_provider}
                  onChange={(event) => {
                    updateRuntimeSettings('search_provider', event.target.value);
                    updateRuntimeSettings('search_api_key', '');
                  }}
                >
                  {searchEngines.map((engine) => (
                    <option key={engine.id} value={engine.id}>
                      {engine.label}
                    </option>
                  ))}
                </select>
              </label>

              {currentSearchEngine.needsKey ? (
                <>
                  <label className="form-row">
                    <span className="form-label">{currentSearchEngine.keyLabel}</span>
                    <input
                      className="toolbar-input"
                      value={runtimeSettings.search_api_key}
                      onChange={(event) => updateRuntimeSettings('search_api_key', event.target.value)}
                      placeholder={`输入 ${currentSearchEngine.label} API Key`}
                      type="password"
                    />
                  </label>
                  <div className="callout-note">
                    获取 API Key：
                    {' '}
                    <a href={currentSearchEngine.url} target="_blank" rel="noopener noreferrer">
                      {currentSearchEngine.url}
                    </a>
                  </div>
                </>
              ) : (
                <div className="callout-note">{currentSearchEngine.label} 不需要 API Key，可直接使用。</div>
              )}

              {selectedModelPresetId !== customModelPresetId ? (
                <div className="callout-note">
                  已根据预设自动填充核心参数。
                  {(() => {
                    const preset = modelPresets.find((item) => item.id === selectedModelPresetId);
                    return preset ? ` 当前预设：${preset.label}，${preset.note}。` : '';
                  })()}
                  如需接入私有兼容网关，请切换到“自定义模型”后手动填写。
                </div>
              ) : null}

              <div className="callout-note">
                {isLoadingRuntimeSettings ? '正在读取后端运行时配置...' : `环境文件路径：${runtimeSettings.env_path}`}
              </div>
            </div>
          </SectionBlock>
        ) : null}

        {activeTab === 'local' ? (
          <SectionBlock
            title="任务默认参数与本地工作区"
            description="这里维护工作目录、任务描述模板，以及提交到后端时的默认编排参数。"
            action={<StatusBadge status="completed" label="Workspace Defaults" />}
          >
            <div className="stack">
              <div className="field-grid">
                <label className="form-row">
                  <span className="form-label">默认工作目录</span>
                  <input
                    className="toolbar-input"
                    value={desktopSettings.workingDirectoryPath}
                    onChange={(event) => updateDesktopSettings('workingDirectoryPath', event.target.value)}
                    placeholder="C:\\Study\\HY Competition\\Project\\ScholarMind"
                    type="text"
                  />
                </label>
                <label className="form-row">
                  <span className="form-label">目录标签</span>
                  <input
                    className="toolbar-input"
                    value={desktopSettings.workingDirectoryLabel}
                    onChange={(event) => updateDesktopSettings('workingDirectoryLabel', event.target.value)}
                    placeholder="ScholarMind Workspace"
                    type="text"
                  />
                </label>
              </div>

              <label className="form-row">
                <span className="form-label">任务描述模板</span>
                <textarea
                  className="text-area"
                  value={desktopSettings.taskDescriptionTemplate}
                  onChange={(event) => updateDesktopSettings('taskDescriptionTemplate', event.target.value)}
                />
              </label>

              <div className="field-grid">
                <label className="form-row">
                  <span className="form-label">最多生成想法数</span>
                  <input
                    className="toolbar-input"
                    value={desktopSettings.taskConfig.maxIdeas}
                    onChange={(event) => updateTaskConfig('maxIdeas', Number(event.target.value) || 1)}
                    type="number"
                  />
                </label>
                <label className="form-row">
                  <span className="form-label">反思轮数</span>
                  <input
                    className="toolbar-input"
                    value={desktopSettings.taskConfig.numReflections}
                    onChange={(event) => updateTaskConfig('numReflections', Number(event.target.value) || 1)}
                    type="number"
                  />
                </label>
                <label className="form-row">
                  <span className="form-label">最大重试次数</span>
                  <input
                    className="toolbar-input"
                    value={desktopSettings.taskConfig.maxRetries}
                    onChange={(event) => updateTaskConfig('maxRetries', Number(event.target.value) || 0)}
                    type="number"
                  />
                </label>
              </div>
            </div>
          </SectionBlock>
        ) : null}
      </div>
    </EditorialPage>
  );
}
