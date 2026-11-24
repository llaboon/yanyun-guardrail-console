import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@xyflow/react/dist/style.css';
import './styles.css';
import './app.css';
import './modellab.css';
import App from './App';
import { DEMO_MODE, installDemoMode } from './demo/install';

// 演示构建（GitHub Pages）用 hash 路由并启用内置数据；正常构建不变
installDemoMode();
const Router = DEMO_MODE ? HashRouter : BrowserRouter;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // 401 由 api.ts 统一清登录态并回到登录页，这里不重试
      retry: (count, error) => !(error instanceof Error && 'status' in error && (error as { status?: number }).status === 401) && count < 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router>
        <App />
      </Router>
    </QueryClientProvider>
  </React.StrictMode>,
);
