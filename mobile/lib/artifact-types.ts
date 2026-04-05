// Shared type definitions for artifact display
// These types are used by both artifact-adapter.ts and ArtifactDisplay.tsx

export type PaperRecord = {
  id: string;
  title: string;
  source: string;
  url?: string;
  year: number;
  authors: string;
  abstract: string;
  citations: number;
};

export type ResearchGap = {
  id: string;
  title: string;
  description: string;
  category: string;
  impact: string;
  tags: string[];
};

export type ExperimentPlan = {
  dataset: string;
  model: string;
  baseline: string;
  metrics: string[];
  hypothesis: string;
  experiments: Experiment[];
};

export type Experiment = {
  name: string;
  description: string;
  expected_outcome: string;
};

export type ExperimentResult = {
  id: string;
  label: string;
  metrics: Record<string, string>;
  interpretation: string;
  keyFindings: string[];
  passed: boolean;
};

export type CodeGenInfo = {
  repo_path: string;
  main_files: string[];
  description: string;
};

export type WritingSection = {
  id: string;
  label: string;
  content: string;
  outline: string;
};

export type WritingArtifact = {
  sections: WritingSection[];
  wordCount: number;
};

export type ValidationReview = {
  decision: string;
  strengths: string[];
  weaknesses: string[];
  questions: string[];
  summary: string;
};

// M1 Adapter return type
export type M1ArtifactData = {
  summary: string;
  papers: PaperRecord[];
};

// M2 Adapter return type
export type M2ArtifactData = {
  gaps: ResearchGap[];
};

// M7 Adapter return type
export type M7ArtifactData = {
  results: ExperimentResult[];
  overallAssessment: string;
};
