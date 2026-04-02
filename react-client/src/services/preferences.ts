const SETTINGS_STORAGE_KEY = 'scholarmind.desktop.settings';

export interface DesktopSettings {
  apiBase: string;
  wsBase: string;
  backendAccessToken: string;
  workingDirectoryPath: string;
  workingDirectoryLabel: string;
  taskDescriptionTemplate: string;
  taskConfig: {
    maxIdeas: number;
    numReflections: number;
    maxRetries: number;
  };
}

export const defaultDesktopSettings: DesktopSettings = {
  apiBase: '/api',
  wsBase: '',
  backendAccessToken: '',
  workingDirectoryPath: '',
  workingDirectoryLabel: '',
  taskDescriptionTemplate:
    '研究目标：{{topic}}\n关注点：请优先产出可验证的文献综述、研究缺口、候选想法和实验计划。\n输出要求：保持学术表达，并尽量给出可追踪证据。',
  taskConfig: {
    maxIdeas: 5,
    numReflections: 3,
    maxRetries: 3,
  },
};

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizeTrailingSlash(value: string, fallback: string) {
  const trimmed = value.trim();
  return (trimmed || fallback).replace(/\/$/, '');
}

function extractLikelyApiBase(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const matches = [...trimmed.matchAll(/https?:\/\//g)];
  if (matches.length > 1) {
    const lastMatch = matches[matches.length - 1];
    const start = lastMatch.index ?? 0;
    return trimmed.slice(start);
  }

  return trimmed;
}

function normalizeApiBase(value: string, fallback: string) {
  const candidate = extractLikelyApiBase(value);
  return normalizeTrailingSlash(candidate, fallback);
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numeric)));
}

export function sanitizeDesktopSettings(value: Partial<DesktopSettings> | null | undefined): DesktopSettings {
  const taskConfig: Partial<DesktopSettings['taskConfig']> = value?.taskConfig ?? {};

  return {
    apiBase: normalizeApiBase(value?.apiBase ?? '', defaultDesktopSettings.apiBase),
    wsBase: normalizeTrailingSlash(value?.wsBase ?? '', ''),
    backendAccessToken:
      typeof value?.backendAccessToken === 'string' ? value.backendAccessToken.trim() : '',
    workingDirectoryPath:
      typeof value?.workingDirectoryPath === 'string' ? value.workingDirectoryPath.trim() : '',
    workingDirectoryLabel:
      typeof value?.workingDirectoryLabel === 'string' ? value.workingDirectoryLabel.trim() : '',
    taskDescriptionTemplate:
      typeof value?.taskDescriptionTemplate === 'string'
        ? value.taskDescriptionTemplate
        : defaultDesktopSettings.taskDescriptionTemplate,
    taskConfig: {
      maxIdeas: clampNumber(taskConfig.maxIdeas, defaultDesktopSettings.taskConfig.maxIdeas, 1, 12),
      numReflections: clampNumber(
        taskConfig.numReflections,
        defaultDesktopSettings.taskConfig.numReflections,
        1,
        8,
      ),
      maxRetries: clampNumber(taskConfig.maxRetries, defaultDesktopSettings.taskConfig.maxRetries, 0, 10),
    },
  };
}

export function getDesktopSettings() {
  if (!isBrowser()) {
    return defaultDesktopSettings;
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return defaultDesktopSettings;
    }

    return sanitizeDesktopSettings(JSON.parse(raw) as Partial<DesktopSettings>);
  } catch {
    return defaultDesktopSettings;
  }
}

export function saveDesktopSettings(settings: DesktopSettings) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(sanitizeDesktopSettings(settings)));
}

export function resetDesktopSettings() {
  if (!isBrowser()) {
    return defaultDesktopSettings;
  }

  window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
  return defaultDesktopSettings;
}

export function resolveApiBase(envApiBase?: string) {
  const stored = getDesktopSettings().apiBase;
  return normalizeApiBase(stored, envApiBase?.replace(/\/$/, '') ?? defaultDesktopSettings.apiBase);
}

export function resolveWsBase() {
  return getDesktopSettings().wsBase;
}

export function resolveBackendAccessToken() {
  return getDesktopSettings().backendAccessToken.trim();
}

function normalizeInlineText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function compactTaskBriefLines(value: string, topic: string) {
  const normalizedTopic = normalizeInlineText(topic);

  return value
    .split(/\r?\n+/)
    .map((line) => line.replace(/^[\s\-*•]+/, '').replace(/^[^:：]{0,12}[：:]\s*/, '').trim())
    .map(normalizeInlineText)
    .filter(Boolean)
    .filter((line) => line !== normalizedTopic)
    .filter((line, index, lines) => lines.indexOf(line) === index);
}

export function buildTaskDescription(topic: string) {
  const normalizedTopic = normalizeInlineText(topic);
  if (!normalizedTopic) {
    return '';
  }

  const template = getDesktopSettings().taskDescriptionTemplate.trim();
  if (!template) {
    return normalizedTopic;
  }

  const resolved = template.split('{{topic}}').join(normalizedTopic);
  const defaultResolved = defaultDesktopSettings.taskDescriptionTemplate.split('{{topic}}').join(normalizedTopic);

  if (normalizeInlineText(resolved) === normalizeInlineText(defaultResolved)) {
    return normalizedTopic.slice(0, 240);
  }

  const compactLines = compactTaskBriefLines(resolved, normalizedTopic).slice(0, 2);
  const brief = [normalizedTopic, ...compactLines].join(' | ');

  return brief.slice(0, 280);
}

export function buildTaskConfigOverrides() {
  const { taskConfig, workingDirectoryPath, workingDirectoryLabel } = getDesktopSettings();

  return {
    max_ideas: taskConfig.maxIdeas,
    num_reflections: taskConfig.numReflections,
    max_retries: taskConfig.maxRetries,
    ...(workingDirectoryPath ? { work_dir: workingDirectoryPath } : {}),
    ...(workingDirectoryLabel ? { work_dir_label: workingDirectoryLabel } : {}),
  };
}

export function saveWorkingDirectoryPreference(path: string, label = '') {
  const current = getDesktopSettings();
  saveDesktopSettings(
    sanitizeDesktopSettings({
      ...current,
      workingDirectoryPath: path,
      workingDirectoryLabel: label || current.workingDirectoryLabel,
    }),
  );
}

export function clearWorkingDirectoryPreference() {
  const current = getDesktopSettings();
  saveDesktopSettings(
    sanitizeDesktopSettings({
      ...current,
      workingDirectoryPath: '',
      workingDirectoryLabel: '',
    }),
  );
}
