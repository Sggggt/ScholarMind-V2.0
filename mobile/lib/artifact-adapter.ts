// Mobile artifact adapters - Parse artifacts into visual-friendly data structures
// Export shared types for use in components
export type {
  PaperRecord,
  ResearchGap,
  ExperimentPlan,
  Experiment,
  ExperimentResult,
  CodeGenInfo,
  WritingSection,
  WritingArtifact,
  ValidationReview,
  M1ArtifactData,
  M2ArtifactData,
  M7ArtifactData,
} from "./artifact-types";

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function readString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  return fallback;
}

function readNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function cleanMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/[*_`>-]/g, " ")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeMarkdown(text: string, maxLength = 200): string {
  const cleaned = cleanMarkdown(text);
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength).trim()}…`;
}

import type {
  PaperRecord,
  ResearchGap,
  ExperimentPlan,
  ExperimentResult,
  CodeGenInfo,
  WritingSection,
  WritingArtifact,
  ValidationReview,
  M1ArtifactData,
  M2ArtifactData,
  M7ArtifactData,
} from "./artifact-types";

// M1: Literature Review Artifacts
export function adaptM1Artifacts(
  reviewMarkdown: string,
  sourcesPayload: unknown
): M1ArtifactData {
  const payload = asObject(sourcesPayload);
  const sources = asArray<Record<string, unknown>>(payload.sources);
  const currentYear = new Date().getFullYear();

  const papers: PaperRecord[] = sources
    .map((source, index) => {
      const title = readString(source.title || source.Title, `Paper ${index + 1}`);
      const url = readString(source.url, "");
      const sourceName = readString(source.source, url ? new URL(url).hostname : "Unknown");

      // Read authors - could be array or string
      let authors = "Unknown authors";
      const authorsData = source.authors;
      if (Array.isArray(authorsData)) {
        authors = authorsData
          .map((a) => (typeof a === "string" ? a : readString(asObject(a).name)))
          .filter(Boolean)
          .slice(0, 3)
          .join(", ");
      } else if (typeof authorsData === "string") {
        authors = authorsData;
      }

      return {
        id: `paper-${index + 1}`,
        title: cleanMarkdown(title),
        source: sourceName,
        url: url || undefined,
        year: readNumber(source.year, currentYear - (index % 5)),
        authors,
        abstract: summarizeMarkdown(
          readString(source.content_preview || source.snippet || source.summary || source.abstract, "No abstract available.")
        ),
        citations: readNumber(source.citations || source.citation_count, 0),
      };
    })
    .filter((paper) => paper.title && paper.title.length > 10);

  return {
    summary: summarizeMarkdown(reviewMarkdown, 300),
    papers,
  };
}

// M2: Gap Analysis Artifacts
export function adaptM2Artifacts(gapPayload: unknown): M2ArtifactData {
  const data = asObject(gapPayload);
  const gaps = asArray<Record<string, unknown>>(data.gaps);

  return {
    gaps: gaps.map((gap, index) => {
      const description = readString(gap.description || gap.title, `Research gap ${index + 1}`);
      const category = readString(gap.category, "General");
      const impact = readString(gap.potential_impact, "medium");

      return {
        id: `gap-${index + 1}`,
        title: description.slice(0, 60),
        description,
        category,
        impact,
        tags: [category, impact],
      };
    }),
  };
}

// M5: Experiment Plan Artifacts
export function adaptM5Artifacts(planPayload: unknown): ExperimentPlan {
  const data = asObject(planPayload);
  const experiments = asArray<Record<string, unknown>>(data.experiments);

  // Backend returns: experiments array with run_num, description, expected_outcome, changes
  // Note: dataset, model, baseline, metrics, hypothesis may not be in current backend format
  const totalRuns = readNumber(data.total_runs_planned, experiments.length);
  const firstExp = experiments[0];

  return {
    dataset: readString(data.dataset, ""),  // Not provided in current format
    model: readString(data.model, ""),  // Not provided in current format
    baseline: readString(data.baseline, ""),  // Not provided in current format
    metrics: asArray<string>(data.metrics).length ? asArray<string>(data.metrics) : ["accuracy", "f1"],
    hypothesis: firstExp ? readString(firstExp.description) : `${totalRuns} experiment runs planned`,
    experiments: experiments.slice(0, 3).map((exp, index) => ({
      name: readString(exp.name || exp.run, `Experiment ${readNumber(exp.run_num, index + 1)}`),
      description: readString(exp.description, "Description pending"),
      expected_outcome: readString(exp.expected_outcome, "Outcome pending"),
    })),
  };
}

