// ============================================================
// 写死的 Demo 数据 — 展示 M1→M9 完整研究流程的输入输出
// ============================================================

import type { Task, LogEntry, ReviewResult, ModuleProgress, ModuleId } from './types';

/* ── 每个模块的输入输出详情 ── */
export interface ModuleIODetail {
  moduleId: ModuleId;
  name: string;
  input: string;
  output: string;
  duration: string;
  hasReview: boolean;
  status: 'completed' | 'running' | 'waiting';
  percent: number;
  keyFindings?: string[];
}

export const DEMO_MODULE_IO: ModuleIODetail[] = [
  {
    moduleId: 'M1',
    name: '文献调研',
    input: '用户输入的研究主题："大语言模型在科学发现中的应用"\n检索数据库：Semantic Scholar, arXiv, Google Scholar\n检索关键词自动扩展：LLM for Scientific Discovery, AI-driven Research, Automated Hypothesis Generation',
    output: '检索到 67 篇相关论文\n筛选出 23 篇核心文献\n生成文献综述报告（约 3000 字）\n识别出 5 个主要研究方向：\n  1. LLM 辅助假设生成\n  2. 自动化实验设计\n  3. 科学文本挖掘\n  4. 多模态科学数据理解\n  5. AI 驱动的药物发现',
    duration: '5-8 分钟',
    hasReview: false,
    status: 'completed',
    percent: 100,
    keyFindings: [
      '近 2 年该领域论文增长 340%',
      '主要会议：NeurIPS, ICML, Nature Machine Intelligence',
      '核心方法：Prompt Engineering, RAG, Fine-tuning',
    ],
  },
  {
    moduleId: 'M2',
    name: '选题开题',
    input: 'M1 输出的文献综述报告\n23 篇核心文献的摘要和关键发现\n5 个研究方向分析\n用户偏好：目标会议 NeurIPS',
    output: '生成 5 个候选研究选题：\n  1. "基于 LLM 的跨学科假设迁移框架"\n  2. "科学论文自动化 Peer Review 系统"\n  3. "多模态科学数据的统一表征学习"\n  4. "LLM 驱动的实验方案自动优化"\n  5. "面向开放科学问题的 LLM 推理增强"\n\n每个选题包含：研究动机、核心贡献、技术路线草案',
    duration: '3-5 分钟',
    hasReview: false,
    status: 'completed',
    percent: 100,
    keyFindings: [
      '选题 1 和选题 5 的创新性评分最高',
      '选题 3 的可行性最强（已有开源数据集）',
      '选题 2 与最新 ICLR 2025 论文有差异化',
    ],
  },
  {
    moduleId: 'M3',
    name: 'Idea 打分',
    input: 'M2 生成的 5 个候选研究选题\n每个选题的研究动机和技术路线\n目标会议 NeurIPS 的历史录用标准\n相关领域 Top 论文的创新模式',
    output: 'Idea 多维评分排名：\n\n  #1 "LLM 驱动的实验方案自动优化" — 总分 8.2/10\n     · 新颖性: 8.5  · 可行性: 8.0  · 影响力: 8.0  · 清晰度: 8.3\n\n  #2 "基于 LLM 的跨学科假设迁移框架" — 总分 7.8/10\n     · 新颖性: 9.0  · 可行性: 7.0  · 影响力: 8.5  · 清晰度: 6.7\n\n  #3 "面向开放科学问题的 LLM 推理增强" — 总分 7.5/10\n     · 新颖性: 7.5  · 可行性: 8.0  · 影响力: 7.0  · 清晰度: 7.5\n\n推荐选择 #1，并给出改进建议',
    duration: '2-4 分钟',
    hasReview: true,
    status: 'completed',
    percent: 100,
    keyFindings: [
      '人工审阅节点：用户可确认/修改 Idea 选择',
      '评分基于 GPT-4o 多角色评审（模拟 3 位审稿人）',
      '最终选定 Idea #1 进入下一阶段',
    ],
  },
  {
    moduleId: 'M4',
    name: '代码生成',
    input: '选定的研究 Idea：LLM 驱动的实验方案自动优化\n技术路线：基于 Prompt Chain + Bayesian Optimization\n目标框架：PyTorch + HuggingFace Transformers\n实验需求：支持多 GPU 分布式训练',
    output: '生成项目代码结构：\n  src/\n    main.py          — 主入口，参数解析\n    model.py         — 核心模型定义（OptimLLM）\n    train.py         — 训练循环 + 分布式支持\n    evaluate.py      — 评估指标计算\n    data_loader.py   — 数据加载与预处理\n    utils.py         — 工具函数\n  configs/\n    base.yaml        — 基础配置\n    experiment.yaml  — 实验超参数\n  requirements.txt\n  README.md\n\n总计约 1,200 行代码',
    duration: '4-6 分钟',
    hasReview: false,
    status: 'completed',
    percent: 100,
    keyFindings: [
      '代码通过 pylint 静态检查（评分 9.2/10）',
      '自动生成单元测试 12 个',
      '支持 CUDA 11.8+ 和 PyTorch 2.0+',
    ],
  },
  {
    moduleId: 'M5',
    name: '实验设计',
    input: 'M4 生成的代码框架\n研究 Idea 的技术路线\n目标会议 NeurIPS 的实验标准\n可用计算资源：4× A100 80GB',
    output: '实验方案设计：\n\n  数据集：\n    · ScienceQA（主实验）\n    · MMLU-Science（泛化测试）\n    · Custom-HypothesisGen（自建数据集，500 样本）\n\n  基线方法：\n    · GPT-4 Zero-shot\n    · GPT-4 + CoT\n    · Self-Refine (Madaan et al., 2023)\n    · LATS (Zhou et al., 2024)\n\n  评估指标：\n    · Accuracy, F1-Score\n    · Hypothesis Quality Score (HQS)\n    · Optimization Efficiency Ratio (OER)\n\n  实验配置：\n    · 3 次独立运行取平均\n    · 学习率搜索：{1e-5, 3e-5, 5e-5}\n    · Batch Size: 16, Epochs: 10',
    duration: '2-3 分钟',
    hasReview: false,
    status: 'completed',
    percent: 100,
    keyFindings: [
      '共设计 4 组对比实验 + 3 组消融实验',
      '预计总训练时间：约 6 小时（4×A100）',
      '自建数据集已通过质量审查',
    ],
  },
  {
    moduleId: 'M6',
    name: 'Agent 实验',
    input: 'M4 的实验代码\nM5 的实验方案\n远程 GPU 服务器连接信息\n实验配置文件（base.yaml + experiment.yaml）',
    output: '实验执行报告：\n\n  ✅ 实验 1/4: 主实验 — ScienceQA\n     · 训练完成，耗时 2h 15min\n     · Best Accuracy: 87.3%\n\n  ✅ 实验 2/4: 泛化测试 — MMLU-Science\n     · 测试完成，耗时 25min\n     · Accuracy: 82.1%\n\n  ✅ 实验 3/4: 消融实验 — w/o Bayesian Opt\n     · 训练完成，耗时 1h 50min\n     · Accuracy: 83.6% (↓3.7%)\n\n  ✅ 实验 4/4: 消融实验 — w/o Prompt Chain\n     · 训练完成，耗时 1h 45min\n     · Accuracy: 84.9% (↓2.4%)\n\n  总 GPU 时间：6h 55min\n  所有 checkpoint 已保存',
    duration: '10-30 分钟（取决于实验规模）',
    hasReview: false,
    status: 'completed',
    percent: 100,
    keyFindings: [
      '主方法在 ScienceQA 上超越所有基线',
      '消融实验验证了两个核心组件的有效性',
      'Agent 自动处理了 2 次 OOM 错误（自动调整 batch size）',
    ],
  },
  {
    moduleId: 'M7',
    name: '结果分析',
    input: 'M6 的全部实验结果数据\n4 组实验的训练日志和指标\n基线方法的对比数据\n统计显著性检验要求',
    output: '分析报告：\n\n  主要发现：\n    · 提出的 OptimLLM 在 ScienceQA 上达到 87.3% accuracy\n    · 超越最强基线 LATS 3.1 个百分点（p < 0.01）\n    · 在 MMLU-Science 泛化测试中保持 82.1% accuracy\n\n  生成图表：\n    · Figure 1: 主实验对比柱状图\n    · Figure 2: 消融实验结果表\n    · Figure 3: 训练收敛曲线\n    · Figure 4: 不同数据规模下的性能变化\n    · Table 1: 完整实验结果对比表\n    · Table 2: 计算效率对比\n\n  统计检验：\n    · 所有主要结果通过 paired t-test (p < 0.05)',
    duration: '3-5 分钟',
    hasReview: true,
    status: 'completed',
    percent: 100,
    keyFindings: [
      '人工审阅节点：用户可确认结果解读是否合理',
      '自动生成 6 张论文级别图表',
      '发现一个有趣的 scaling law 现象',
    ],
  },
  {
    moduleId: 'M8',
    name: '论文写作',
    input: 'M1 的文献综述\nM2-M3 的选题和 Idea\nM5 的实验设计\nM7 的结果分析报告和图表\n目标会议 NeurIPS 的格式要求\n参考文献 23 篇',
    output: '生成论文：\n\n  标题："OptimLLM: Automated Experiment Design Optimization\n         via Large Language Model Reasoning"\n\n  结构：\n    · Abstract (250 words)\n    · 1. Introduction (1.5 pages)\n    · 2. Related Work (1 page)\n    · 3. Method (2 pages)\n    · 4. Experiments (2.5 pages)\n    · 5. Analysis & Discussion (1 page)\n    · 6. Conclusion (0.5 page)\n    · References (23 citations)\n    · Appendix (2 pages)\n\n  总计约 8,500 字 / 12 页（含附录）\n  格式：LaTeX (NeurIPS 2025 template)',
    duration: '5-8 分钟',
    hasReview: false,
    status: 'completed',
    percent: 100,
    keyFindings: [
      '论文符合 NeurIPS 2025 格式要求',
      '自动处理参考文献格式（BibTeX）',
      '包含 6 张图表和 2 个算法伪代码',
    ],
  },
  {
    moduleId: 'M9',
    name: '评审打分',
    input: 'M8 生成的完整论文 PDF\nNeurIPS 2025 评审标准\n模拟 3 位不同背景的审稿人\n评审维度：新颖性、正确性、清晰度、意义、复现性',
    output: '模拟评审结果：\n\n  总分：7.2 / 10（弱接收 Weak Accept）\n\n  审稿人 1（ML 理论方向）：\n    · 评分: 7  · "方法新颖，但理论分析可以更深入"\n\n  审稿人 2（NLP 应用方向）：\n    · 评分: 8  · "实验充分，结果有说服力"\n\n  审稿人 3（AI for Science 方向）：\n    · 评分: 7  · "选题有价值，建议增加更多领域的实验"\n\n  维度评分：\n    · 新颖性: 7.5/10\n    · 正确性: 8.0/10\n    · 清晰度: 7.0/10\n    · 意义: 7.5/10\n    · 复现性: 6.5/10\n\n  改进建议：\n    1. 增加理论收敛性分析\n    2. 补充更多领域的实验验证\n    3. 改善 Section 3 的符号一致性',
    duration: '3-5 分钟',
    hasReview: false,
    status: 'completed',
    percent: 100,
    keyFindings: [
      '总体评价：弱接收，有修改后录用的潜力',
      '最大优势：实验设计充分',
      '最大弱点：理论分析不够深入',
    ],
  },
];

