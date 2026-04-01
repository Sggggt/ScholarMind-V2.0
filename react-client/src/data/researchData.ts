import type {
  ChatMessage,
  ExperimentDesignState,
  ExperimentResult,
  ExplorationState,
  IdeaCandidate,
  LiteratureFilters,
  PaperRecord,
  RankedPaper,
  RecentSession,
  RelationNode,
  RepositoryFile,
  ResearchGap,
  RunLog,
  RunStep,
  TrendEvent,
  UserProfile,
  ValidationClaim,
  WritingSection,
} from '../types/app';

export const recentSessions: RecentSession[] = [
  {
    id: 'session-1',
    title: '医学影像联邦学习稳健性研究',
    domain: '多机构医学影像协同训练',
    updatedAt: '今天 21:08',
    stageLabel: '趋势分析',
  },
  {
    id: 'session-2',
    title: '科研知识发现中的图谱模型',
    domain: '图检索模型与学术知识发现',
    updatedAt: '昨天 16:40',
    stageLabel: '实验设计',
  },
  {
    id: 'session-3',
    title: '可信大模型评测协议',
    domain: '评测流程与审稿标准',
    updatedAt: '03-28 09:12',
    stageLabel: '论文写作',
  },
];

export const userProfile: UserProfile = {
  name: '林博士',
  role: '首席研究员',
  affiliation: 'ScholarMind 实验室',
};

export const initialChatMessages: ChatMessage[] = [
  {
    id: 'm1',
    role: 'assistant',
    timestamp: '09:12',
    content:
      '已整理当前会话的研究脉络。趋势分析显示，联邦学习在数据异构与跨域泛化上存在方法断层，这个结果可以直接推进到研究缺口页面。',
    quickActions: [
      { label: '进入领域探索', path: '/exploration', stageId: 'exploration' },
      { label: '转到文献采集', path: '/literature', stageId: 'literature' },
      { label: '查看研究缺口', path: '/gaps', stageId: 'gaps' },
    ],
  },
  {
    id: 'm2',
    role: 'user',
    timestamp: '09:14',
    content: '把现有趋势总结成三个最有价值的研究缺口，并说明为什么值得做。',
  },
  {
    id: 'm3',
    role: 'assistant',
    timestamp: '09:15',
    content:
      '我建议优先关注跨中心标签稀缺场景下的泛化鲁棒性。它同时满足临床落地性、证据基础和后续实验可执行性，适合继续推进到想法生成和实验设计。',
    quickActions: [
      { label: '生成候选想法', path: '/ideas', stageId: 'ideas' },
      { label: '生成实验设计', path: '/experiment', stageId: 'experiment' },
      { label: '查看研究缺口', path: '/gaps', stageId: 'gaps' },
    ],
  },
];

export const explorationState: ExplorationState = {
  topic: '医学影像联邦学习的跨域泛化与稳健性',
  summary:
    '当前主题聚焦于多中心医学影像联邦学习中的跨域泛化问题。真正的研究机会不在于重复证明联邦学习有效，而在于识别它在数据异构、标签稀缺与部署迁移阶段何时失效，以及为什么失效。',
  keywords: ['联邦学习', '医学影像', '跨域泛化', '标签稀缺', '稳健性评估'],
  directions: [
    '异构中心之间的参数对齐策略',
    '标签稀缺下的自监督迁移',
    '跨模态影像的一致性建模',
    '证据驱动的泛化评测协议',
  ],
  authors: ['张晨', '李沐阳', '周宜凡', '王知远'],
  institutions: ['清华大学', '北京大学', '上海交通大学', '中山大学'],
  insight:
    '近两年的论文明显从“提升平均指标”转向“解释为什么泛化失败”。这意味着完成趋势分析之后，最自然的下游动作不是继续扩展文献，而是提炼研究缺口并尽快进入实验设计。',
};

export const literatureFilters: LiteratureFilters = {
  topic: '医学影像联邦学习的跨域泛化与稳健性',
  keywords: '联邦学习, 医学影像, 泛化, 标签稀缺',
  yearStart: 2020,
  yearEnd: 2025,
};

