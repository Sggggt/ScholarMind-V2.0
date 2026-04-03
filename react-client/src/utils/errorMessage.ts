const genericBackendMessages = new Set([
  '文件不存在',
  '请求的资源不存在。',
  '路径指向目录，不能直接读取',
  '当前接口仅支持文本和 JSON 产物',
  '代码仓库尚未生成',
  '会话不存在',
  '任务不存在',
]);

function unwrapJsonMessage(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === 'string') {
      return parsed.trim();
    }

    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      for (const key of ['detail', 'message', 'error']) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

export function looksLikeMojibake(text: string): boolean {
  if (!text) {
    return false;
  }

  if (text.includes('\uFFFD')) {
    return true;
  }

  const suspiciousTokens = ['閿', '閵', '閸', '閻', '鐠', '瀵', '缂', '锟', '鈥', '銆', '鍙', '鍚'];
  const hits = suspiciousTokens.reduce((count, token) => count + (text.includes(token) ? 1 : 0), 0);
  return hits >= 2;
}

function normalizeDisplayText(raw: string) {
  return unwrapJsonMessage(raw).replace(/^"+|"+$/g, '').replace(/\s+/g, ' ').trim();
}

export function sanitizeDisplayText(raw: string | null | undefined, fallback = ''): string {
  if (typeof raw !== 'string') {
    return fallback;
  }

  const normalized = normalizeDisplayText(raw);
  if (!normalized) {
    return fallback;
  }

  if (looksLikeMojibake(normalized)) {
    return fallback;
  }

  return normalized;
}

export function sanitizeErrorMessage(raw: string, fallback = '请求失败，请稍后重试。'): string {
  const normalized = sanitizeDisplayText(raw, fallback);
  if (!normalized) {
    return fallback;
  }

  if (genericBackendMessages.has(normalized)) {
    return fallback;
  }

  if (normalized.includes('Traceback') || normalized.split('\n').length > 3) {
    return fallback;
  }

  return normalized;
}

export function toDisplayErrorMessage(error: unknown, fallback = '请求失败，请稍后重试。'): string {
  if (error instanceof Error) {
    return sanitizeErrorMessage(error.message, fallback);
  }

  if (typeof error === 'string') {
    return sanitizeErrorMessage(error, fallback);
  }

  return fallback;
}
