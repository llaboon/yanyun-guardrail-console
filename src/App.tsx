// 路由与登录守卫：未登录显示登录页；已登录按侧栏渲染各页面。
import { Navigate, Route, Routes } from 'react-router';
import { AuthProvider, useAuth } from './auth';
import { Layout, Login } from './components/Layout';
import Abilities from './pages/Abilities';
import AiPage from './pages/AiPage';
import Businesses from './pages/Businesses';
import DataGovernance from './pages/DataGovernance';
import Diagnostics from './pages/Diagnostics';
import ModelLab from './pages/ModelLab';
import Monitor from './pages/Monitor';
import Overview from './pages/Overview';
import RiskEvents from './pages/RiskEvents';
import Strategies from './pages/Strategies';
import UsersPage from './pages/Users';

function AppRoutes() {
  const { credentials } = useAuth();
  if (!credentials) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<Overview />} />
        <Route path="/monitor" element={<Monitor />} />
        <Route path="/risk" element={<RiskEvents />} />
        <Route path="/business" element={<Businesses />} />
        <Route path="/abilities" element={<Abilities />} />
        <Route path="/strategy" element={<Strategies />} />
        <Route path="/data" element={<DataGovernance />} />
        <Route path="/diagnostics" element={<Diagnostics />} />
        <Route path="/ai" element={<AiPage />} />
        <Route path="/modellab" element={<ModelLab />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