export const paperRecords: PaperRecord[] = [
  {
    id: 'paper-1',
    title: '跨中心医学影像联邦学习中的稳健聚合方法',
    source: 'Semantic Scholar',
    year: 2024,
    authors: '刘晨 等',
    focus: '稳健聚合',
    status: 'selected',
    citations: 62,
    abstract:
      '提出一种面向异构医院数据的稳健聚合策略，在标签不均衡和特征偏移条件下仍能维持较稳定的性能。',
  },
  {
    id: 'paper-2',
    title: '标签稀缺场景下的联邦迁移学习框架',
    source: 'arXiv',
    year: 2025,
    authors: 'Mendez 与 Park',
    focus: '跨域迁移',
    status: 'queued',
    citations: 21,
    abstract:
      '研究当目标中心标注极少时，源中心学习到的表示能否保持有效迁移，并讨论不确定性建模的作用。',
  },
  {
    id: 'paper-3',
    title: '医疗场景中的联邦学习可信评测机制',
    source: 'Crossref',
    year: 2023,
    authors: 'Farah 等',
    focus: '可信评测',
    status: 'extracted',
    citations: 88,
    abstract:
      '从部署风险和可解释性视角讨论联邦学习模型在真实医疗场景中的评测标准，强调证据链的重要性。',
  },
  {
    id: 'paper-4',
    title: '多模态医学影像中的低信号鲁棒学习',
    source: 'PubMed',
    year: 2022,
    authors: 'Velasquez 等',
    focus: '低信号鲁棒性',
    status: 'queued',
    citations: 39,
    abstract:
      '比较低质量影像与缺失标签条件下的多种鲁棒学习策略，为后续基线设计提供参考。',
  },
];

export const extractionSections = [
  {
    id: 'contributions',
    label: '核心贡献',
    summary:
      '该论文指出，稳健聚合的真正价值不在于提升单一中心精度，而在于减轻跨中心特征漂移带来的性能崩塌。',
    quotes: [
      '在强异构场景下，动态聚合权重显著优于固定平均策略。',
      '只有在引入中心置信估计后，跨域性能才呈现稳定提升。',
    ],
  },
  {
    id: 'methods',
    label: '方法设计',
    summary:
      '方法把各中心的局部特征统计、标签分布与训练稳定性联合建模，用于调节全局参数更新。',
    quotes: [
      '最终模型将局部特征偏移量作为聚合权重估计的一部分。',
      '分层更新策略减少了异常中心对全局模型的干扰。',
    ],
  },
  {
    id: 'findings',
    label: '主要发现',
    summary:
      '性能提升主要体现在标签稀缺和中心差异显著的场景，但当目标中心几乎没有标注时，模型仍然存在明显退化。',
    quotes: [
      '最大的收益出现在异构程度高且样本数量不均衡的任务上。',
      '如果没有显式不确定性建模，跨中心迁移依旧脆弱。',
    ],
  },
];

export const extractionRelations: RelationNode[] = [
  { source: '数据异构', relation: '导致', target: '全局模型漂移' },
  { source: '中心置信估计', relation: '稳定', target: '聚合权重' },
  { source: '标签稀缺', relation: '削弱', target: '跨域迁移表现' },
  { source: '可解释评测', relation: '支撑', target: '可信部署判断' },
];

export const trendEvents: TrendEvent[] = [
  {
    year: '2021',
    title: '基础联邦框架成熟',
    summary: '研究重点集中在标准聚合流程和多中心协同训练的可行性验证。',
  },
  {
    year: '2022',
    title: '异构问题开始凸显',
    summary: '论文开始系统讨论非独立同分布数据对全局模型的影响。',
  },
  {
    year: '2024',
    title: '稳健性评测升温',
    summary: '跨域泛化与部署可靠性成为比单点精度更重要的话题。',
  },
  {
    year: '2025',
    title: '标签稀缺成为瓶颈',
    summary: '如何在低标注中心保持泛化能力，开始成为新的主轴。',
  },
];

export const hotDirections = ['异构中心稳健聚合', '标签稀缺迁移学习', '可解释评测协议', '低资源跨域泛化'];

export const rankedPapers: RankedPaper[] = [
  {
    id: 'rank-1',
    title: '标签稀缺场景下的联邦迁移学习框架',
    signal: '前瞻相关性最高',
    rationale: '直接回应当前最突出的泛化瓶颈，适合作为研究缺口提炼的核心依据。',
  },
  {
    id: 'rank-2',
    title: '医疗场景中的联邦学习可信评测机制',
    signal: '概念桥接最强',
    rationale: '把方法结果与真实部署约束连接起来，适合支撑后续验证设计。',
  },
  {
    id: 'rank-3',
    title: '跨中心医学影像联邦学习中的稳健聚合方法',
    signal: '实证支撑最强',
    rationale: '给出了当前最清晰、最可落地的稳健聚合实现路径。',
  },
];

