// 读接口统一走 TanStack Query：同一份数据在各页面之间共享缓存，写操作后按 key 失效。
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { admin, modelDemo, runtime } from './api';
import { useAuth } from './auth';
import type { RiskEventFilter } from './types';

export const keys = {
  health: ['runtime', 'health'] as const,
  businesses: ['admin', 'businesses'] as const,
  functions: ['admin', 'functions'] as const,
  dags: ['admin', 'dags'] as const,
  users: ['admin', 'users'] as const,
  riskStats: (filter: RiskEventFilter) => ['admin', 'riskStats', filter] as const,
  riskEvents: (filter: RiskEventFilter, page: number) => ['admin', 'riskEvents', filter, page] as const,
  modelHealth: ['model', 'health'] as const,
};

export function useHealth() {
  const { credentials } = useAuth();
  return useQuery({ queryKey: keys.health, queryFn: () => runtime.health(credentials).then(() => true), refetchInterval: 30_000 });
}

export function useBusinesses() {
  const { credentials } = useAuth();
  return useQuery({ queryKey: keys.businesses, queryFn: async () => (await admin.businesses(credentials)) || [] });
}

export function useFunctions() {
  const { credentials } = useAuth();
  return useQuery({ queryKey: keys.functions, queryFn: async () => (await admin.functions(credentials)) || [] });
}

export function useDags() {
  const { credentials } = useAuth();
  return useQuery({ queryKey: keys.dags, queryFn: async () => (await admin.dags(credentials)) || [] });
}

export function useUsers() {
  const { credentials } = useAuth();
  return useQuery({ queryKey: keys.users, queryFn: async () => (await admin.users(credentials)) || [] });
}

/** 风险报表与总览共用：按天 / 检测类型 / 业务三组统计。 */
export function useRiskStats(filter: RiskEventFilter, enabled = true) {
  const { credentials } = useAuth();
  return useQuery({
    queryKey: keys.riskStats(filter),
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const [byDay, byType, byBusiness] = await Promise.all([
        admin.riskEventStatsByDay(credentials, filter),
        admin.riskEventStatsByRiskCheckType(credentials, filter),
        admin.riskEventStatsByBusiness(credentials, filter),
      ]);
      return { byDay: byDay || [], byType: byType || [], byBusiness: byBusiness || [] };
    },
  });
}

export function useRiskEvents(filter: RiskEventFilter, page: number, pageSize = 20) {
  const { credentials } = useAuth();
  return useQuery({
    queryKey: keys.riskEvents(filter, page),
    placeholderData: keepPreviousData,
    queryFn: async () => (await admin.riskEventQuery(credentials, { ...filter, page, pageSize })) || { total: 0, page, pageSize, list: [] },
  });
}

/**
 * 后端没有按处置方式聚合的接口，这里用 handleStrategy 过滤条件分别查一次总数（pageSize=1）。
 * risk_event 只记录有风险的事件，所以只查三种风险处置；筛选了某种处置时，其余两种记 0。
 */
export function useRiskByStrategy(filter: RiskEventFilter) {
  const { credentials } = useAuth();
  return useQuery({
    queryKey: ['admin', 'riskByStrategy', filter],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const all = ['INTERCEPT', 'REDIRECT', 'REPLACE'];
      const wanted = filter.handleStrategy ? all.filter(item => item === filter.handleStrategy) : all;
      const pages = await Promise.all(wanted.map(handleStrategy =>
        admin.riskEventQuery(credentials, { ...filter, handleStrategy, page: 1, pageSize: 1 })));
      const totals = new Map(wanted.map((item, index) => [item, pages[index]?.total || 0]));
      return all.map(dimension => ({ dimension, count: totals.get(dimension) ?? 0 }));
    },
  });
}

export function useModelHealth() {
  const { credentials } = useAuth();
  return useQuery({ queryKey: keys.modelHealth, queryFn: () => modelDemo.health(credentials), retry: false });
}

/** 配置类写操作后统一刷新业务 / 能力 / DAG 列表。 */
export function useInvalidateConfig() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['admin'] });
}
