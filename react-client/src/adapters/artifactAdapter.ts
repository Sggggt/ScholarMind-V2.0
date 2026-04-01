import type {
  ExplorationState,
  ExperimentResult,
  ExtractionSection,
  IdeaCandidate,
  LiteratureFilters,
  PaperRecord,
  RankedPaper,
  RelationNode,
  RepositoryFile,
  ResearchGap,
  TrendEvent,
  ValidationClaim,
  WritingSection,
} from '../types/app';
import type { BackendRepoTreeNode, BackendReviewReportResponse } from '../types/backend';

function asObject(value: unknown) {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asArray<T = unknown>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function readNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function cleanText(text: string) {
  return text
    .replace(/```(?:json|markdown|md|text)?/gi, '')
    .replace(/#+\s*/g, '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatInlineValue(value: unknown): string {
  if (typeof value === 'string') {
    return cleanText(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatInlineValue(item)).filter(Boolean).join(', ');
  }

  if (typeof value === 'object' && value !== null) {
    const object = value as Record<string, unknown>;
    const preferred = pickText(object, [
      'summary',
      'description',
      'analysis',
      'comment',
      'content',
      'evidence',
      'Experiment',
      'problem',
      'method',
      'title',
    ]);
    if (preferred) {
      return preferred;
    }

    return Object.entries(object)
      .slice(0, 4)
      .map(([key, item]) => `${key}: ${formatInlineValue(item)}`)
      .join(', ');
  }

  return '';
}

function pickText(source: Record<string, unknown>, keys: string[], fallback = '') {
  for (const key of keys) {
    const value = source[key];
    const text = formatInlineValue(value);
    if (text) {
      return text;
    }
  }

  return fallback;
}

function summarizeMarkdown(markdown: string, paragraphCount: number) {
  return cleanText(markdown)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .slice(0, paragraphCount)
    .join(' ');
}

function inferSourceName(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname || '网页来源';
  } catch {
    return '网页来源';
  }
}

function inferYear(text: string, fallback: number) {
  const match = text.match(/20\d{2}/);
  return match ? Number(match[0]) : fallback;
}

function readAuthors(source: Record<string, unknown>) {
  const authors = source.authors;
  if (Array.isArray(authors)) {
    return authors
      .map((author) => (typeof author === 'string' ? author : pickText(asObject(author), ['name'])))
      .filter(Boolean)
      .join('、');
  }

  return pickText(source, ['authors', 'author'], '作者信息待补充');
}

function formatMetricValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.abs(value) < 1 ? value.toFixed(3) : value.toFixed(2);
  }

  return String(value);
}

export function adaptLiteratureArtifacts(
  topic: string,
  reviewMarkdown: string,
  sourcesPayload: unknown,
): {
  summary: string;
  papers: PaperRecord[];
  filters: LiteratureFilters;
  selectedSources: string[];
} {
  const payload = asObject(sourcesPayload);
  const sources = asArray<Record<string, unknown>>(payload.sources);
  const currentYear = new Date().getFullYear();

  const papers = sources.map((source, index) => {
    const title = pickText(source, ['title', 'Title'], `文献 ${index + 1}`);
    const preview = pickText(source, ['content_preview', 'snippet', 'summary', 'abstract']);
    const url = readString(source.url);
    const sourceName = pickText(source, ['source'], inferSourceName(url));

    return {
      id: `paper-${index + 1}`,
      title,
      source: sourceName,
      year: inferYear(`${title} ${preview}`, currentYear - (index % 5)),
      authors: readAuthors(source),
      focus: pickText(source, ['query', 'topic', 'keywords'], topic || '当前研究主题'),
      status: index === 0 ? 'selected' : index < 3 ? 'extracted' : 'queued',
      citations: readNumber(source.citations, 0),
      abstract:
        preview || '当前来源没有提供结构化摘要，建议继续查看原始链接或文献综述正文。',
    } satisfies PaperRecord;
  });

  const filters: LiteratureFilters = {
    topic,
    keywords: topic,
    yearStart: papers.length ? Math.min(...papers.map((paper) => paper.year)) : currentYear - 5,
    yearEnd: papers.length ? Math.max(...papers.map((paper) => paper.year)) : currentYear,
  };

  return {
    summary: summarizeMarkdown(reviewMarkdown, 3),
    papers,
    filters,
    selectedSources: Array.from(new Set(papers.map((paper) => paper.source))).slice(0, 4),
  };
}

export function adaptExplorationArtifacts(
  topic: string,
  description: string,
  reviewMarkdown: string,
  papers: PaperRecord[],
): ExplorationState {
  const keywords = Array.from(
    new Set(
      [topic, description]
        .join(' ')
        .split(/[\s,，。]+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 1),
    ),
  ).slice(0, 6);

  return {
    topic: topic || '等待输入研究主题',
    summary: summarizeMarkdown(reviewMarkdown, 2) || description || topic,
    keywords,
    directions: papers.slice(0, 4).map((paper) => paper.title),
    authors: papers.slice(0, 4).map((paper) => paper.authors || paper.source),
    institutions: papers.slice(0, 4).map((paper) => paper.source),
    insight:
      cleanText(reviewMarkdown)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(2, 5)
        .join(' ') || '当前洞察会随着真实文献与趋势产物继续更新。',
  };
}

export function adaptExtractionArtifacts(reviewMarkdown: string, papers: PaperRecord[]): {
  sections: ExtractionSection[];
  relations: RelationNode[];
} {
  const paragraphs = cleanText(reviewMarkdown)
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  const sectionLabels = ['核心贡献', '方法设计', '主要发现'];
  const sectionIds = ['contributions', 'methods', 'findings'];

  const sections = sectionLabels.map((label, index) => ({
    id: sectionIds[index],
    label,
    summary: paragraphs[index] ?? papers[index]?.abstract ?? '当前产物还没有生成对应的提取摘要。',
    quotes: papers
      .slice(index, index + 2)
      .map((paper) => paper.abstract)
      .filter(Boolean)
      .slice(0, 2),
  }));

  const relations: RelationNode[] = papers.slice(0, 4).map((paper, index) => ({
    source: paper.focus,
    relation: index % 2 === 0 ? '支持' : '提示',
    target: paper.title,
  }));

  return { sections, relations };
}

export function adaptTrendArtifacts(papers: PaperRecord[], gaps: ResearchGap[]): {
  trendEvents: TrendEvent[];
  hotDirections: string[];
  rankedPapers: RankedPaper[];
} {
  const yearMap = new Map<number, number>();
  papers.forEach((paper) => {
    yearMap.set(paper.year, (yearMap.get(paper.year) ?? 0) + 1);
  });

  const trendEvents = Array.from(yearMap.entries())
    .sort(([left], [right]) => left - right)
    .map(([year, count]) => ({
      year: String(year),
      title: `${count} 篇相关工作进入研究视野`,
      summary: `围绕 ${papers[0]?.focus ?? '当前主题'} 的证据在这一时间点出现明显累积。`,
    }));

  const hotDirections = gaps.slice(0, 4).flatMap((gap) => gap.tags).filter(Boolean);
  const rankedPapers: RankedPaper[] = papers.slice(0, 3).map((paper) => ({
    id: paper.id,
    title: paper.title,
    signal: `${paper.source} · ${paper.year}`,
    rationale: paper.abstract || '当前只有来源预览，建议继续在原文中核查细节。',
  }));

  return {
    trendEvents,
    hotDirections: hotDirections.length ? hotDirections : ['文献覆盖正在增长', '建议结合缺口分析继续提炼方向'],
    rankedPapers,
  };
}

export function adaptGapArtifacts(payload: unknown): ResearchGap[] {
  const data = asObject(payload);
  const gaps = asArray<Record<string, unknown>>(data.gaps);

  return gaps.map((gap, index) => {
    const category = pickText(gap, ['category'], `方向 ${index + 1}`);
    const impact = pickText(gap, ['potential_impact'], 'medium');
    const difficulty = pickText(gap, ['difficulty'], 'medium');
    const impactScore = impact === 'high' ? 88 : impact === 'medium' ? 74 : 60;
    const difficultyPenalty = difficulty === 'high' ? 8 : difficulty === 'medium' ? 4 : 0;

    return {
      id: `gap-${index + 1}`,
      title: pickText(gap, ['description', 'title'], `研究缺口 ${index + 1}`).slice(0, 48),
      whyItMatters: pickText(gap, ['evidence', 'description'], '当前缺少更具体的证据说明。'),
      risk: `实施难度：${difficulty || '待评估'}`,
      tags: [category, impact].filter(Boolean),
      score: Math.max(40, impactScore - difficultyPenalty),
      recommendation: pickText(
        gap,
        ['recommendation', 'description'],
        '建议结合当前缺口继续推进到构思生成与实验设计。',
      ),
    };
  });
}

export function adaptIdeaArtifacts(payload: unknown): IdeaCandidate[] {
  const data = asObject(payload);
  const ideas = asArray<Record<string, unknown>>(data.scored_ideas);
  const bestIdeaIndex = readNumber(data.best_idea_index, 0);

  return ideas.map((idea, index) => {
    const scores = asObject(idea.scores);

    return {
      id: `idea-${index + 1}`,
      title: pickText(idea, ['title', 'Title'], `候选想法 ${index + 1}`),
      premise: pickText(
        idea,
        ['method', 'problem', 'experiment_plan', 'key_innovation'],
        '当前想法还没有完整的方法摘要。',
      ),
      innovation: readNumber(scores.novelty, 5),
      feasibility: readNumber(scores.feasibility, 5),
      evidenceStrength: readNumber(scores.interestingness, 5),
      risk: Math.max(1, 10 - readNumber(scores.feasibility, 5)),
      recommended: index === bestIdeaIndex,
    };
  });
}

export function adaptResultsArtifacts(payload: unknown): ExperimentResult[] {
  const data = asObject(payload);
  const analyses = asArray<Record<string, unknown>>(data.experiment_analysis);
  const findings = asArray<string>(data.key_findings).map((item) => cleanText(item));
  const assessment = pickText(data, ['overall_assessment', 'summary'], '当前没有可解析的整体结论。');

  if (!analyses.length) {
    return [
      {
        id: 'result-1',
        label: data.passed ? '当前方案' : '当前实验',
        metrics: { passed: data.passed ? 'true' : 'false' },
        interpretation: assessment,
        errorCases: findings.length ? findings : ['产物尚未提供结构化实验分析。'],
      },
    ];
  }

  return analyses.map((item, index) => ({
    id: `result-${index + 1}`,
    label: pickText(item, ['experiment', 'run_name'], `实验 ${index + 1}`),
    metrics: Object.fromEntries(
      Object.entries(asObject(item.metrics)).map(([key, value]) => [key, formatMetricValue(value)]),
    ),
    interpretation: pickText(item, ['analysis'], assessment),
    errorCases: asArray<string>(item.issues).length ? asArray<string>(item.issues).map(cleanText) : findings,
  }));
}

export function adaptWritingSections(texContent: string): WritingSection[] {
  const matches = Array.from(
    texContent.matchAll(/\\section\{([^}]+)\}([\s\S]*?)(?=\\section\{|\\bibliographystyle|$)/g),
  );

  if (!matches.length) {
    return [
      {
        id: 'section-1',
        label: '论文内容',
        outline: '当前论文内容尚未按 section 拆分。',
        content: texContent,
        evidence: [],
      },
    ];
  }

  return matches.map((match, index) => ({
    id: `section-${index + 1}`,
    label: match[1],
    outline: `${match[1]} 章节内容`,
    content: match[2].trim(),
    evidence: [],
  }));
}

export function adaptExperimentPlan(payload: unknown) {
  const data = asObject(payload);
  const experiments = asArray<Record<string, unknown>>(data.experiments);
  const firstExperiment = asObject(experiments[0]);

  return {
    dataset: pickText(data, ['dataset'], pickText(firstExperiment, ['dataset'], '等待实验计划')),
    model: pickText(data, ['model'], pickText(firstExperiment, ['description'], '等待实验计划')),
    baseline: pickText(data, ['baseline'], pickText(firstExperiment, ['changes'], '等待实验计划')),
    metrics: asArray<string>(data.metrics).length ? asArray<string>(data.metrics) : ['accuracy', 'f1'],
    runtime: `计划运行 ${readNumber(data.total_runs_planned, experiments.length || 1)} 次`,
    hypothesis: pickText(
      data,
      ['hypothesis'],
      pickText(firstExperiment, ['expected_outcome'], '当前实验计划尚未形成明确假设。'),
    ),
  };
}

export function adaptValidationClaims(report: BackendReviewReportResponse): ValidationClaim[] {
  const metaReview = asObject(report.meta_review);
  const weaknesses = asArray<string>(metaReview.Weaknesses).map(cleanText);
  const strengths = asArray<string>(metaReview.Strengths).map(cleanText);
  const questions = asArray<string>(metaReview.Questions).map(cleanText);
  const missingReferences = report.missing_references ?? [];
  const summary = pickText(metaReview, ['Summary'], '暂无 meta review 摘要。');

  const claims: ValidationClaim[] = [];

  weaknesses.forEach((item, index) => {
    claims.push({
      id: `claim-risk-${index + 1}`,
      claim: item,
      evidence: missingReferences.slice(0, 3),
      reviewerNote: summary,
      risk: 'high',
    });
  });

  strengths.forEach((item, index) => {
    claims.push({
      id: `claim-strength-${index + 1}`,
      claim: item,
      evidence: questions.slice(0, 3),
      reviewerNote: summary,
      risk: 'low',
    });
  });

  if (!claims.length) {
    claims.push({
      id: 'claim-default',
      claim: summary,
      evidence: missingReferences,
      reviewerNote: summary,
      risk: report.decision === 'Reject' ? 'high' : 'medium',
    });
  }

  return claims;
}

export function flattenRepoTree(nodes: BackendRepoTreeNode[]): RepositoryFile[] {
  const flattened: RepositoryFile[] = [];

  const visit = (node: BackendRepoTreeNode, prefix = '') => {
    const label = prefix ? `${prefix}/${node.name}` : node.name;

    flattened.push({
      id: node.path || label,
      label,
      kind: node.kind,
      language: node.kind === 'file' ? node.name.split('.').pop()?.toLowerCase() : undefined,
      preview: node.kind === 'folder' ? '目录' : '',
    });

    node.children?.forEach((child) => visit(child, label));
  };

  nodes.forEach((node) => visit(node));
  return flattened;
}
