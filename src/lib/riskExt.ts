// risk_event.ext：只有分级审核的事件才有，JSON 字符串。
export interface RiskExt {
  decidedBy?: string;
  judgeModel?: string;
  judgeSafety?: string;
  judgeReason?: string;
  judgeError?: string | null;
  judgeCost?: number;
  guardModel?: string;
  guardSafety?: string;
  guardRiskCode?: number;
  guardCategories?: string[];
  guardConfidence?: number | null;
  guardImageCount?: number;
  escalateThreshold?: number;
  escalated?: boolean;
  guardCost?: number;
}

export function parseRiskExt(ext?: string | null): RiskExt | null {
  if (!ext) return null;
  try {
    const value = JSON.parse(ext);
    return value && typeof value === 'object' ? (value as RiskExt) : null;
  } catch {
    return null;
  }
}

/** 第一层的 controversial 与裁判的 borderline 都表示“拿不准”，比较前归为一类。 */
export const normalizeVerdict = (value?: string | null) =>
  value === 'controversial' || value === 'borderline' ? 'uncertain' : value || undefined;

/** 第一层与裁判结论不一致：调阈值时最有用的信号。只在裁判真正给出结论时比较。 */
export function tierDisagrees(ext: RiskExt | null): boolean {
  if (!ext || ext.decidedBy !== 'llm_judge' || !ext.guardSafety || !ext.judgeSafety) return false;
  return normalizeVerdict(ext.guardSafety) !== normalizeVerdict(ext.judgeSafety);
}

export const TIER_SHORT: Record<string, string> = {
  guard: '第一层',
  llm_judge: '裁判',
  guard_fallback: '回落第一层',
};
