import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Lightbulb,
  Code,
  FileText,
  Keyboard,
  HelpCircle,
  ExternalLink,
  Zap,
  FlaskConical,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Clock,
  UserCheck,
  AlertCircle,
} from 'lucide-react';

/* ── 快捷键列表 ── */
const SHORTCUTS = [
  { keys: ['Ctrl', 'N'], desc: '新建研究任务' },
  { keys: ['Ctrl', 'B'], desc: '切换侧边栏' },
  { keys: ['Ctrl', ','], desc: '打开设置' },
  { keys: ['Ctrl', '/'], desc: '聚焦搜索' },
  { keys: ['Ctrl', 'D'], desc: '切换暗色模式' },
  { keys: ['Esc'], desc: '返回主页' },
];

/* ── 模块详细说明（含输入、输出、耗时、是否人工审阅） ── */
const MODULE_DOCS = [
  {
    id: 'M1', name: '文献调研', icon: <BookOpen size={16} />,
    desc: '自动检索相关论文，生成文献综述和研究现状分析。',
    input: '用户输入的研究主题关键词',
    output: '筛选后的核心文献列表 + 文献综述报告（约 3000 字）',
    duration: '5-8 分钟',
    hasReview: false,
    details: '系统会同时检索 Semantic Scholar、arXiv、Google Scholar 三个数据库，自动扩展关键词并进行去重和相关性评分筛选。',
  },
  {
    id: 'M2', name: '选题开题', icon: <Lightbulb size={16} />,
    desc: '基于文献分析识别研究空白，生成创新研究选题。',
    input: 'M1 生成的文献综述 + 核心文献摘要',
    output: '5 个候选研究选题（含研究动机、核心贡献、技术路线草案）',
    duration: '3-5 分钟',
    hasReview: false,
    details: '通过分析文献中的研究空白和趋势，结合目标会议/期刊的偏好，自动生成多个差异化的研究方向。',
  },
  {
    id: 'M3', name: 'Idea 打分', icon: <Zap size={16} />,
    desc: '对生成的研究 Idea 进行多维度评估和打分。',
    input: 'M2 生成的候选选题 + 目标会议历史录用标准',
    output: '带多维评分的 Idea 排名列表（新颖性、可行性、影响力、清晰度）',
    duration: '2-4 分钟',
    hasReview: true,
    details: '模拟 3 位不同背景的审稿人进行多角色评审。此步骤会触发人工审阅，用户可确认或修改最终的 Idea 选择。',
  },
  {
    id: 'M4', name: '代码生成', icon: <Code size={16} />,
    desc: '根据实验方案自动生成实验代码框架。',
    input: '选定的研究 Idea + 技术路线 + 目标框架（如 PyTorch）',
    output: '完整项目代码结构（模型定义、训练脚本、评估脚本、配置文件等）',
    duration: '4-6 分钟',
    hasReview: false,
    details: '自动生成符合工程规范的代码，包含类型注解、文档字符串、单元测试，并通过 pylint 静态检查。',
  },
  {
    id: 'M5', name: '实验设计', icon: <FlaskConical size={16} />,
    desc: '设计实验方案，包括数据集选择、基线方法和评估指标。',
    input: 'M4 的代码框架 + 研究 Idea 技术路线 + 可用计算资源',
    output: '完整实验方案（数据集、基线方法、评估指标、超参数配置）',
    duration: '2-3 分钟',
    hasReview: false,
    details: '参考目标会议的实验标准，自动设计对比实验和消融实验，确保实验结果的可信度和完整性。',
  },
  {
    id: 'M6', name: 'Agent 实验', icon: <Zap size={16} />,
    desc: 'Agent 自主运行实验，监控进度并处理异常。',
    input: 'M4 的实验代码 + M5 的实验方案 + GPU 服务器连接信息',
    output: '全部实验运行结果（训练日志、模型 checkpoint、评估指标）',
    duration: '10-30 分钟（取决于实验规模）',
    hasReview: false,
    details: 'Agent 会自动连接远程 GPU 服务器，执行训练和评估。遇到 OOM 等错误时会自动调整参数并重试。',
  },
  {
    id: 'M7', name: '结果分析', icon: <FlaskConical size={16} />,
    desc: '分析实验结果，生成图表和统计报告。',
    input: 'M6 的全部实验结果数据 + 基线对比数据',
    output: '分析报告 + 论文级别图表（柱状图、折线图、表格）+ 统计检验结果',
    duration: '3-5 分钟',
    hasReview: true,
    details: '自动进行统计显著性检验，生成可直接用于论文的图表。此步骤会触发人工审阅，用户可确认结果解读是否合理。',
  },
  {
    id: 'M8', name: '论文写作', icon: <FileText size={16} />,
    desc: '自动撰写学术论文，包括摘要、正文和参考文献。',
    input: 'M1 文献综述 + M2-M3 选题 + M5 实验设计 + M7 结果分析 + 目标会议格式',
    output: '完整学术论文（LaTeX 格式，含摘要、正文、图表、参考文献、附录）',
    duration: '5-8 分钟',
    hasReview: false,
    details: '按照目标会议的模板和格式要求自动撰写，包含完整的文献引用和交叉引用。',
  },
  {
    id: 'M9', name: '评审打分', icon: <HelpCircle size={16} />,
    desc: '模拟同行评审，对论文进行多维度评分和建议。',
    input: 'M8 生成的完整论文 + 目标会议评审标准',
    output: '模拟评审结果（总分、分维度评分、改进建议）',
    duration: '3-5 分钟',
    hasReview: false,
    details: '模拟 3 位不同研究方向的审稿人，从新颖性、正确性、清晰度、意义、复现性五个维度评审，并给出具体改进建议。',
  },
];

