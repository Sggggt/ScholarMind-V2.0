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

const defaultRuntimeSettings: BackendRuntimeSettingsResponse = {
  llm_provider: 'openai',
  api_key: '',
  model: 'gpt-4o',
  provider_base_url: 'https://api.openai.com/v1',
  search_provider: 'brave',
  env_path: 'backend/.env',
};

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
    note: '更偏代码与长上下文',
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
];

const customModelPresetId = 'custom';

function inferPresetId(settings: BackendRuntimeSettingsResponse) {
  const matched = modelPresets.find(
    (preset) =>
      preset.model === settings.model &&
      preset.baseUrl === settings.provider_base_url &&
      preset.provider === settings.llm_provider,
  );

  return matched?.id ?? customModelPresetId;
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

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        const nextRuntimeSettings = await getRuntimeSettings();
        if (!cancelled) {
          setRuntimeSettings(nextRuntimeSettings);
          setSelectedModelPresetId(inferPresetId(nextRuntimeSettings));
        }
      } catch (error) {
        if (!cancelled) {
          showToast(error instanceof Error ? error.message : '读取后端运行配置失败');
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

    setRuntimeSettings((current) => ({
      ...current,
      llm_provider: preset.provider,
      model: preset.model,
      provider_base_url: preset.baseUrl,
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const nextDesktopSettings = sanitizeDesktopSettings(desktopSettings);
      const nextRuntimeSettings = await saveRuntimeSettings({
        llm_provider: runtimeSettings.llm_provider,
        api_key: runtimeSettings.api_key,
        model: runtimeSettings.model,
        provider_base_url: runtimeSettings.provider_base_url,
        search_provider: runtimeSettings.search_provider,
      });

      saveDesktopSettings(nextDesktopSettings);
      setDesktopSettings(nextDesktopSettings);
      setRuntimeSettings(nextRuntimeSettings);
      showToast(`设置已保存，并写入 ${nextRuntimeSettings.env_path}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存设置失败');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <EditorialPage
      eyebrow="Configuration"
      title="统一管理连接、模型与本地工作上下文"
      description="前端连接配置保存在浏览器本地，模型与搜索提供商配置写入后端 `.env`，任务级默认参数也在这里维护。"
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
            title="前端到后端的连接层"
            description="这些参数决定 React 前端如何访问 API、WebSocket 和鉴权头。"
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
                  placeholder="仅在后端接口要求 Authorization 时填写"
                  type="password"
                />
              </label>
            </div>
          </SectionBlock>
        ) : null}

        {activeTab === 'runtime' ? (
          <SectionBlock
            title="后端运行时配置"
            description="这些字段会直接保存到后端环境配置中，影响后续创建的真实任务。"
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
              <label className="form-row">
                <span className="form-label">Provider API Key</span>
                <input
                  className="toolbar-input"
                  value={runtimeSettings.api_key}
                  onChange={(event) => updateRuntimeSettings('api_key', event.target.value)}
                  placeholder="sk-... / glm-... / any-provider-key"
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
                  placeholder="openai / anthropic / azure-openai / ollama"
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
              <label className="form-row">
                <span className="form-label">Search Provider</span>
                <input
                  className="toolbar-input"
                  value={runtimeSettings.search_provider}
                  onChange={(event) => updateRuntimeSettings('search_provider', event.target.value)}
                  placeholder="brave / tavily / serper / duckduckgo"
                  type="text"
                />
              </label>
              {selectedModelPresetId !== customModelPresetId ? (
                <div className="callout-note">
                  已根据所选模型自动填充 `base_url`
                  {(() => {
                    const preset = modelPresets.find((item) => item.id === selectedModelPresetId);
                    return preset ? `，当前预设：${preset.label} · ${preset.note}` : '';
                  })()}
                  。如需接入豆包、智谱或私有兼容网关，请切换到“自定义模型”后手动填写。
                </div>
              ) : null}
              <div className="callout-note">
                {isLoadingRuntimeSettings ? '正在读取后端运行配置...' : `环境文件路径：${runtimeSettings.env_path}`}
              </div>
            </div>
          </SectionBlock>
        ) : null}

        {activeTab === 'local' ? (
          <SectionBlock
            title="任务默认参数与本地工作区"
            description="这里决定工作目录、任务描述模板以及提交到后端时的默认编排参数。"
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
