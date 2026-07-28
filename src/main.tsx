import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { resolveApiBaseUrl, withApiBase } from './utils/http';
import { ThemeProvider } from './contexts/ThemeContext';

function logDiagnostic(message: string): void {
  const runtime = window as Window & {
    AndroidBridge?: {
      log?: (message: string) => void;
    };
  };

  if (typeof runtime.AndroidBridge?.log === 'function') {
    runtime.AndroidBridge.log(message);
  }

  console.log(message);
}

const nativeFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const resolvedInput = withApiBase(input);
  const resolvedUrl = typeof resolvedInput === 'string'
    ? resolvedInput
    : resolvedInput instanceof URL
      ? resolvedInput.toString()
      : resolvedInput.url;

  logDiagnostic(`[EcoleTrack] fetch -> ${resolvedUrl}`);

  try {
  const response = await nativeFetch(resolvedInput, {
    ...init,
  });

  logDiagnostic(`[EcoleTrack] fetch status ${response.status} -> ${resolvedUrl}`);
  return response;

} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  logDiagnostic(`[EcoleTrack] fetch error ${message}`);
  throw error;
}
};

logDiagnostic(`[EcoleTrack] Resolved API = ${resolveApiBaseUrl()}`);
logDiagnostic(`[EcoleTrack] Calling: ${String(withApiBase('/api/login'))}`);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
