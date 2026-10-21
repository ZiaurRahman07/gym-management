export const TOKEN_KEY = 'gym.token';

let accessToken: string | null = localStorage.getItem(TOKEN_KEY);

export function setToken(token: string | null) {
  accessToken = token;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getToken() {
  return accessToken;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: { field: string; message: string }[];

  constructor(status: number, code: string, message: string, details?: { field: string; message: string }[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  fieldError(field: string): string | undefined {
    return this.details?.find((detail) => detail.field === field)?.message;
  }
}

const API_BASE = import.meta.env.VITE_API_URL || '/api';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, unknown>;
};

function buildQuery(query?: Record<string, unknown>): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

let refreshRequest: Promise<boolean> | null = null;

export async function refreshAccessToken(): Promise<boolean> {
  if (!refreshRequest) {
    refreshRequest = fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) return false;
        const data = (await response.json()) as { token: string };
        setToken(data.token);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshRequest = null;
      });
  }
  return refreshRequest;
}

async function parseError(response: Response): Promise<ApiError> {
  let code = 'ERROR';
  let message = 'Something went wrong. Please try again.';
  let details;
  try {
    const payload = await response.json();
    code = payload?.error?.code ?? code;
    message = payload?.error?.message ?? message;
    details = payload?.error?.details;
  } catch {
    /* ignore malformed bodies */
  }
  return new ApiError(response.status, code, message, details);
}

async function request<T>(path: string, options: RequestOptions = {}, canRetry = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${API_BASE}${path}${buildQuery(options.query)}`, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const isAuthCall = path.startsWith('/auth/login') || path.startsWith('/auth/refresh');
  if (response.status === 401 && canRetry && !isAuthCall) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return request<T>(path, options, false);
    setToken(null);
    window.dispatchEvent(new Event('gym:unauthorized'));
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const http = {
  get: <T>(path: string, query?: Record<string, unknown>) => request<T>(path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export async function downloadFile(path: string, query?: Record<string, unknown>, fallbackName = 'export.csv') {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response = await fetch(`${API_BASE}${path}${buildQuery(query)}`, { headers, credentials: 'include' });
  if (response.status === 401 && (await refreshAccessToken())) {
    response = await fetch(`${API_BASE}${path}${buildQuery(query)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
    });
  }
  if (!response.ok) throw await parseError(response);

  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? fallbackName;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
