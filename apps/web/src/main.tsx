import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// The dashboard pulls in Privy; keep it out of the landing page bundle.
const DashboardApp = lazy(() => import('./dashboard/entry'));
const isDashboard = location.pathname.startsWith('/dashboard');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDashboard ? (
      <Suspense fallback={null}>
        <DashboardApp />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
