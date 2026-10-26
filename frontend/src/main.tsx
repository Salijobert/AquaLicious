import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthContext.js';
import { App } from './App.js';
import './styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
});

// Detect Capacitor or file:// protocol to use HashRouter or BrowserRouter seamlessly
const isCapacitorOrLocalFile =
  window.location.protocol === 'file:' ||
  window.location.protocol === 'capacitor:' ||
  (window as any).Capacitor !== undefined;

const Router = isCapacitorOrLocalFile ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <App />
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
