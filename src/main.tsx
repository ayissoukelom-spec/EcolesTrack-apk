import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { resolveApiBaseUrl, withApiBase } from './utils/http';

const nativeFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  return nativeFetch(withApiBase(input), init);
};

console.log('Resolved API =', resolveApiBaseUrl());
console.log('Calling:', withApiBase('/api/login'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
