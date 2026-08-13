type JsonObject = Record<string, unknown>;

type ApiDiagnosticState = {
  androidResource: string;
  windowValue: string;
  localStorageValue: string;
  resolveValue: string;
  lastFetch: string;
  lastFetchSource: string;
  lastStep: string;
};

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function getRuntimeWindow(): Window & {
  AndroidBridge?: {
    log?: (message: string) => void;
  };
  __ECOLETRACK_API_DIAGNOSTICS__?: ApiDiagnosticState;
  ECOLETRACK_API_BASE_URL?: string;
} {
  return window as Window & {
    AndroidBridge?: {
      log?: (message: string) => void;
    };
    __ECOLETRACK_API_DIAGNOSTICS__?: ApiDiagnosticState;
    ECOLETRACK_API_BASE_URL?: string;
  };
}

function sanitizeValue(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "<empty>";
  }

  return value.trim() || "<empty>";
}

function updateApiDiagnostics(partialState: Partial<ApiDiagnosticState>): void {
  if (typeof window === "undefined") {
    return;
  }

  const runtime = getRuntimeWindow();
  const current = runtime.__ECOLETRACK_API_DIAGNOSTICS__ ?? {
    androidResource: "<not-set>",
    windowValue: "<not-set>",
    localStorageValue: "<not-set>",
    resolveValue: "<not-set>",
    lastFetch: "<not-set>",
    lastFetchSource: "<not-set>",
    lastStep: "<not-set>",
  };

  runtime.__ECOLETRACK_API_DIAGNOSTICS__ = {
    ...current,
    ...partialState,
  };

  const panel = document.getElementById("ecoletrack-api-diagnostics-panel");
  if (panel) {
    const diag = runtime.__ECOLETRACK_API_DIAGNOSTICS__;
    const values = [
      `API Android : ${sanitizeValue(diag.androidResource)}`,
      `window.ECOLETRACK_API_BASE_URL : ${sanitizeValue(diag.windowValue)}`,
      `localStorage : ${sanitizeValue(diag.localStorageValue)}`,
      `resolveApiBaseUrl() : ${sanitizeValue(diag.resolveValue)}`,
      `Dernier fetch : ${sanitizeValue(diag.lastFetch)}`,
      `Source : ${sanitizeValue(diag.lastFetchSource)}`,
      `Etape : ${sanitizeValue(diag.lastStep)}`,
    ];

    panel.innerHTML = values.map((line) => `<div>${line}</div>`).join("");
  }
}

function logDiagnostic(message: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const runtime = getRuntimeWindow();

  if (typeof runtime.AndroidBridge?.log === "function") {
    runtime.AndroidBridge.log(message);
  }

  console.log(message);
}

function updateDiagnosticPanelText(): void {
  if (typeof document === "undefined") {
    return;
  }

  let panel = document.getElementById("ecoletrack-api-diagnostics-panel") as HTMLDivElement | null;
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "ecoletrack-api-diagnostics-panel";
    panel.style.position = "fixed";
    panel.style.right = "12px";
    panel.style.bottom = "12px";
    panel.style.zIndex = "2147483647";
    panel.style.maxWidth = "420px";
    panel.style.padding = "10px 12px";
    panel.style.borderRadius = "8px";
    panel.style.background = "rgba(15, 23, 42, 0.9)";
    panel.style.color = "#e2e8f0";
    panel.style.fontSize = "11px";
    panel.style.lineHeight = "1.5";
    panel.style.fontFamily = "monospace";
    panel.style.border = "1px solid rgba(148, 163, 184, 0.5)";
    panel.style.boxShadow = "0 8px 24px rgba(15, 23, 42, 0.3)";
    panel.style.pointerEvents = "none";
    document.body.appendChild(panel);
  }

  const diag = (window as any).__ECOLETRACK_API_DIAGNOSTICS__ ?? {
    androidResource: "<not-set>",
    windowValue: "<not-set>",
    localStorageValue: "<not-set>",
    resolveValue: "<not-set>",
    lastFetch: "<not-set>",
    lastFetchSource: "<not-set>",
    lastStep: "<not-set>",
  };

  const lines = [
    `API Android : ${sanitizeValue(diag.androidResource)}`,
    `window.ECOLETRACK_API_BASE_URL : ${sanitizeValue(diag.windowValue)}`,
    `localStorage : ${sanitizeValue(diag.localStorageValue)}`,
    `resolveApiBaseUrl() : ${sanitizeValue(diag.resolveValue)}`,
    `Dernier fetch : ${sanitizeValue(diag.lastFetch)}`,
    `Source : ${sanitizeValue(diag.lastFetchSource)}`,
    `Etape : ${sanitizeValue(diag.lastStep)}`,
  ];

  panel.innerHTML = lines.map((line) => `<div>${line}</div>`).join("");
}

