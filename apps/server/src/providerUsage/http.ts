// FILE: http.ts
// Purpose: Thin JSON-over-HTTP wrapper using global fetch with timeouts.

const DEFAULT_TIMEOUT_MS = 15_000;

export interface FetchJsonOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  acceptStatuses?: number[];
}

export async function fetchJson<T = unknown>(
  url: string,
  options: FetchJsonOptions = {},
): Promise<{ status: number; data: T }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: options.body ? "POST" : "GET",
      headers: {
        Accept: "application/json",
        ...(options.headers ?? {}),
      },
      ...(options.body ? { body: options.body } : {}),
      signal: controller.signal,
    });

    if (options.acceptStatuses && !options.acceptStatuses.includes(response.status)) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as T;
    return { status: response.status, data };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function isAuthFailureStatus(status: number): boolean {
  return status === 401 || status === 403;
}