// M7: Results Analysis Artifacts
export function adaptM7Artifacts(analysisPayload: unknown): M7ArtifactData {
  const data = asObject(analysisPayload);
  const analyses = asArray<Record<string, unknown>>(data.experiment_analysis);
  const keyFindings = asArray<string>(data.key_findings);

  const results: ExperimentResult[] = analyses.length
    ? analyses.map((item, index) => {
        const metrics = asObject(item.key_metrics || item.metrics);
        const formattedMetrics: Record<string, string> = {};

        for (const [key, value] of Object.entries(metrics)) {
          if (key !== "dataset") {
            formattedMetrics[key] =
              typeof value === "number" ? (Math.abs(value) < 1 ? value.toFixed(3) : value.toFixed(2)) : String(value);
          }
        }

        return {
          id: `result-${index + 1}`,
          label: readString(item.run || item.experiment, `Experiment ${index + 1}`),
          metrics: formattedMetrics,
          interpretation: readString(item.observation || item.analysis, "No interpretation available"),
          keyFindings: keyFindings.slice(0, 2),
          passed: data.passed === true,
        };
      })
    : [
        {
          id: "result-1",
          label: "Experiment Results",
          metrics: {},
          interpretation: readString(data.overall_assessment, "Analysis pending"),
          keyFindings: keyFindings.length ? keyFindings : ["Results pending"],
          passed: data.passed === true,
        },
      ];

  return {
    results,
    overallAssessment: readString(data.overall_assessment, "Overall assessment pending"),
  };
}

// M4: Code Generation Artifacts
export function adaptM4Artifacts(codeGenPayload: unknown): CodeGenInfo {
  const data = asObject(codeGenPayload);

  // Backend returns: code_files, file_count, idea_name, project_dir, run_command
  const codeFiles = asArray<string>(data.code_files || data.main_files || data.files);
  const fileCount = readNumber(data.file_count, codeFiles.length);
  const projectDir = readString(data.project_dir, data.repo_path);

  // Extract folder name from path
  const folderName = projectDir ? projectDir.split(/[\\/]/).pop() || projectDir : "";
  const ideaName = readString(data.idea_name);

  return {
    repo_path: folderName || ideaName || "Generated code",
    main_files: codeFiles.slice(0, 8),
    description: ideaName ? `Idea: ${ideaName}` : (data.description ? readString(data.description) : `Code generation completed (${fileCount} files)`),
  };
}

// M8: Paper Writing Artifacts
export function adaptM8Artifacts(texContent: string): WritingArtifact {
  // Simple section extraction from LaTeX
  const sectionRegex = /\\section\{([^}]+)\}([\s\S]*?)(?=\\section\{|\\bibliographystyle|$)/g;
  const matches = Array.from(texContent.matchAll(sectionRegex));

  const sections: WritingSection[] = matches.length
    ? matches.map((match, index) => ({
        id: `section-${index + 1}`,
        label: match[1],
        content: cleanMarkdown(match[2].trim()).slice(0, 300),
        outline: `${match[1]} content`,
      }))
    : [
        {
          id: "section-1",
          label: "Paper Content",
          content: summarizeMarkdown(texContent, 300),
          outline: "Full paper content",
        },
      ];

  return {
    sections,
    wordCount: texContent.split(/\s+/).length,
  };
}

// M9: Validation Review Artifacts
export function adaptM9Artifacts(reviewPayload: unknown): ValidationReview {
  const data = asObject(reviewPayload);
  const metaReview = asObject(data.meta_review || {});

  return {
    decision: readString(data.decision, "Pending"),
    strengths: asArray<string>(metaReview.Strengths).slice(0, 3),
    weaknesses: asArray<string>(metaReview.Weaknesses).slice(0, 3),
    questions: asArray<string>(metaReview.Questions).slice(0, 3),
    summary: readString(metaReview.Summary || data.summary, "Review summary pending"),
  };
}