export function installApiDiagnosticsPanel(): void {
  if (typeof document === "undefined") {
    return;
  }

  updateDiagnosticPanelText();
}

const FALLBACK_API_BASE_URL = "https://ecoletrack-mobile-api-apk.onrender.com";

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
  const win = getRuntimeWindow();
  const runtimeDiagnostics = (window as any).__ECOLETRACK_API_DIAGNOSTICS__ ?? {};

  if (
    typeof win.ECOLETRACK_API_BASE_URL === "string" &&
    win.ECOLETRACK_API_BASE_URL.trim()
  ) {
    const resolved = trimTrailingSlash(win.ECOLETRACK_API_BASE_URL.trim());
    runtimeDiagnostics.windowValue = resolved;
    runtimeDiagnostics.resolveValue = resolved;
    runtimeDiagnostics.lastStep = "window.ECOLETRACK_API_BASE_URL";
    updateApiDiagnostics({
      windowValue: resolved,
      resolveValue: resolved,
      lastStep: "window.ECOLETRACK_API_BASE_URL",
    });
    logDiagnostic(`[ECOLETRACK_API_TRACE][6] resolveApiBaseUrl() => ${resolved} [source=window.ECOLETRACK_API_BASE_URL]`);
    return resolved;
  }

  const urlOverride = readApiBaseFromUrl();
  if (urlOverride) {
    const resolved = trimTrailingSlash(urlOverride);
    runtimeDiagnostics.windowValue = sanitizeValue(win.ECOLETRACK_API_BASE_URL ?? "<not-set>");
    runtimeDiagnostics.resolveValue = resolved;
    runtimeDiagnostics.lastStep = "query/hash";
    updateApiDiagnostics({
      windowValue: sanitizeValue(win.ECOLETRACK_API_BASE_URL ?? "<not-set>"),
      resolveValue: resolved,
      lastStep: "query/hash",
    });
    logDiagnostic(`[ECOLETRACK_API_TRACE][6] resolveApiBaseUrl() => ${resolved} [source=query/hash]`);
    return resolved;
  }

  const storageBase = localStorage.getItem("ecoletrack_api_base_url");
  if (storageBase && storageBase.trim()) {
    const resolved = trimTrailingSlash(storageBase.trim());
    runtimeDiagnostics.localStorageValue = resolved;
    runtimeDiagnostics.resolveValue = resolved;
    runtimeDiagnostics.lastStep = "localStorage";
    updateApiDiagnostics({
      localStorageValue: resolved,
      resolveValue: resolved,
      lastStep: "localStorage",
    });
    logDiagnostic(`[ECOLETRACK_API_TRACE][6] resolveApiBaseUrl() => ${resolved} [source=localStorage]`);
    return resolved;
  }

  const envBase = (import.meta as any)?.env?.VITE_API_BASE_URL as string | undefined;
  if (envBase && envBase.trim()) {
    const resolved = trimTrailingSlash(envBase.trim());
    runtimeDiagnostics.resolveValue = resolved;
    runtimeDiagnostics.lastStep = "VITE_API_BASE_URL";
    updateApiDiagnostics({
      resolveValue: resolved,
      lastStep: "VITE_API_BASE_URL",
    });
    logDiagnostic(`[ECOLETRACK_API_TRACE][6] resolveApiBaseUrl() => ${resolved} [source=VITE_API_BASE_URL]`);
    return resolved;
  }

  runtimeDiagnostics.resolveValue = FALLBACK_API_BASE_URL;
  runtimeDiagnostics.lastStep = "FALLBACK_API_BASE_URL";
  updateApiDiagnostics({
    resolveValue: FALLBACK_API_BASE_URL,
    lastStep: "FALLBACK_API_BASE_URL",
  });
  logDiagnostic(`[ECOLETRACK_API_TRACE][6] resolveApiBaseUrl() => ${FALLBACK_API_BASE_URL} [source=FALLBACK_API_BASE_URL]`);
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
  const runtimeDiagnostics = (window as any).__ECOLETRACK_API_DIAGNOSTICS__ ?? {};
  runtimeDiagnostics.lastFetch = resolved;
  runtimeDiagnostics.lastFetchSource = base;
  updateApiDiagnostics({
    lastFetch: resolved,
    lastFetchSource: base,
  });
  logDiagnostic(`[ECOLETRACK_API_TRACE][7] FETCH URL = ${resolved}`);

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
