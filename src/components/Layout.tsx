// 登录页、侧栏与整体布局。
import { useState, type FormEvent } from 'react';
import { NavLink, Outlet } from 'react-router';
import {
  Activity, BarChart3, Blocks, Bot, Database, FlaskConical, GitBranch, KeyRound, LayoutDashboard,
  LoaderCircle, LogOut, Menu, Server, Settings2, ShieldCheck, Users, XCircle, type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../auth';
import { errorMessage } from '../lib/format';
import { DEMO_MODE } from '../demo/install';
import { BRAND, BRAND_EN } from './ui';

export interface NavItem {
  path: string;
  icon: LucideIcon;
  title: string;
  group: string;
}

export const NAV: NavItem[] = [
  { path: '/overview', icon: LayoutDashboard, title: '系统总览', group: '态势监控' },
  { path: '/monitor', icon: Activity, title: '运行监控', group: '态势监控' },
  { path: '/risk', icon: BarChart3, title: '风险报表', group: '态势监控' },
  { path: '/business', icon: Server, title: '业务接入', group: '防护编排' },
  { path: '/abilities', icon: Blocks, title: '安全能力', group: '防护编排' },
  { path: '/strategy', icon: GitBranch, title: 'DAG 策略', group: '防护编排' },
  { path: '/data', icon: Database, title: '数据治理', group: '防护编排' },
  { path: '/ai', icon: Bot, title: 'AI 交互', group: '验证与运维' },
  { path: '/modellab', icon: FlaskConical, title: '模型实验室', group: '验证与运维' },
  { path: '/diagnostics', icon: Settings2, title: '配置诊断', group: '验证与运维' },
  { path: '/users', icon: Users, title: '用户管理', group: '验证与运维' },
];

const NAV_GROUPS = ['态势监控', '防护编排', '验证与运维'] as const;

export function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(username, password);
    } catch (err) {
      const message = errorMessage(err);
      setError(message === '登录已失效，请重新登录' ? '用户名或密码错误' : message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand"><ShieldCheck /><div><b>{BRAND}</b><span>{BRAND_EN}</span></div></div>
        <h1>管理员登录</h1>
        <p>登录后可查看真实配置，并执行受保护的管理操作。</p>
        <label>账号<input autoFocus value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required /></label>
        <label>密码<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></label>
        {error && <div className="alert error"><XCircle size={16} />{error}</div>}
        <button className="btn primary wide" disabled={loading}>{loading ? <LoaderCircle className="spin" /> : <KeyRound />}{loading ? '正在验证' : '登录'}</button>
        <small>凭据只保存在当前浏览器标签页；公网部署请启用 HTTPS。</small>
      </form>
    </main>
  );
}

function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const { username, role, logout } = useAuth();
  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="brand">
        <span className="brand-badge"><ShieldCheck /></span>
        <div><b>{BRAND}</b><span>{BRAND_EN}</span></div>
      </div>
      <div className="env"><i /><div><b>{DEMO_MODE ? '演示环境' : '运行环境'}</b><span>{DEMO_MODE ? '内置示例数据 · 未连接真实服务' : 'Docker Compose · default'}</span></div></div>
      <nav aria-label="主导航">
        {NAV_GROUPS.map(group => (
          <div className="side-group" key={group}>
            <div className="side-group-title">{group}</div>
            {NAV.filter(item => item.group === group).map(({ path, icon: Icon, title }) => (
              <NavLink key={path} to={path} onClick={onNavigate} className={({ isActive }) => (isActive ? 'active' : '')}>
                <Icon /><span>{title}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="account">
        <div className="avatar">{username.slice(0, 2).toUpperCase()}</div>
        <div><b>{username}</b><span>{role === 'admin' ? '管理员' : '只读访客'}</span></div>
        <button type="button" title="退出登录" onClick={logout}><LogOut /></button>
      </div>
    </aside>
  );
}

export function Layout() {
  const [open, setOpen] = useState(false);
  return (
    <div className="app-shell">
      <button type="button" className="nav-toggle" title="菜单" onClick={() => setOpen(value => !value)}><Menu /></button>
      {open && <div className="nav-scrim" onClick={() => setOpen(false)} />}
      <Sidebar open={open} onNavigate={() => setOpen(false)} />
      <main className="workspace"><Outlet /></main>
    </div>
  );
}
