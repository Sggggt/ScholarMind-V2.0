import { useState } from 'react';
import {
  Save,
  Server,
  Key,
  Cpu,
  RotateCcw,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  XCircle,
  BarChart3,
  Zap,
  Info,
} from 'lucide-react';
import { useToastStore } from '../stores/toastStore';

/* ── 模型 Provider 配置 ── */
interface ProviderConfig {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'local' | 'custom';
  apiKey: string;
  baseUrl: string;
  models: ModelOption[];
}

interface ModelOption {
  id: string;
  name: string;
  description: string;
  costTier: 'low' | 'medium' | 'high';
  speedTier: 'fast' | 'medium' | 'slow';
}

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', description: '最强多模态，适合复杂推理', costTier: 'high', speedTier: 'medium' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: '128K 上下文，性价比高', costTier: 'medium', speedTier: 'fast' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: '速度最快，成本最低', costTier: 'low', speedTier: 'fast' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    apiKey: '',
    baseUrl: 'https://api.anthropic.com',
    models: [
      { id: 'claude-3-opus', name: 'Claude 3 Opus', description: '最强推理能力', costTier: 'high', speedTier: 'slow' },
      { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', description: '均衡性能', costTier: 'medium', speedTier: 'medium' },
      { id: 'claude-3-haiku', name: 'Claude 3 Haiku', description: '极速响应', costTier: 'low', speedTier: 'fast' },
    ],
  },
];

interface SettingsData {
  backendUrl: string;
  wsUrl: string;
  providers: ProviderConfig[];
  activeProvider: string;
  activeModel: string;
  maxRetries: number;
  autoReview: boolean;
  targetScore: number;
}

const defaultSettings: SettingsData = {
  backendUrl: 'http://localhost:8000',
  wsUrl: 'ws://localhost:8000/ws',
  providers: DEFAULT_PROVIDERS,
  activeProvider: 'openai',
  activeModel: 'gpt-4o',
  maxRetries: 3,
  autoReview: false,
  targetScore: 6,
};

/* ── 用量统计面板（空态提示） ── */
function UsagePanel() {
  // 检查是否有真实数据（这里始终为空态，因为没有后端）
  const hasRealData = false;

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={16} className="text-[#10a37f]" />
        <h2 className="text-sm font-medium text-[#0d0d0d] dark:text-[#e5e5e5]">用量统计</h2>
      </div>

      {hasRealData ? (
        /* 真实数据展示（预留） */
        <div className="text-sm text-[#999]">加载中...</div>
      ) : (
        /* 空态 */
        <div className="p-6 rounded-xl border border-dashed border-[#e5e5e5] dark:border-[#333] text-center">
          <BarChart3 size={32} className="mx-auto mb-3 text-[#d9d9d9] dark:text-[#444]" />
          <p className="text-sm text-[#999] mb-1">暂无用量数据</p>
          <p className="text-xs text-[#ccc] dark:text-[#555]">
            连接后端服务并运行任务后，将在此处显示 Token 用量和费用统计
          </p>
        </div>
      )}
    </section>
  );
}

/* ── 连接测试 ── */
function ConnectionTest({ url, label }: { url: string; label: string }) {
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleTest = async () => {
    setStatus('testing');
    setErrorMsg('');
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMsg(`HTTP ${res.status}`);
      }
    } catch (e: unknown) {
      setStatus('error');
      setErrorMsg((e as Error).message || '连接失败');
    }
  };

  return (
    <div className="flex items-center gap-2 mt-1.5">
      <button
        onClick={handleTest}
        disabled={status === 'testing'}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#10a37f] bg-[#10a37f]/10 hover:bg-[#10a37f]/20 transition-colors disabled:opacity-50"
      >
        {status === 'testing' ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
        测试{label}连接
      </button>
      {status === 'success' && (
        <span className="flex items-center gap-1 text-[11px] text-green-600">
          <CheckCircle2 size={12} /> 连接成功
        </span>
      )}
      {status === 'error' && (
        <span className="flex items-center gap-1 text-[11px] text-red-500">
          <XCircle size={12} /> {errorMsg || '连接失败'}
        </span>
      )}
    </div>
  );
}

