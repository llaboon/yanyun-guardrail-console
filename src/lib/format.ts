import type { Stat } from '../types';

export const pretty = (value: unknown) => JSON.stringify(value ?? {}, null, 2);

export function parseJsonValue(value?: string | null): unknown {
  try { return JSON.parse(value || '{}'); } catch { return value || ''; }
}

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** 后端 Jackson 全局日期格式为 yyyy-MM-dd HH:mm:ss（按 UTC 解析），不能直接发 ISO-8601。 */
export const toApiTime = (date: Date) => date.toISOString().slice(0, 19).replace('T', ' ');

const DAY_MS = 24 * 3600_000;
const CN_OFFSET_MS = 8 * 3600_000;

/** 最近 N 个自然日（北京时间，含今天）：起点对齐到 N-1 天前的零点，终点为当前时刻。 */
export function lastDaysRange(days: number, now = new Date()) {
  const todayStart = Math.floor((now.getTime() + CN_OFFSET_MS) / DAY_MS) * DAY_MS - CN_OFFSET_MS;
  const start = new Date(todayStart - (Math.max(1, days) - 1) * DAY_MS);
  const end = now;
  return { start, end, startTime: toApiTime(start), endTime: toApiTime(end) };
}

/** risk_event.create_time 按北京时间落库并按天聚合（JDBC serverTimezone=Asia/Shanghai）。 */
export const dayKeyCN = (date: Date) => new Date(date.getTime() + CN_OFFSET_MS).toISOString().slice(0, 10);

/**
 * 按天统计只返回有数据的日期，这里补齐区间内的每一天（缺失记 0）。
 * 后端按 create_time 的日期分组，时区口径不确定时，返回的日期也一并保留，避免边界那天的数据被丢掉。
 */
export function fillDays(stats: Stat[], start: Date, end: Date): Stat[] {
  const counts = new Map(stats.map(item => [item.dimension, Number(item.count) || 0]));
  const keys = new Set(stats.map(item => item.dimension));
  const last = dayKeyCN(end);
  for (let t = start.getTime(); ; t += DAY_MS) {
    const key = dayKeyCN(new Date(t));
    keys.add(key);
    if (key >= last) break;
  }
  return [...keys].sort().map(dimension => ({ dimension, count: counts.get(dimension) ?? 0 }));
}

export const fmtCount = (value: number | null | undefined) => (value == null ? '-' : Number(value).toLocaleString('zh-CN'));

export function fmtPercent(value: number | null | undefined, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return '-';
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

export const fmtTime = (ts?: number) => (ts ? new Date(ts).toLocaleTimeString('zh-CN', { hour12: false }) : '-');

export const fmtDateTime = (value?: string | number) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { hour12: false });
};

export const fmtMs = (value?: number | null) => (value == null ? '-' : `${fmtCount(Math.round(value))} ms`);

export async function sha256Hex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function downloadText(name: string, content: string, type = 'text/yaml;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** 坐标轴用的整齐刻度：0 起，步长取 1/2/5×10^n。 */
export function niceTicks(max: number, target = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map(m => m * magnitude).find(s => s >= raw) ?? magnitude * 10;
  const ticks: number[] = [];
  for (let v = 0; v < max + step * 0.999; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}