/* ── FAQ ── */
const FAQ = [
  {
    q: '任务创建后多久能看到结果？',
    a: '完整流程（M1→M9）通常需要 30-60 分钟，取决于研究主题的复杂度和所选模型的速度。部分流程会更快，例如只运行 M8+M9 大约需要 8-13 分钟。',
  },
  {
    q: '可以中途暂停任务吗？',
    a: '可以。在任务详情页点击暂停按钮即可。暂停后可以随时恢复继续执行，已完成的模块不会重新运行。',
  },
  {
    q: '自动审阅和人工审阅有什么区别？',
    a: '人工审阅会在关键节点（M3 Idea 评估、M7 结果分析）暂停等待您确认。自动审阅则跳过这些步骤，适合快速迭代但可能影响产出质量。建议首次使用时保持人工审阅开启。',
  },
  {
    q: '支持哪些模型？',
    a: '目前支持 OpenAI（GPT-4o、GPT-4 Turbo、GPT-3.5）和 Anthropic（Claude 3 Opus / Sonnet / Haiku）。可在设置页配置自定义 Provider 和 API 地址。',
  },
  {
    q: '失败了怎么办？可以从某个模块重跑吗？',
    a: '如果某个模块执行失败，系统会自动重试（最多 3 次，可在设置中调整）。如果仍然失败，您可以在任务详情页选择从失败的模块重新开始，之前已完成的模块结果会保留。',
  },
  {
    q: '上传的参考论文会怎么被使用？',
    a: '上传的参考论文 PDF 会在 M1 文献调研阶段被优先分析，提取其中的方法、实验设计和关键发现，作为后续选题和实验设计的重要参考。上传的数据集会在 M5 实验设计和 M6 实验执行中被使用。',
  },
  {
    q: '生成的论文版权归谁？',
    a: '生成的论文、代码和实验数据的知识产权完全归用户所有。系统不会保留或使用您的研究成果。但请注意，AI 生成的内容需要您进行审核和必要的修改，以确保学术诚信。',
  },
  {
    q: '如何连接远程 GPU 服务器运行实验？',
    a: '在设置页配置后端连接地址后，M6 模块会通过 SSH 连接到配置的 GPU 服务器。您需要确保服务器已安装必要的深度学习环境（CUDA、PyTorch 等）。系统支持自动检测 GPU 型号和显存大小。',
  },
];

