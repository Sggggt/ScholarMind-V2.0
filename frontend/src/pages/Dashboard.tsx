import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUp,
  Paperclip,
  BookOpen,
  Lightbulb,
  Code,
  FileText,
  ChevronDown,
  ChevronUp,
  Clock,
  Zap,
  FileSearch,
  Loader2,
  CheckCircle2,
  X,
  Info,
  AlertTriangle,
} from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import { useToastStore } from '../stores/toastStore';
import { MODULE_NAMES } from '../shared/types';
import type { ModuleId } from '../shared/types';

/* ── 研究领域选项 ── */
const RESEARCH_FIELDS = [
  'NLP / 自然语言处理',
  'CV / 计算机视觉',
  'ML / 机器学习理论',
  '多模态学习',
  '强化学习',
  '图神经网络',
  '生物信息学',
  '材料科学',
  '其他',
];

/* ── 目标会议/期刊 ── */
const TARGET_VENUES = [
  'ICLR', 'NeurIPS', 'ICML', 'ACL', 'EMNLP', 'CVPR', 'ICCV', 'AAAI',
  'Nature', 'Science', '其他',
];

/* ── 场景模式 ── */
interface ScenarioMode {
  key: 'full' | 'partial';
  icon: React.ReactNode;
  title: string;
  desc: string;
  modules: ModuleId[];
}

const SCENARIO_MODES: ScenarioMode[] = [
  {
    key: 'full',
    icon: <Zap size={18} className="text-[#10a37f]" />,
    title: '完整研究流程',
    desc: '从文献调研到论文写作，M1→M9 全自动执行',
    modules: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9'],
  },
  {
    key: 'partial',
    icon: <FileSearch size={18} className="text-[#6366f1]" />,
    title: '单模块 / 部分流程',
    desc: '只运行选定的模块，适合已有部分成果的场景',
    modules: [],
  },
];

/* ── 场景示例 ── */
const SCENARIO_EXAMPLES = [
  {
    icon: <BookOpen size={16} className="text-[#10a37f]" />,
    title: '全流程示例：LLM科学发现',
    desc: '从文献调研到论文写作的完整演示',
    topic: '请帮我对大语言模型在科学发现中的应用进行全面研究',
    mode: 'full' as const,
  },
  {
    icon: <Lightbulb size={16} className="text-[#f59e0b]" />,
    title: '全流程示例：多模态创新',
    desc: '自动识别研究空白并生成创新 Idea',
    topic: '帮我在多模态学习领域寻找研究空白并提出创新想法',
    mode: 'full' as const,
  },
  {
    icon: <Code size={16} className="text-[#6366f1]" />,
    title: '部分流程：实验复现',
    desc: '已有 Idea，只需代码生成 + 实验运行',
    topic: '帮我复现 Transformer 架构在时间序列预测上的实验',
    mode: 'partial' as const,
    modules: ['M4', 'M5', 'M6', 'M7'] as ModuleId[],
  },
  {
    icon: <FileText size={16} className="text-[#ec4899]" />,
    title: '部分流程：论文写作',
    desc: '已有实验结果，只需撰写论文',
    topic: '基于我的实验结果，帮我撰写一篇关于图神经网络的学术论文',
    mode: 'partial' as const,
    modules: ['M8', 'M9'] as ModuleId[],
  },
];

/* ── 预估信息（根据实际选中模块动态计算） ── */
function getEstimate(modules: ModuleId[]) {
  const count = modules.length;
  if (count === 0) return { timeMin: 0, timeMax: 0, papers: '0', count: 0 };
  const timeMin = count * 3;
  const timeMax = count * 8;
  // 只有包含 M1 时才检索文献
  const hasM1 = modules.includes('M1');
  const papers = hasM1 ? '30-80' : '0';
  return { timeMin, timeMax, papers, count };
}

