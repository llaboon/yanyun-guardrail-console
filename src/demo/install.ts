// 演示模式：内置数据 + 自动以管理员身份进入，不请求任何真实服务。
import { createDemoFetch } from './mockApi';

export const DEMO_MODE = import.meta.env.VITE_DEMO === '1';

const DEMO_CREDENTIALS = JSON.stringify({ username: 'demo', password: 'demo', role: 'admin' });
const TOKEN_KEY = 'yanyun.guardrail.console.auth';

export function installDemoMode() {
  if (!DEMO_MODE) return;
  window.fetch = createDemoFetch(window.fetch.bind(window));
  // 预置只读的管理员会话，跳过登录页；凭据只存在当前标签页
  try { sessionStorage.setItem(TOKEN_KEY, DEMO_CREDENTIALS); } catch { /* 隐私模式可能禁用存储 */ }
}
