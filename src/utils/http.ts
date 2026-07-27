type JsonObject = Record<string, unknown>;

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function logDiagnostic(message: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const runtime = window as Window & {
    AndroidBridge?: {
      log?: (message: string) => void;
    };
  };

  if (typeof runtime.AndroidBridge?.log === "function") {
    runtime.AndroidBridge.log(message);
  }

  console.log(message);
}

const FALLBACK_API_BASE_URL = "http://10.24.18.124:3001";

function readApiBaseFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const queryValue = params.get("apiBaseUrl") || params.get("api_base_url");
  if (queryValue && queryValue.trim()) {
    return queryValue.trim();
  }

  const hashValue = window.location.hash.replace(/^#/, "").trim();
  if (hashValue && hashValue.startsWith("apiBaseUrl=")) {
    const value = hashValue.split("=")[1]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

export function resolveApiBaseUrl(): string {
  const win = window as Window & { ECOLETRACK_API_BASE_URL?: string };

  if (
    typeof win.ECOLETRACK_API_BASE_URL === "string" &&
    win.ECOLETRACK_API_BASE_URL.trim()
  ) {
    const resolved = trimTrailingSlash(win.ECOLETRACK_API_BASE_URL.trim());
    logDiagnostic(`[EcoleTrack] Resolved API = ${resolved}`);
    return resolved;
  }

  const urlOverride = readApiBaseFromUrl();
  if (urlOverride) {
    const resolved = trimTrailingSlash(urlOverride);
    logDiagnostic(`[EcoleTrack] Resolved API = ${resolved}`);
    return resolved;
  }

  const storageBase = localStorage.getItem("ecoletrack_api_base_url");
  if (storageBase && storageBase.trim()) {
    const resolved = trimTrailingSlash(storageBase.trim());
    logDiagnostic(`[EcoleTrack] Resolved API = ${resolved}`);
    return resolved;
  }

  const envBase = (import.meta as any)?.env?.VITE_API_BASE_URL as string | undefined;
  if (envBase && envBase.trim()) {
    const resolved = trimTrailingSlash(envBase.trim());
    logDiagnostic(`[EcoleTrack] Resolved API = ${resolved}`);
    return resolved;
  }

  logDiagnostic(`[EcoleTrack] Resolved API = ${FALLBACK_API_BASE_URL}`);
  return FALLBACK_API_BASE_URL;
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function cloneRequestWithUrl(request: Request, url: string): Request {
  return new Request(url, request);
}

export function withApiBase(input: RequestInfo | URL): RequestInfo | URL {
  const rawUrl = getRequestUrl(input);
  if (!rawUrl.startsWith("/api/")) {
    return input;
  }

  const base = resolveApiBaseUrl();
  const resolved = `${base}${rawUrl}`;
  logDiagnostic(`[EcoleTrack] Calling: ${resolved}`);

  if (input instanceof Request) {
    return cloneRequestWithUrl(input, resolved);
  }

  return resolved;
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
