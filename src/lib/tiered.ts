// 分级审核（guard_check → llm_judge）结果的解析，字段约定见仓库根目录《分级审核-前端交接.md》。
import type { DefenseItem, GuardResult, JudgeResult } from '../types';

export type TierLevel = 'guard' | 'llm_judge' | 'guard_fallback';

export const TIER_LABELS: Record<TierLevel, string> = {
  guard: '安全模型快速判定',
  llm_judge: '已升级 · 裁判大模型',
  guard_fallback: '裁判失败 · 回落第一层',
};

export const TIER_TONES: Record<TierLevel, string> = { guard: 'neutral', llm_judge: 'info', guard_fallback: 'warn' };

export const SAFETY_LABELS: Record<string, string> = {
  safe: '安全',
  unsafe: '不安全',
  controversial: '争议',
  borderline: '边界',
};

export const safetyLabel = (value?: string | null) => (value ? SAFETY_LABELS[value] || value : '-');

export interface TierView {
  level: TierLevel;
  guard: GuardResult | null;
  judge: JudgeResult | null;
  /** 第一层置信度；推理服务没返回 logprobs 时为 null（此时一律升级）。 */
  confidence: number | null;
  threshold: number | null;
  escalated: boolean;
  probabilities: [string, number][];
  modelCategories: string[];
  category?: string;
  imageCount: number;
  reason?: string;
  judgeError?: string | null;
  guardCost?: number;
  judgeCost?: number;
  totalCost?: number;
  rawOutputs: { label: string; text: string }[];
}

export const isTiered = (item?: DefenseItem | null) =>
  item?.riskCheckType === 'guard_check' || item?.riskCheckType === 'llm_judge';

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

export function tierView(item: DefenseItem): TierView | null {
  if (!isTiered(item)) return null;
  const result = (item.riskCheckResult || {}) as JudgeResult;
  const isJudge = item.riskCheckType === 'llm_judge';
  const level: TierLevel = isJudge ? (result.decidedBy === 'guard_fallback' ? 'guard_fallback' : 'llm_judge') : 'guard';
  // 升级后第一层的数据在 upstream 里，没升级时就是结果本身
  const guard = isJudge ? result.upstream || null : (result as GuardResult);
  const judge = isJudge ? result : null;
  const confidence = num(guard?.confidence) ?? null;
  const threshold = num(guard?.escalateThreshold) ?? null;
  const probabilities = Object.entries(guard?.safetyProbabilities || {})
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .sort((a, b) => b[1] - a[1]);
  const guardCost = num(guard?.cost);
  const judgeCost = judge ? num(judge.cost) : undefined;
  const rawOutputs = [
    guard?.rawOutput ? { label: '第一层原始输出', text: guard.rawOutput } : null,
    judge?.rawOutput ? { label: '裁判原始输出', text: judge.rawOutput } : null,
  ].filter((x): x is { label: string; text: string } => !!x);
  return {
    level,
    guard,
    judge,
    confidence,
    threshold,
    escalated: isJudge || guard?.escalate === true,
    probabilities,
    modelCategories: guard?.modelCategories || [],
    category: (judge?.category || guard?.category) ?? undefined,
    imageCount: num(guard?.imageCount) ?? 0,
    reason: judge?.reason || undefined,
    judgeError: judge?.judgeError ?? null,
    guardCost,
    judgeCost,
    totalCost: guardCost == null && judgeCost == null ? undefined : (guardCost || 0) + (judgeCost || 0),
    rawOutputs,
  };
}