/* ── 成本/速度标签 ── */
function TierBadge({ tier, type }: { tier: string; type: 'cost' | 'speed' }) {
  const colors = {
    cost: { low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    speed: { fast: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', slow: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  };
  const labels = {
    cost: { low: '低成本', medium: '中等', high: '高成本' },
    speed: { fast: '快速', medium: '中等', slow: '较慢' },
  };
  const c = (colors[type] as Record<string, string>)[tier] || '';
  const l = (labels[type] as Record<string, string>)[tier] || tier;
  return <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${c}`}>{l}</span>;
}

/* ── 主组件 ── */
export default function Settings({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<SettingsData>(() => {
    const saved = localStorage.getItem('agent_settings');
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
  });
  const addToast = useToastStore((s) => s.addToast);

  const handleSave = () => {
    localStorage.setItem('agent_settings', JSON.stringify(settings));
    addToast('success', '设置已保存');
  };

  const handleReset = () => {
    setSettings(defaultSettings);
    localStorage.removeItem('agent_settings');
    addToast('info', '已恢复默认设置');
  };

  const update = <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
  };

  const updateProviderKey = (providerId: string, apiKey: string) => {
    update('providers', settings.providers.map((p) =>
      p.id === providerId ? { ...p, apiKey } : p
    ));
  };

  const updateProviderUrl = (providerId: string, baseUrl: string) => {
    update('providers', settings.providers.map((p) =>
      p.id === providerId ? { ...p, baseUrl } : p
    ));
  };

  const activeProvider = settings.providers.find((p) => p.id === settings.activeProvider);
  const activeModels = activeProvider?.models || [];

  const inputClass = 'w-full px-3 py-2 rounded-xl bg-[#f4f4f4] dark:bg-[#222238] border border-transparent focus:border-[#10a37f] focus:bg-white dark:focus:bg-[#1e1e2e] focus:outline-none text-sm text-[#0d0d0d] dark:text-[#e5e5e5]';

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[560px] mx-auto px-4 py-8">
          <h1 className="text-xl font-semibold text-[#0d0d0d] dark:text-[#e5e5e5] mb-6">设置</h1>

          {/* Connection */}
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Server size={16} className="text-[#10a37f]" />
              <h2 className="text-sm font-medium text-[#0d0d0d] dark:text-[#e5e5e5]">连接配置</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-[#666] dark:text-[#999] mb-1.5">后端地址</label>
                <input
                  type="text"
                  value={settings.backendUrl}
                  onChange={(e) => update('backendUrl', e.target.value)}
                  className={inputClass}
                />
                <ConnectionTest url={settings.backendUrl} label="后端" />
              </div>
              <div>
                <label className="block text-xs text-[#666] dark:text-[#999] mb-1.5">WebSocket 地址</label>
                <input
                  type="text"
                  value={settings.wsUrl}
                  onChange={(e) => update('wsUrl', e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          {/* Model Providers */}
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Key size={16} className="text-[#10a37f]" />
              <h2 className="text-sm font-medium text-[#0d0d0d] dark:text-[#e5e5e5]">模型提供商</h2>
            </div>

            {/* Provider tabs */}
            <div className="flex items-center gap-1 mb-4 border-b border-[#e5e5e5] dark:border-[#333]">
              {settings.providers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => update('activeProvider', p.id)}
                  className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                    settings.activeProvider === p.id
                      ? 'border-[#10a37f] text-[#0d0d0d] dark:text-[#e5e5e5] font-medium'
                      : 'border-transparent text-[#999] hover:text-[#666] dark:hover:text-[#ccc]'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>

            {activeProvider && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-[#666] dark:text-[#999] mb-1.5">API Key</label>
                  <input
                    type="password"
                    value={activeProvider.apiKey}
                    onChange={(e) => updateProviderKey(activeProvider.id, e.target.value)}
                    placeholder={activeProvider.type === 'openai' ? 'sk-...' : activeProvider.type === 'anthropic' ? 'sk-ant-...' : 'API Key'}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#666] dark:text-[#999] mb-1.5">Base URL</label>
                  <input
                    type="text"
                    value={activeProvider.baseUrl}
                    onChange={(e) => updateProviderUrl(activeProvider.id, e.target.value)}
                    className={inputClass}
                  />
                </div>

                {/* Model selection with descriptions */}
                <div>
                  <label className="block text-xs text-[#666] dark:text-[#999] mb-2">选择模型</label>
                  <div className="space-y-2">
                    {activeProvider.models.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => update('activeModel', m.id)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                          settings.activeModel === m.id
                            ? 'border-[#10a37f] bg-[#10a37f]/5 dark:bg-[#10a37f]/10'
                            : 'border-[#e5e5e5] dark:border-[#333] hover:border-[#ccc] dark:hover:border-[#555]'
                        }`}
                      >
                        <div>
                          <div className="text-sm font-medium text-[#0d0d0d] dark:text-[#e5e5e5]">{m.name}</div>
                          <div className="text-xs text-[#999] mt-0.5">{m.description}</div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-3">
                          <TierBadge tier={m.costTier} type="cost" />
                          <TierBadge tier={m.speedTier} type="speed" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Experiment settings */}
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Cpu size={16} className="text-[#10a37f]" />
              <h2 className="text-sm font-medium text-[#0d0d0d] dark:text-[#e5e5e5]">实验配置</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-[#666] dark:text-[#999] mb-1.5">最大重试次数</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={settings.maxRetries}
                  onChange={(e) => update('maxRetries', parseInt(e.target.value) || 1)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-[#666] dark:text-[#999] mb-1.5">目标评审分数 (1-10)</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={settings.targetScore}
                  onChange={(e) => update('targetScore', parseInt(e.target.value) || 6)}
                  className={inputClass}
                />
              </div>

              {/* Auto review with ALWAYS visible warning */}
              <div className="p-4 rounded-xl border border-[#e5e5e5] dark:border-[#333]">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-sm text-[#0d0d0d] dark:text-[#e5e5e5]">自动审阅</span>
                    <p className="text-xs text-[#999] mt-0.5">跳过人工审阅步骤，自动批准</p>
                  </div>
                  <button
                    onClick={() => update('autoReview', !settings.autoReview)}
                    className={`w-10 h-6 rounded-full transition-colors relative ${
                      settings.autoReview ? 'bg-[#10a37f]' : 'bg-[#d9d9d9] dark:bg-[#444]'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white shadow absolute top-1 transition-transform ${
                        settings.autoReview ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                {/* 始终显示的风险提示（不同状态不同样式） */}
                <div className={`flex items-start gap-2 mt-3 p-3 rounded-lg border ${
                  settings.autoReview
                    ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30'
                    : 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-900/30'
                }`}>
                  <AlertTriangle size={14} className={`shrink-0 mt-0.5 ${
                    settings.autoReview ? 'text-red-500' : 'text-yellow-600 dark:text-yellow-400'
                  }`} />
                  <div className={`text-xs leading-relaxed ${
                    settings.autoReview
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-yellow-700 dark:text-yellow-400'
                  }`}>
                    {settings.autoReview ? (
                      <>
                        <strong>已开启自动审阅：</strong>将跳过 M3 Idea 评估、M7 结果分析等人工审阅节点，Agent 将自动批准并继续执行。这可能影响科研产出质量，建议仅在调试或快速迭代时使用。
                      </>
                    ) : (
                      <>
                        <strong>提示：</strong>开启后将跳过 Idea 评估、结果分析等人工审阅节点，可能影响产出质量。建议保持关闭以确保研究质量。
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Usage statistics */}
          <UsagePanel />

          {/* Demo mode notice */}
          <section className="mb-8">
            <div className="flex items-start gap-2 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-900/20">
              <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
              <div className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
                <strong>演示模式：</strong>当前未连接后端服务，系统正在使用写死的演示数据展示完整研究流程。连接后端后将自动切换为真实数据。
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="border-t border-[#e5e5e5] dark:border-[#333] px-4 py-3 bg-white dark:bg-[#1a1a2e]">
        <div className="max-w-[560px] mx-auto flex items-center justify-between">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-[#999] hover:text-[#666] dark:hover:text-[#ccc] hover:bg-[#f4f4f4] dark:hover:bg-[#2a2a3e] transition-colors"
          >
            <RotateCcw size={12} />
            恢复默认
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-[#666] dark:text-[#aaa] bg-[#f4f4f4] dark:bg-[#2a2a3e] hover:bg-[#ececec] dark:hover:bg-[#333] transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-white bg-[#10a37f] hover:bg-[#0d8a6c] transition-colors"
            >
              <Save size={12} />
              保存设置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
