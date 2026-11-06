/** Error returned by the IntegrAlo API, with its HTTP status (0 = server unreachable). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const DEFAULT_PORT = 4100;
const TIMEOUT_MS = 8000;

/**
 * Turns what the user typed into a base URL: adds http:// and the default port when
 * missing and drops any path. "192.168.1.10" → "http://192.168.1.10:4100".
 * Parsed by hand on purpose: the URL class of React Native on phones does not implement
 * changing a URL's parts, and failed here although the same code worked in the browser.
 */
export function normalizeServerUrl(input: string): string {
  const match = /^(?:(https?):\/\/)?([^/:\s]+)(?::(\d{1,5}))?(?:\/.*)?$/i.exec(input.trim());
  if (!match) throw new ApiError(0, 'invalid address');
  const [, protocol = 'http', host, port = String(DEFAULT_PORT)] = match;
  return `${protocol.toLowerCase()}://${host}:${port}`;
}

export async function apiRequest<T>(
  baseUrl: string,
  method: string,
  path: string,
  options: { body?: unknown; token?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'unreachable');
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  const data = text ? safeJson(text) : null;
  if (!response.ok) {
    const message = (data as { message?: unknown } | null)?.message;
    throw new ApiError(response.status, Array.isArray(message) ? message.join('; ') : String(message ?? response.statusText));
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
