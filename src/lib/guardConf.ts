// DAG 编辑器里 guard_check 节点的表单化编辑：escalateBelow、categoryEscalateBelow、categoryMap。
import type { JsonObject } from '../types';

export interface KeyValueRow {
  key: string;
  value: string;
}

export function toRows(value: unknown): KeyValueRow[] {
  let source = value;
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch { source = {}; }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) return [];
  return Object.entries(source as Record<string, unknown>).map(([key, item]) => ({ key, value: String(item ?? '') }));
}

/** 行数据转回对象；空键跳过，数字字符串转成数字（后端两种都接受，存数字更直观）。 */
export function fromRows(rows: KeyValueRow[]): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  rows.forEach(({ key, value }) => {
    const k = key.trim();
    if (!k) return;
    const v = value.trim();
    out[k] = v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
  });
  return out;
}

export interface RowProblem {
  index: number;
  message: string;
}

/** 校验“风险码 → 阈值”表：风险码必须是数字，阈值在 0–1 之间，风险码不能重复。 */
export function validateThresholdRows(rows: KeyValueRow[]): RowProblem[] {
  const problems: RowProblem[] = [];
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const key = row.key.trim();
    if (!key && !row.value.trim()) return;
    if (!/^\d+$/.test(key)) problems.push({ index, message: '风险码必须是数字' });
    const value = Number(row.value);
    if (row.value.trim() === '' || Number.isNaN(value) || value < 0 || value > 1) problems.push({ index, message: '阈值必须在 0–1 之间' });
    if (seen.has(key)) problems.push({ index, message: `风险码 ${key} 重复` });
    seen.add(key);
  });
  return problems;
}

/** 校验“模型类目 → 风险码”表：类目非空，风险码必须是整数。 */
export function validateCategoryMapRows(rows: KeyValueRow[]): RowProblem[] {
  const problems: RowProblem[] = [];
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const key = row.key.trim();
    if (!key && !row.value.trim()) return;
    if (!key) problems.push({ index, message: '模型类目不能为空' });
    if (!/^\d+$/.test(row.value.trim())) problems.push({ index, message: '风险码必须是整数' });
    if (seen.has(key)) problems.push({ index, message: `类目 ${key} 重复` });
    seen.add(key);
  });
  return problems;
}

export function readEscalateBelow(conf: JsonObject | undefined): number {
  const value = Number(conf?.escalateBelow);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.85;
}
