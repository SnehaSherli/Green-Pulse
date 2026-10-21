// Thin fetch wrapper. Requests go to /api (proxied to Express); the httpOnly cookie is sent automatically.
export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    // session expired while using the app -> back to the login page (keep where we were)
    if (res.status === 401 && !path.startsWith("/auth/")) {
      const here = window.location.pathname + window.location.search;
      if (!here.startsWith("/login")) window.location.assign(`/login?next=${encodeURIComponent(here)}`);
    }
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data?.code);
  }
  return data as T;
}

export const api = {
  get: <T = any>(path: string) => request<T>("GET", path),
  post: <T = any>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T = any>(path: string, body: unknown) => request<T>("PATCH", path, body),
  del: <T = any>(path: string) => request<T>("DELETE", path),
  upload: <T = any>(path: string, form: FormData) => request<T>("POST", path, undefined, form),
};