export const researchGaps: ResearchGap[] = [
  {
    id: 'gap-1',
    title: '跨中心泛化鲁棒性的机制仍不清晰',
    whyItMatters:
      '现有方法往往在单一机构内表现尚可，但一旦中心分布变化，性能下降的原因和边界仍然缺乏清晰解释。',
    risk: '如果不先澄清鲁棒性机制，后续模型改进很容易陷入针对特定数据集的过拟合。',
    tags: ['泛化', '部署'],
    score: 89,
    recommendation: '优先围绕跨中心分布偏移下的性能退化规律建立系统实验。',
  },
  {
    id: 'gap-2',
    title: '可信评测尚未真正嵌入联邦学习方法设计',
    whyItMatters:
      '大量工作只报告准确率或 Dice 指标，缺少对风险、可解释性与真实部署可信度的同步评估。',
    risk: '如果评测维度不完整，即使主指标提升，也难以支撑临床场景落地。',
    tags: ['可解释性', '可信'],
    score: 84,
    recommendation: '在后续实验中引入证据链、风险暴露和跨中心失效案例分析。',
  },
  {
    id: 'gap-3',
    title: '标签稀缺场景下的鲁棒学习基线仍然不足',
    whyItMatters:
      '真实医疗中心往往标注有限、分布差异大，但现有研究对这类条件的系统比较仍然偏少。',
    risk: '如果基线不足，就很难判断改进究竟来自模型设计还是数据条件差异。',
    tags: ['低资源', '基线'],
    score: 78,
    recommendation: '补齐低标签中心、多中心噪声与迁移失败场景下的对照实验。',
  },
];

export const ideaCandidates: IdeaCandidate[] = [
  {
    id: 'idea-1',
    title: '构建带证据链的跨中心稳健评测框架',
    premise:
      '把泛化性能、失效案例和可信指标统一到一个联邦学习评测框架中，提升方法比较的可解释性。',
    innovation: 8.8,
    feasibility: 8.1,
    evidenceStrength: 8.4,
    risk: 3.9,
    recommended: true,
  },
  {
    id: 'idea-2',
    title: '面向标签稀缺中心的联邦迁移基准',
    premise: '设计统一 benchmark，系统测量不同联邦迁移方法在低标注中心上的泛化能力。',
    innovation: 8.2,
    feasibility: 7.3,
    evidenceStrength: 8.0,
    risk: 5.1,
    recommended: false,
  },
  {
    id: 'idea-3',
    title: '异构中心条件下的稳健聚合策略改进',
    premise: '围绕中心置信估计和参数对齐策略，提出适用于强异构场景的新型聚合方法。',
    innovation: 7.6,
    feasibility: 8.5,
    evidenceStrength: 7.1,
    risk: 4.6,
    recommended: false,
  },
];

export const repositoryFiles: RepositoryFile[] = [
  {
    id: 'repo-readme',
    label: 'README.md',
    kind: 'file',
    language: 'markdown',
    preview: `# ScholarMind 实验资料结构

本资料库围绕“医学影像联邦学习的跨域泛化与稳健性”组织：

- data/: 预处理后的多中心影像数据说明
- prompts/: 证据链与实验记录模板
- experiments/: 基线与候选方案配置
- reports/: 结果分析与阶段总结
`,
  },
  {
    id: 'repo-config',
    label: 'experiments/config.yaml',
    kind: 'file',
    language: 'yaml',
    preview: `dataset: med_federated_multicenter_v3
model: robust_generalization_policy
baseline: fedavg_sparse_label
metrics:
  - auc
  - cross_domain_gap
  - robustness_score
runtime:
  accelerator: a10g
  seed: 42
`,
  },
  {
    id: 'repo-prompt',
    label: 'prompts/intervention.md',
    kind: 'file',
    language: 'markdown',
    preview: `## 实验推进说明

当发现跨中心性能明显下滑时：

1. 先确认数据分布差异。
2. 汇总失败案例与证据说明。
3. 再推进到新的稳健策略实验。
`,
  },
];

