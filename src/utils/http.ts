type JsonObject = Record<string, unknown>;

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function resolveApiBaseUrl(): string {
  const win = window as Window & { ECOLETRACK_API_BASE_URL?: string };

  if (
    typeof win.ECOLETRACK_API_BASE_URL === "string" &&
    win.ECOLETRACK_API_BASE_URL.trim()
  ) {
    return trimTrailingSlash(win.ECOLETRACK_API_BASE_URL.trim());
  }

  const envBase = (import.meta as any)?.env?.VITE_API_BASE_URL as string | undefined;
  if (envBase && envBase.trim()) {
    return trimTrailingSlash(envBase.trim());
  }

  const storageBase = localStorage.getItem("ecoletrack_api_base_url");
  if (storageBase && storageBase.trim()) {
    return trimTrailingSlash(storageBase.trim());
  }

  if (window.location.host === "appassets.androidplatform.net") {
    return "http://10.109.86.124:3001";
  }

  return "";
}

export function withApiBase(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input !== "string") {
    return input;
  }

  if (!input.startsWith("/api/")) {
    return input;
  }

  const base = resolveApiBaseUrl();
  if (!base) {
    return input;
  }

  return `${base}${input}`;
}

export async function parseJsonSafe<T = JsonObject>(response: Response): Promise<T | null> {
  const raw = await response.text();
  if (!raw || !raw.trim()) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function getApiErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const value = (data as { error?: unknown }).error;
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return fallback;
}
