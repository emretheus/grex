/**
 * Minimal HTTP helpers shared by the issue-tracker adapters. Adapters that lean
 * on a vendor SDK skip these; the REST/GraphQL-over-fetch providers reuse them
 * so error handling and timeouts stay consistent.
 */

const DEFAULT_TIMEOUT_MS = 15_000;

export class HttpRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "HttpRequestError";
  }
}

const withTimeout = async (input: string, init: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

/** POST a GraphQL query and return `data`, throwing on transport or GraphQL errors. */
export const graphqlRequest = async <T>(
  url: string,
  headers: Record<string, string>,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> => {
  let response: Response;
  try {
    response = await withTimeout(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ query, variables }),
    });
  } catch (cause) {
    throw new HttpRequestError(cause instanceof Error ? cause.message : "Network request failed");
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new HttpRequestError(
      `Request failed (${response.status})${text ? `: ${truncate(text)}` : ""}`,
      response.status,
    );
  }

  const body = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (body.errors && body.errors.length > 0) {
    throw new HttpRequestError(body.errors.map((e) => e.message).join("; "));
  }
  if (body.data === undefined) {
    throw new HttpRequestError("Response contained no data");
  }
  return body.data;
};

/** GET a REST endpoint and parse JSON, throwing on non-2xx. */
export const restRequest = async <T>(url: string, headers: Record<string, string>): Promise<T> => {
  let response: Response;
  try {
    response = await withTimeout(url, { method: "GET", headers });
  } catch (cause) {
    throw new HttpRequestError(cause instanceof Error ? cause.message : "Network request failed");
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new HttpRequestError(
      `Request failed (${response.status})${text ? `: ${truncate(text)}` : ""}`,
      response.status,
    );
  }
  return (await response.json()) as T;
};

const truncate = (text: string, max = 200): string =>
  text.length > max ? `${text.slice(0, max)}…` : text;

/** Normalizes any thrown value into a displayable error message. */
export const toErrorMessage = (cause: unknown, fallback: string): string => {
  if (cause instanceof Error && cause.message) return cause.message;
  return fallback;
};
