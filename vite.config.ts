import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// 本地开发代理：与 console/nginx.conf 保持同一套前缀和请求头。
// safety-admin / safety-api 在 Compose 里只绑定 127.0.0.1，可用环境变量改成其他地址。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const adminTarget = env.ADMIN_BASE_URL || 'http://127.0.0.1:8006';
  const runtimeTarget = env.RUNTIME_BASE_URL || 'http://127.0.0.1:8007';
  const modelTarget = env.MODEL_DEMO_BASE_URL || 'http://127.0.0.1:17860';
  const strip = (prefix: string) => (path: string) => path.slice(prefix.length) || '/';
  return {
    // GitHub Pages 项目页需要仓库名前缀；本地/生产构建默认 /
    base: env.VITE_BASE || '/',
    plugins: [
      react(),
      {
        // nginx 用 /auth-check 校验 Basic Auth；开发时由 safety-admin 校验，这里直接放行。
        name: 'dev-auth-check',
        configureServer(server) {
          server.middlewares.use('/auth-check', (_req, res) => {
            res.setHeader('Cache-Control', 'no-store');
            res.end('ok\n');
          });
        },
      },
    ],
    server: {
      proxy: {
        '/admin-api': {
          target: adminTarget,
          changeOrigin: true,
          rewrite: strip('/admin-api'),
          // 与 nginx 一致：经控制台代理的 Admin 响应会去掉密钥字段
          headers: { 'X-Console-Proxy': '1' },
        },
        '/runtime-api': { target: runtimeTarget, changeOrigin: true, rewrite: strip('/runtime-api') },
        '/model-api': { target: modelTarget, changeOrigin: true, rewrite: strip('/model-api') },
      },
    },
  };
});