/* ── Demo 任务 ── */
export const DEMO_TASK: Task = {
  id: 'demo-task-001',
  title: 'LLM 在科学发现中的应用研究',
  topic: '请帮我对大语言模型在科学发现中的应用进行全面研究，目标投稿 NeurIPS 2025',
  description: '研究领域: NLP / 自然语言处理\n目标会议/期刊: NeurIPS\n运行模块: M1→M9 完整流程',
  status: 'completed',
  current_module: undefined,
  modules: DEMO_MODULE_IO.map((m): ModuleProgress => ({
    module_id: m.moduleId,
    status: m.status,
    percent: m.percent,
    step: m.status === 'completed' ? '已完成' : m.status === 'running' ? '执行中' : '等待中',
    message: m.status === 'completed'
      ? `${m.name}模块已完成`
      : m.status === 'running'
        ? `正在执行${m.name}...`
        : `等待前置模块完成`,
    started_at: '2025-03-31T10:00:00Z',
    finished_at: m.status === 'completed' ? '2025-03-31T10:45:00Z' : undefined,
  })),
  created_at: '2025-03-31T10:00:00Z',
  updated_at: '2025-03-31T10:45:00Z',
  completed_at: '2025-03-31T10:45:00Z',
};

/* ── Demo 任务（运行中状态） ── */
export const DEMO_TASK_RUNNING: Task = {
  id: 'demo-task-002',
  title: '多模态学习研究空白探索',
  topic: '帮我在多模态学习领域寻找研究空白并提出创新想法',
  description: '研究领域: 多模态学习\n目标会议/期刊: ICLR',
  status: 'running',
  current_module: 'M4',
  modules: [
    { module_id: 'M1', status: 'completed', percent: 100, step: '已完成', message: '文献调研完成，检索到 45 篇论文', started_at: '2025-03-31T11:00:00Z', finished_at: '2025-03-31T11:06:00Z' },
    { module_id: 'M2', status: 'completed', percent: 100, step: '已完成', message: '生成 4 个候选选题', started_at: '2025-03-31T11:06:00Z', finished_at: '2025-03-31T11:10:00Z' },
    { module_id: 'M3', status: 'completed', percent: 100, step: '已完成', message: 'Idea 评分完成，选定方案 #2', started_at: '2025-03-31T11:10:00Z', finished_at: '2025-03-31T11:13:00Z' },
    { module_id: 'M4', status: 'running', percent: 65, step: '代码生成中', message: '正在生成 model.py...', started_at: '2025-03-31T11:13:00Z' },
    { module_id: 'M5', status: 'waiting', percent: 0, step: '等待中', message: '等待 M4 完成' },
    { module_id: 'M6', status: 'waiting', percent: 0, step: '等待中', message: '等待前置模块' },
    { module_id: 'M7', status: 'waiting', percent: 0, step: '等待中', message: '等待前置模块' },
    { module_id: 'M8', status: 'waiting', percent: 0, step: '等待中', message: '等待前置模块' },
    { module_id: 'M9', status: 'waiting', percent: 0, step: '等待中', message: '等待前置模块' },
  ],
  created_at: '2025-03-31T11:00:00Z',
  updated_at: '2025-03-31T11:15:00Z',
};