export const experimentDesign: ExperimentDesignState = {
  dataset: 'med_federated_multicenter_v3',
  model: 'robust_generalization_policy',
  baseline: 'fedavg_sparse_label',
  metrics: ['auc', 'cross_domain_gap', 'robustness_score'],
  runtime: '1 张 A10G / 6 小时 / 固定随机种子',
  hypothesis:
    '引入证据链和中心置信估计的稳健策略，可以在不牺牲主指标的前提下显著改善跨中心泛化表现。',
};

export const runSteps: RunStep[] = [
  { id: 'step-1', label: '加载数据并完成中心归一化', status: 'completed' },
  { id: 'step-2', label: '组装证据链与实验配置', status: 'completed' },
  { id: 'step-3', label: '运行基线与候选方案', status: 'in-progress' },
  { id: 'step-4', label: '汇总指标与错误案例', status: 'not-started' },
];

export const initialRunLogs: RunLog[] = [
  {
    id: 'log-1',
    level: 'info',
    timestamp: '09:41:11',
    message: '数据加载完成，预处理后可用样本共 18,420 条。',
  },
  {
    id: 'log-2',
    level: 'info',
    timestamp: '09:41:48',
    message: '证据链模板与实验配置已完成编译，共覆盖 3 类候选方案。',
  },
  {
    id: 'log-3',
    level: 'warning',
    timestamp: '09:42:15',
    message: '检测到低标签中心批次，12 个会话已自动下调置信权重。',
  },
];

export const experimentResults: ExperimentResult[] = [
  {
    id: 'res-1',
    label: '证据链稳健策略',
    metrics: {
      auc: '0.842',
      cross_domain_gap: '-14.1%',
      robustness_score: '0.81',
    },
    interpretation:
      '候选方案在保持主指标稳定的同时，显著缩小了跨中心性能差距，说明稳健策略具有继续深挖的价值。',
    errorCases: ['低标签中心仍然会出现偏保守的预测输出。', '极端分布偏移条件下，聚合稳定性仍有下降。'],
  },
  {
    id: 'res-2',
    label: '传统基线方案',
    metrics: {
      auc: '0.819',
      cross_domain_gap: '-3.8%',
      robustness_score: '0.76',
    },
    interpretation:
      '基线方案在单点指标上尚可，但跨中心稳定性不足，且对失败原因缺乏解释支撑。',
    errorCases: ['分布偏移一旦放大，目标中心性能下滑更快。', '失败案例缺乏清晰证据链，难以支撑后续改进判断。'],
  },
];

export const writingSections: WritingSection[] = [
  {
    id: 'section-1',
    label: '引言',
    outline: '说明医学影像联邦学习中跨域泛化与稳健性的研究意义。',
    content:
      '医学影像联邦学习越来越多地被用于多中心协同训练，但仅报告平均性能已不足以支撑真实部署。研究者更需要解释模型在何种异构条件下失效，以及为什么失效。',
    evidence: ['趋势分析总结', '研究缺口二：可信评测'],
  },
  {
    id: 'section-2',
    label: '方法',
    outline: '说明候选稳健策略、数据集设置与基线方案。',
    content:
      '本文比较带证据链与中心置信估计的稳健策略和传统基线方案，使用多中心医学影像数据集进行跨域泛化评测。',
    evidence: ['资料库配置', '实验设计假设'],
  },
  {
    id: 'section-3',
    label: '结果',
    outline: '把指标变化与跨中心失效案例联系起来分析。',
    content:
      '候选方案在跨中心差距和鲁棒性指标上都优于传统基线，收益在异构程度较高且仍存在有效标注支撑的中心中最明显。',
    evidence: ['结果对比', '运行警告'],
  },
];

export const validationClaims: ValidationClaim[] = [
  {
    id: 'claim-1',
    claim: '带证据链的稳健策略在跨中心泛化上优于传统基线。',
    evidence: ['结果指标：cross_domain_gap -14.1%', '写作章节：结果'],
    reviewerNote: '需要补一处说明，明确跨中心差距的计算方式。',
    risk: 'medium',
  },
  {
    id: 'claim-2',
    claim: '该策略在强异构中心条件下具有更好的鲁棒性。',
    evidence: ['趋势分析洞察', '研究缺口一：泛化机制'],
    reviewerNote: '现有证据更偏支持性，措辞应避免过强结论。',
    risk: 'high',
  },
  {
    id: 'claim-3',
    claim: '标签稀缺中心会显著拉低模型稳定性。',
    evidence: ['运行日志警告', '错误案例汇总'],
    reviewerNote: '结论基本成立，但仍需在附录中补充直接证据引用。',
    risk: 'low',
  },
];
