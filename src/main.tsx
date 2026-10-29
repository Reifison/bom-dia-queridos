import { applyDocumentLocale } from './lib/locale';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerOfflineShell } from './lib/registerOfflineShell';

applyDocumentLocale();
registerOfflineShell();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