/* ── Demo 日志 ── */
export const DEMO_LOGS: LogEntry[] = [
  { id: 'log-001', task_id: 'demo-task-001', module_id: 'M1', level: 'info', message: '[M1] 开始文献检索... 关键词: LLM, Scientific Discovery, Automated Research', timestamp: '2025-03-31T10:00:15Z' },
  { id: 'log-002', task_id: 'demo-task-001', module_id: 'M1', level: 'info', message: '[M1] Semantic Scholar API 返回 234 条结果', timestamp: '2025-03-31T10:01:00Z' },
  { id: 'log-003', task_id: 'demo-task-001', module_id: 'M1', level: 'info', message: '[M1] arXiv 检索完成，新增 89 条结果', timestamp: '2025-03-31T10:01:30Z' },
  { id: 'log-004', task_id: 'demo-task-001', module_id: 'M1', level: 'info', message: '[M1] 去重后共 67 篇唯一论文', timestamp: '2025-03-31T10:02:00Z' },
  { id: 'log-005', task_id: 'demo-task-001', module_id: 'M1', level: 'info', message: '[M1] 相关性评分筛选... 保留 23 篇核心文献', timestamp: '2025-03-31T10:03:00Z' },
  { id: 'log-006', task_id: 'demo-task-001', module_id: 'M1', level: 'info', message: '[M1] ✅ 文献综述生成完成（3,247 字）', timestamp: '2025-03-31T10:05:00Z' },
  { id: 'log-007', task_id: 'demo-task-001', module_id: 'M2', level: 'info', message: '[M2] 开始分析研究空白...', timestamp: '2025-03-31T10:05:15Z' },
  { id: 'log-008', task_id: 'demo-task-001', module_id: 'M2', level: 'info', message: '[M2] 识别到 5 个潜在研究方向', timestamp: '2025-03-31T10:06:30Z' },
  { id: 'log-009', task_id: 'demo-task-001', module_id: 'M2', level: 'info', message: '[M2] ✅ 生成 5 个候选研究选题', timestamp: '2025-03-31T10:08:00Z' },
  { id: 'log-010', task_id: 'demo-task-001', module_id: 'M3', level: 'info', message: '[M3] 启动多角色评审（3 位模拟审稿人）', timestamp: '2025-03-31T10:08:15Z' },
  { id: 'log-011', task_id: 'demo-task-001', module_id: 'M3', level: 'warn', message: '[M3] ⏸ 需要人工审阅 — 请确认 Idea 选择', timestamp: '2025-03-31T10:10:00Z' },
  { id: 'log-012', task_id: 'demo-task-001', module_id: 'M3', level: 'info', message: '[M3] 用户已确认选择 Idea #1', timestamp: '2025-03-31T10:12:00Z' },
  { id: 'log-013', task_id: 'demo-task-001', module_id: 'M3', level: 'info', message: '[M3] ✅ Idea 打分完成，最终选定: "LLM 驱动的实验方案自动优化"', timestamp: '2025-03-31T10:12:30Z' },
  { id: 'log-014', task_id: 'demo-task-001', module_id: 'M4', level: 'info', message: '[M4] 开始生成项目代码框架...', timestamp: '2025-03-31T10:12:45Z' },
  { id: 'log-015', task_id: 'demo-task-001', module_id: 'M4', level: 'info', message: '[M4] 生成 main.py, model.py, train.py...', timestamp: '2025-03-31T10:14:00Z' },
  { id: 'log-016', task_id: 'demo-task-001', module_id: 'M4', level: 'info', message: '[M4] ✅ 代码生成完成（1,200 行，12 个单元测试）', timestamp: '2025-03-31T10:17:00Z' },
  { id: 'log-017', task_id: 'demo-task-001', module_id: 'M5', level: 'info', message: '[M5] 设计实验方案...', timestamp: '2025-03-31T10:17:15Z' },
  { id: 'log-018', task_id: 'demo-task-001', module_id: 'M5', level: 'info', message: '[M5] ✅ 实验方案设计完成（4 组对比 + 3 组消融）', timestamp: '2025-03-31T10:19:00Z' },
  { id: 'log-019', task_id: 'demo-task-001', module_id: 'M6', level: 'info', message: '[M6] 连接远程 GPU 服务器（4× A100）...', timestamp: '2025-03-31T10:19:15Z' },
  { id: 'log-020', task_id: 'demo-task-001', module_id: 'M6', level: 'info', message: '[M6] 实验 1/4 开始: ScienceQA 主实验', timestamp: '2025-03-31T10:20:00Z' },
  { id: 'log-021', task_id: 'demo-task-001', module_id: 'M6', level: 'warn', message: '[M6] ⚠ 检测到 OOM，自动将 batch_size 从 32 调整为 16', timestamp: '2025-03-31T10:25:00Z' },
  { id: 'log-022', task_id: 'demo-task-001', module_id: 'M6', level: 'info', message: '[M6] 实验 1/4 完成: Accuracy 87.3%', timestamp: '2025-03-31T10:35:00Z' },
  { id: 'log-023', task_id: 'demo-task-001', module_id: 'M6', level: 'info', message: '[M6] ✅ 全部 4 组实验完成，总 GPU 时间 6h 55min', timestamp: '2025-03-31T10:38:00Z' },
  { id: 'log-024', task_id: 'demo-task-001', module_id: 'M7', level: 'info', message: '[M7] 开始分析实验结果...', timestamp: '2025-03-31T10:38:15Z' },
  { id: 'log-025', task_id: 'demo-task-001', module_id: 'M7', level: 'info', message: '[M7] 生成 6 张论文级别图表', timestamp: '2025-03-31T10:39:30Z' },
  { id: 'log-026', task_id: 'demo-task-001', module_id: 'M7', level: 'warn', message: '[M7] ⏸ 需要人工审阅 — 请确认结果分析', timestamp: '2025-03-31T10:40:00Z' },
  { id: 'log-027', task_id: 'demo-task-001', module_id: 'M7', level: 'info', message: '[M7] 用户已确认结果分析', timestamp: '2025-03-31T10:41:00Z' },
  { id: 'log-028', task_id: 'demo-task-001', module_id: 'M7', level: 'info', message: '[M7] ✅ 结果分析完成', timestamp: '2025-03-31T10:41:30Z' },
  { id: 'log-029', task_id: 'demo-task-001', module_id: 'M8', level: 'info', message: '[M8] 开始撰写论文（NeurIPS 2025 模板）...', timestamp: '2025-03-31T10:41:45Z' },
  { id: 'log-030', task_id: 'demo-task-001', module_id: 'M8', level: 'info', message: '[M8] ✅ 论文写作完成（12 页，8,500 字）', timestamp: '2025-03-31T10:44:00Z' },
  { id: 'log-031', task_id: 'demo-task-001', module_id: 'M9', level: 'info', message: '[M9] 启动模拟 Peer Review（3 位审稿人）...', timestamp: '2025-03-31T10:44:15Z' },
  { id: 'log-032', task_id: 'demo-task-001', module_id: 'M9', level: 'info', message: '[M9] ✅ 评审完成 — 总分 7.2/10 (Weak Accept)', timestamp: '2025-03-31T10:45:00Z' },
];