/* ── 可展开的模块卡片 ── */
function ModuleCard({ m }: { m: typeof MODULE_DOCS[0] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-[#e5e5e5] dark:border-[#333] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-[#f9f9f9] dark:hover:bg-[#222238] transition-colors"
      >
        <div className="shrink-0 w-8 h-8 rounded-lg bg-[#f4f4f4] dark:bg-[#222238] flex items-center justify-center text-[#10a37f]">
          {m.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[#0d0d0d] dark:text-[#e5e5e5]">{m.id} {m.name}</span>
            {m.hasReview && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-orange-100 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400">
                <UserCheck size={9} />
                人工审阅
              </span>
            )}
          </div>
          <div className="text-xs text-[#999] mt-0.5">{m.desc}</div>
        </div>
        <div className="shrink-0 mt-1 text-[#999]">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-0 space-y-2.5 border-t border-[#f4f4f4] dark:border-[#2a2a3e]">
          {/* 输入 */}
          <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/20">
            <div className="flex items-center gap-1.5 mb-1">
              <ArrowRight size={10} className="text-blue-500" />
              <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">输入</span>
            </div>
            <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">{m.input}</p>
          </div>

          {/* 输出 */}
          <div className="p-2.5 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/20">
            <div className="flex items-center gap-1.5 mb-1">
              <ArrowRight size={10} className="text-green-500 rotate-180" />
              <span className="text-[10px] font-medium text-green-600 dark:text-green-400 uppercase tracking-wider">输出</span>
            </div>
            <p className="text-xs text-green-800 dark:text-green-300 leading-relaxed">{m.output}</p>
          </div>

          {/* 元信息 */}
          <div className="flex items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1 text-[#666] dark:text-[#aaa]">
              <Clock size={10} className="text-[#10a37f]" />
              预计耗时：{m.duration}
            </span>
            {m.hasReview && (
              <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                <AlertCircle size={10} />
                此步骤会暂停等待人工确认
              </span>
            )}
          </div>

          {/* 补充说明 */}
          <p className="text-[11px] text-[#999] leading-relaxed">{m.details}</p>
        </div>
      )}
    </div>
  );
}

export default function HelpPage() {
  const navigate = useNavigate();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[640px] mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg hover:bg-[#f4f4f4] dark:hover:bg-[#2a2a3e] transition-colors text-[#666] dark:text-[#999]"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-[#0d0d0d] dark:text-[#e5e5e5]">帮助文档</h1>
            <p className="text-xs text-[#999]">了解 AI Research Agent 的功能和使用方法</p>
          </div>
        </div>

        {/* Quick start */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-[#0d0d0d] dark:text-[#e5e5e5] mb-3">快速开始</h2>
          <div className="p-4 rounded-xl bg-[#10a37f]/5 dark:bg-[#10a37f]/10 border border-[#10a37f]/20">
            <ol className="space-y-2 text-sm text-[#333] dark:text-[#ccc]">
              <li className="flex gap-2"><span className="shrink-0 w-5 h-5 rounded-full bg-[#10a37f] text-white text-xs flex items-center justify-center font-medium">1</span>在主页输入研究主题（建议 50-200 字，描述清楚研究方向和关注点）</li>
              <li className="flex gap-2"><span className="shrink-0 w-5 h-5 rounded-full bg-[#10a37f] text-white text-xs flex items-center justify-center font-medium">2</span>选择运行模式（完整流程 M1→M9 或选择部分模块）</li>
              <li className="flex gap-2"><span className="shrink-0 w-5 h-5 rounded-full bg-[#10a37f] text-white text-xs flex items-center justify-center font-medium">3</span>确认任务摘要后提交，等待 Agent 自动执行</li>
              <li className="flex gap-2"><span className="shrink-0 w-5 h-5 rounded-full bg-[#10a37f] text-white text-xs flex items-center justify-center font-medium">4</span>在 M3/M7 等关键节点进行人工审阅确认</li>
              <li className="flex gap-2"><span className="shrink-0 w-5 h-5 rounded-full bg-[#10a37f] text-white text-xs flex items-center justify-center font-medium">5</span>查看产出物（论文、代码、实验数据、评审报告）</li>
            </ol>
          </div>
        </section>

        {/* Module docs — 可展开的详细说明 */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#0d0d0d] dark:text-[#e5e5e5]">9 大研究模块</h2>
            <span className="text-[10px] text-[#999]">点击展开查看输入/输出详情</span>
          </div>
          <div className="space-y-2">
            {MODULE_DOCS.map((m) => (
              <ModuleCard key={m.id} m={m} />
            ))}
          </div>
        </section>

        {/* Flow overview */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-[#0d0d0d] dark:text-[#e5e5e5] mb-3">流程概览</h2>
          <div className="p-4 rounded-xl bg-[#f4f4f4] dark:bg-[#222238] border border-[#e5e5e5] dark:border-[#333]">
            <div className="flex flex-wrap items-center gap-1 text-xs">
              {MODULE_DOCS.map((m, i) => (
                <span key={m.id} className="flex items-center gap-1">
                  <span className={`px-2 py-1 rounded-lg font-medium ${
                    m.hasReview
                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400'
                      : 'bg-[#10a37f]/10 text-[#10a37f]'
                  }`}>
                    {m.id} {m.name}
                  </span>
                  {i < MODULE_DOCS.length - 1 && (
                    <ArrowRight size={12} className="text-[#ccc] dark:text-[#555]" />
                  )}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-3 text-[10px] text-[#999]">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-[#10a37f]/30" /> 自动执行
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-orange-300 dark:bg-orange-700" /> 含人工审阅
              </span>
              <span>完整流程预计 30-60 分钟</span>
            </div>
          </div>
        </section>

        {/* Keyboard shortcuts */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Keyboard size={16} className="text-[#10a37f]" />
            <h2 className="text-sm font-semibold text-[#0d0d0d] dark:text-[#e5e5e5]">快捷键</h2>
          </div>
          <div className="space-y-1">
            {SHORTCUTS.map((s, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#f4f4f4] dark:hover:bg-[#222238]">
                <span className="text-sm text-[#666] dark:text-[#aaa]">{s.desc}</span>
                <div className="flex items-center gap-1">
                  {s.keys.map((k, j) => (
                    <span key={j}>
                      <kbd className="px-1.5 py-0.5 rounded border border-[#e5e5e5] dark:border-[#444] bg-[#f9f9f9] dark:bg-[#222238] text-[10px] text-[#666] dark:text-[#aaa] font-mono">
                        {k}
                      </kbd>
                      {j < s.keys.length - 1 && <span className="text-[10px] text-[#ccc] mx-0.5">+</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-[#0d0d0d] dark:text-[#e5e5e5] mb-3">常见问题</h2>
          <div className="space-y-3">
            {FAQ.map((f, i) => (
              <div key={i} className="p-4 rounded-xl border border-[#e5e5e5] dark:border-[#333]">
                <div className="text-sm font-medium text-[#0d0d0d] dark:text-[#e5e5e5] mb-1">{f.q}</div>
                <div className="text-xs text-[#666] dark:text-[#aaa] leading-relaxed">{f.a}</div>
              </div>
            ))}
          </div>
        </section>

        {/* External links */}
        <section className="mb-8">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-[#f4f4f4] dark:bg-[#222238]">
            <ExternalLink size={16} className="text-[#999]" />
            <div>
              <div className="text-sm text-[#666] dark:text-[#aaa]">需要更多帮助？</div>
              <div className="text-xs text-[#999]">查看完整文档或提交 Issue</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