/* ── 创建后引导动画 ── */
function CreationGuide({ taskTopic, onDone }: { taskTopic: string; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const steps = [
    { label: '任务已创建', done: true },
    { label: '正在初始化研究环境...', done: false },
    { label: '启动 M1 文献调研...', done: false },
  ];

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 600);
    const t2 = setTimeout(() => setStep(2), 1400);
    const t3 = setTimeout(() => onDone(), 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1e1e2e] rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 border border-[#e5e5e5] dark:border-[#333]">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-full bg-[#10a37f]/10 flex items-center justify-center">
            <Zap size={16} className="text-[#10a37f]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#0d0d0d] dark:text-[#e5e5e5]">正在启动研究</h3>
            <p className="text-xs text-[#999] truncate max-w-[300px]">{taskTopic}</p>
          </div>
        </div>
        <div className="space-y-3">
          {steps.map((s, i) => (
            <div key={i} className={`flex items-center gap-3 transition-opacity duration-300 ${i <= step ? 'opacity-100' : 'opacity-30'}`}>
              {i < step ? (
                <CheckCircle2 size={16} className="text-[#10a37f] shrink-0" />
              ) : i === step ? (
                <Loader2 size={16} className="text-[#10a37f] animate-spin shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-[#e5e5e5] dark:border-[#444] shrink-0" />
              )}
              <span className={`text-sm ${i <= step ? 'text-[#0d0d0d] dark:text-[#e5e5e5]' : 'text-[#999]'}`}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── 提交确认弹窗 ── */
function ConfirmDialog({
  topic,
  mode,
  modules,
  field,
  venue,
  onConfirm,
  onCancel,
}: {
  topic: string;
  mode: 'full' | 'partial';
  modules: ModuleId[];
  field: string;
  venue: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const estimate = getEstimate(modules);
  const moduleRange = modules.length > 0
    ? `${modules[0]}→${modules[modules.length - 1]}`
    : 'M1→M9';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1e1e2e] rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 border border-[#e5e5e5] dark:border-[#333]">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-[#10a37f]/10 flex items-center justify-center">
            <AlertTriangle size={16} className="text-[#10a37f]" />
          </div>
          <h3 className="text-sm font-semibold text-[#0d0d0d] dark:text-[#e5e5e5]">确认创建任务</h3>
        </div>

        <div className="space-y-3 mb-5">
          <div className="p-3 rounded-xl bg-[#f4f4f4] dark:bg-[#222238]">
            <div className="text-[10px] text-[#999] uppercase tracking-wider mb-1">研究主题</div>
            <p className="text-sm text-[#0d0d0d] dark:text-[#e5e5e5] line-clamp-3">{topic}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-xl bg-[#f4f4f4] dark:bg-[#222238]">
              <div className="text-[10px] text-[#999] uppercase tracking-wider mb-0.5">运行模式</div>
              <p className="text-xs font-medium text-[#0d0d0d] dark:text-[#e5e5e5]">
                {mode === 'full' ? '完整流程' : '部分流程'} ({moduleRange})
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-[#f4f4f4] dark:bg-[#222238]">
              <div className="text-[10px] text-[#999] uppercase tracking-wider mb-0.5">模块数量</div>
              <p className="text-xs font-medium text-[#0d0d0d] dark:text-[#e5e5e5]">{modules.length} 个模块</p>
            </div>
            <div className="p-2.5 rounded-xl bg-[#f4f4f4] dark:bg-[#222238]">
              <div className="text-[10px] text-[#999] uppercase tracking-wider mb-0.5">预计耗时</div>
              <p className="text-xs font-medium text-[#0d0d0d] dark:text-[#e5e5e5]">{estimate.timeMin}-{estimate.timeMax} 分钟</p>
            </div>
            <div className="p-2.5 rounded-xl bg-[#f4f4f4] dark:bg-[#222238]">
              <div className="text-[10px] text-[#999] uppercase tracking-wider mb-0.5">目标</div>
              <p className="text-xs font-medium text-[#0d0d0d] dark:text-[#e5e5e5]">{venue || field || '未指定'}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-medium text-[#666] dark:text-[#aaa] bg-[#f4f4f4] dark:bg-[#2a2a3e] hover:bg-[#ececec] dark:hover:bg-[#333] transition-colors"
          >
            返回修改
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-white bg-[#10a37f] hover:bg-[#0d8a6c] transition-colors"
          >
            <Zap size={12} />
            确认开始
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 附件上传 tooltip ── */
function AttachmentTooltip() {
  return (
    <div className="absolute bottom-full left-0 mb-2 w-56 p-3 rounded-xl bg-[#0d0d0d] dark:bg-[#333] text-white text-xs shadow-lg z-10">
      <p className="font-medium mb-1">上传参考资料</p>
      <ul className="space-y-0.5 text-[#ccc]">
        <li>- 参考论文 PDF</li>
        <li>- 实验数据集</li>
        <li>- 代码仓库链接</li>
      </ul>
      <div className="absolute bottom-0 left-4 translate-y-1/2 rotate-45 w-2 h-2 bg-[#0d0d0d] dark:bg-[#333]" />
    </div>
  );
}

/* ── 主组件 ── */
export default function Dashboard() {
  const [input, setInput] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedField, setSelectedField] = useState('');
  const [selectedVenue, setSelectedVenue] = useState('');
  const [selectedMode, setSelectedMode] = useState<'full' | 'partial'>('full');
  const [selectedModules, setSelectedModules] = useState<ModuleId[]>([]);
  const [showAttachTooltip, setShowAttachTooltip] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [guideTopic, setGuideTopic] = useState('');
  const [showShortcuts, setShowShortcuts] = useState(() => {
    return !localStorage.getItem('shortcuts_dismissed');
  });

  const { createTask, loading } = useTaskStore();
  const addToast = useToastStore((s) => s.addToast);
  const navigate = useNavigate();
  const createdTaskRef = useRef<string | null>(null);

  const activeModules: ModuleId[] = selectedMode === 'full'
    ? SCENARIO_MODES[0].modules
    : selectedModules;

  const estimate = getEstimate(activeModules.length > 0 ? activeModules : SCENARIO_MODES[0].modules);

  const toggleModule = (m: ModuleId) => {
    setSelectedModules((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort()
    );
  };

  // 提交前先显示确认弹窗
  const handleSubmitClick = () => {
    const topic = input.trim();
    if (!topic || loading) return;
    setShowConfirm(true);
  };

  // 确认后真正提交
  const handleConfirmedSubmit = async () => {
    const topic = input.trim();
    if (!topic || loading) return;
    setShowConfirm(false);

    let desc = '';
    if (selectedField) desc += `研究领域: ${selectedField}\n`;
    if (selectedVenue) desc += `目标会议/期刊: ${selectedVenue}\n`;
    if (selectedMode === 'partial' && selectedModules.length > 0) {
      desc += `运行模块: ${selectedModules.join(', ')}\n`;
    }

    try {
      const task = await createTask(topic, desc || undefined);
      createdTaskRef.current = task.id;
      setGuideTopic(topic);
      setShowGuide(true);
    } catch {
      addToast('error', '任务创建失败，请检查后端连接');
    }
  };

  const handleGuideDone = () => {
    setShowGuide(false);
    if (createdTaskRef.current) {
      navigate(`/task/${createdTaskRef.current}`);
      createdTaskRef.current = null;
    }
    setInput('');
    setShowAdvanced(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitClick();
    }
  };

  // 示例卡片点击：预填输入 + 自动展开高级选项 + 联动模式和模块
  const handleSuggestion = (example: typeof SCENARIO_EXAMPLES[0]) => {
    setInput(example.topic);
    setSelectedMode(example.mode);
    if (example.mode === 'partial' && example.modules) {
      setSelectedModules(example.modules);
    } else {
      setSelectedModules([]);
    }
    // 自动展开高级选项，让用户看到完整配置
    setShowAdvanced(true);
  };

  const dismissShortcuts = () => {
    setShowShortcuts(false);
    localStorage.setItem('shortcuts_dismissed', '1');
  };

  // 输入字数
  const charCount = input.length;

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 overflow-y-auto py-8 animate-fade-in">
      {/* Welcome title */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl sm:text-3xl font-semibold text-[#0d0d0d] dark:text-[#e5e5e5] mb-2">
          想要研究什么？
        </h1>
        <p className="text-[#999] text-sm">
          输入研究主题，AI Agent 将自动完成从文献调研到论文写作的全流程
        </p>
      </div>

      {/* Input area */}
      <div className="w-full max-w-[680px] mb-4">
        <div className="relative bg-[#f4f4f4] dark:bg-[#222238] rounded-2xl border border-transparent focus-within:border-[#e5e5e5] dark:focus-within:border-[#444] focus-within:bg-white dark:focus-within:bg-[#1e1e2e] focus-within:shadow-sm transition-all">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述你的研究主题..."
            rows={3}
            className="w-full px-4 pt-4 pb-12 bg-transparent rounded-2xl resize-none text-sm text-[#0d0d0d] dark:text-[#e5e5e5] placeholder:text-[#999] focus:outline-none"
          />
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  className="p-1.5 rounded-lg hover:bg-[#e5e5e5] dark:hover:bg-[#333] transition-colors text-[#999]"
                  onMouseEnter={() => setShowAttachTooltip(true)}
                  onMouseLeave={() => setShowAttachTooltip(false)}
                  title="上传参考资料（论文PDF、数据集等）"
                >
                  <Paperclip size={16} />
                </button>
                {showAttachTooltip && <AttachmentTooltip />}
              </div>
              {/* 字数提示 */}
              <span className={`text-[10px] ${charCount > 0 && charCount < 20 ? 'text-orange-400' : 'text-[#ccc] dark:text-[#555]'}`}>
                {charCount > 0 ? `${charCount} 字` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-[#999] hover:text-[#666] dark:hover:text-[#ccc] hover:bg-[#e5e5e5] dark:hover:bg-[#333] transition-colors"
              >
                高级选项
                {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              <button
                onClick={handleSubmitClick}
                disabled={!input.trim() || loading}
                className={`p-2 rounded-full transition-colors ${
                  input.trim() && !loading
                    ? 'bg-[#0d0d0d] dark:bg-white text-white dark:text-[#0d0d0d] hover:bg-[#333] dark:hover:bg-[#e5e5e5]'
                    : 'bg-[#d9d9d9] dark:bg-[#444] text-white cursor-not-allowed'
                }`}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={16} />}
              </button>
            </div>
          </div>
        </div>
        {/* 输入引导提示 */}
        <p className="mt-1.5 text-[11px] text-[#ccc] dark:text-[#555] px-1">
          建议 50-200 字，描述清楚研究方向、关注点和约束条件
        </p>
      </div>

      {/* Advanced options panel */}
      {showAdvanced && (
        <div className="w-full max-w-[680px] mb-4 p-4 rounded-2xl border border-[#e5e5e5] dark:border-[#333] bg-white dark:bg-[#1e1e2e] space-y-4 animate-in">
          {/* Mode selection */}
          <div>
            <label className="block text-xs font-medium text-[#666] dark:text-[#999] mb-2">运行模式</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SCENARIO_MODES.map((mode) => (
                <button
                  key={mode.key}
                  onClick={() => {
                    setSelectedMode(mode.key);
                    if (mode.key === 'full') setSelectedModules([]);
                  }}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                    selectedMode === mode.key
                      ? 'border-[#10a37f] bg-[#10a37f]/5 dark:bg-[#10a37f]/10'
                      : 'border-[#e5e5e5] dark:border-[#333] hover:border-[#ccc] dark:hover:border-[#555]'
                  }`}
                >
                  <div className="shrink-0 mt-0.5">{mode.icon}</div>
                  <div>
                    <div className="text-sm font-medium text-[#0d0d0d] dark:text-[#e5e5e5]">{mode.title}</div>
                    <div className="text-xs text-[#999] mt-0.5">{mode.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Module selection (partial mode) */}
          {selectedMode === 'partial' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-[#666] dark:text-[#999]">选择模块（可多选）</label>
                {selectedModules.length > 0 && (
                  <span className="text-[10px] text-[#10a37f] font-medium">
                    已选 {selectedModules.length} 个模块
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(MODULE_NAMES) as ModuleId[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => toggleModule(m)}
                    className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                      selectedModules.includes(m)
                        ? 'bg-[#10a37f] text-white'
                        : 'bg-[#f4f4f4] dark:bg-[#2a2a3e] text-[#666] dark:text-[#aaa] hover:bg-[#ececec] dark:hover:bg-[#333]'
                    }`}
                  >
                    {m} {MODULE_NAMES[m]}
                  </button>
                ))}
              </div>
              {selectedModules.length === 0 && (
                <p className="mt-1.5 text-[10px] text-orange-400">请至少选择一个模块</p>
              )}
            </div>
          )}

          {/* Research field */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#666] dark:text-[#999] mb-1.5">研究领域</label>
              <select
                value={selectedField}
                onChange={(e) => setSelectedField(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#f4f4f4] dark:bg-[#222238] border border-transparent focus:border-[#10a37f] focus:outline-none text-sm text-[#0d0d0d] dark:text-[#e5e5e5] cursor-pointer"
              >
                <option value="">选择领域（可选）</option>
                {RESEARCH_FIELDS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#666] dark:text-[#999] mb-1.5">目标会议/期刊</label>
              <select
                value={selectedVenue}
                onChange={(e) => setSelectedVenue(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#f4f4f4] dark:bg-[#222238] border border-transparent focus:border-[#10a37f] focus:outline-none text-sm text-[#0d0d0d] dark:text-[#e5e5e5] cursor-pointer"
              >
                <option value="">选择目标（可选）</option>
                {TARGET_VENUES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Estimate — 动态联动 */}
          <div className="flex items-center gap-4 px-3 py-2.5 rounded-xl bg-[#f9f9f9] dark:bg-[#171720] border border-[#e5e5e5] dark:border-[#333]">
            <div className="flex items-center gap-1.5 text-xs text-[#666] dark:text-[#aaa]">
              <Clock size={12} className="text-[#10a37f]" />
              <span>预计耗时 <strong>{estimate.timeMin}-{estimate.timeMax}</strong> 分钟</span>
            </div>
            <div className="w-px h-3 bg-[#e5e5e5] dark:bg-[#444]" />
            <div className="flex items-center gap-1.5 text-xs text-[#666] dark:text-[#aaa]">
              <BookOpen size={12} className="text-[#10a37f]" />
              <span>约检索 <strong>{estimate.papers}</strong> 篇文献</span>
            </div>
            <div className="w-px h-3 bg-[#e5e5e5] dark:bg-[#444]" />
            <div className="flex items-center gap-1.5 text-xs text-[#666] dark:text-[#aaa]">
              <Zap size={12} className="text-[#10a37f]" />
              <span>运行 <strong>{activeModules.length > 0 ? activeModules.length : 9}</strong> 个模块</span>
            </div>
          </div>
        </div>
      )}

      {/* Scenario examples */}
      <div className="w-full max-w-[680px] mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Info size={12} className="text-[#999]" />
          <span className="text-xs text-[#999]">点击示例快速体验不同研究场景（将自动展开高级选项）</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SCENARIO_EXAMPLES.map((s, i) => (
            <button
              key={i}
              onClick={() => handleSuggestion(s)}
              className="flex items-start gap-3 p-4 rounded-xl border border-[#e5e5e5] dark:border-[#333] hover:bg-[#f9f9f9] dark:hover:bg-[#222238] transition-colors text-left group"
            >
              <div className="shrink-0 mt-0.5">{s.icon}</div>
              <div>
                <div className="text-sm font-medium text-[#0d0d0d] dark:text-[#e5e5e5] group-hover:text-[#10a37f] transition-colors">
                  {s.title}
                </div>
                <div className="text-xs text-[#999] mt-0.5">{s.desc}</div>
                <span className={`inline-block mt-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  s.mode === 'full'
                    ? 'bg-[#10a37f]/10 text-[#10a37f]'
                    : 'bg-[#6366f1]/10 text-[#6366f1]'
                }`}>
                  {s.mode === 'full' ? 'M1→M9 完整' : `${s.modules?.join('→')}`}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Shortcut hints — dismissible, only shown on first use */}
      {showShortcuts && (
        <div className="flex items-center gap-3 text-[10px] text-[#ccc] dark:text-[#555] mt-2">
          <span><kbd className="px-1 py-0.5 rounded border border-[#e5e5e5] dark:border-[#444] text-[9px]">Ctrl+N</kbd> 新建</span>
          <span><kbd className="px-1 py-0.5 rounded border border-[#e5e5e5] dark:border-[#444] text-[9px]">Ctrl+B</kbd> 侧边栏</span>
          <span><kbd className="px-1 py-0.5 rounded border border-[#e5e5e5] dark:border-[#444] text-[9px]">Ctrl+,</kbd> 设置</span>
          <button onClick={dismissShortcuts} className="p-0.5 rounded hover:bg-[#f4f4f4] dark:hover:bg-[#333]">
            <X size={10} />
          </button>
        </div>
      )}

      {/* Footer disclaimer */}
      <p className="mt-4 text-xs text-[#999]">
        AI Research Agent 可能会产生不准确的结果，请注意验证重要信息。
      </p>

      {/* Confirm dialog */}
      {showConfirm && (
        <ConfirmDialog
          topic={input.trim()}
          mode={selectedMode}
          modules={activeModules.length > 0 ? activeModules : SCENARIO_MODES[0].modules}
          field={selectedField}
          venue={selectedVenue}
          onConfirm={handleConfirmedSubmit}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {/* Creation guide overlay */}
      {showGuide && <CreationGuide taskTopic={guideTopic} onDone={handleGuideDone} />}
    </div>
  );
}