/* ── Demo 评审结果 ── */
export const DEMO_REVIEW_RESULT: ReviewResult = {
  task_id: 'demo-task-001',
  overall_score: 7.2,
  decision: 'weak_accept',
  dimensions: [
    { name: '新颖性 (Novelty)', score: 7.5, max_score: 10, comment: '将 LLM 推理与贝叶斯优化结合用于实验设计是一个有趣的方向，但需要更多理论支撑。' },
    { name: '正确性 (Soundness)', score: 8.0, max_score: 10, comment: '实验设计合理，统计检验充分，结果可信。' },
    { name: '清晰度 (Clarity)', score: 7.0, max_score: 10, comment: 'Section 3 的符号使用不够一致，建议统一数学符号体系。' },
    { name: '意义 (Significance)', score: 7.5, max_score: 10, comment: '对 AI for Science 领域有一定推动作用，但需要更多跨领域验证。' },
    { name: '复现性 (Reproducibility)', score: 6.5, max_score: 10, comment: '代码已开源，但部分实验依赖私有 API，建议提供替代方案。' },
  ],
  summary: '本文提出了 OptimLLM，一个基于大语言模型推理的实验方案自动优化框架。方法将 Prompt Chain 与贝叶斯优化相结合，在 ScienceQA 数据集上取得了 87.3% 的准确率，超越现有最强基线 3.1 个百分点。实验设计充分，包含完整的消融实验。主要不足在于理论分析深度不够，以及跨领域泛化实验有限。建议在修改后重新提交。',
  created_at: '2025-03-31T10:45:00Z',
};
