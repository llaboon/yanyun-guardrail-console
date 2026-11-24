// 处置方式（handleStrategy）由后端根据终态结果推导，前端只负责展示，不用 riskCode 反推。
export const STRATEGY_LABELS: Record<string, string> = {
  PASS: '放行',
  INTERCEPT: '精准拦截',
  REPLACE: '红线代答',
  REDIRECT: '智能纠偏',
};

export const STRATEGY_TONES: Record<string, string> = {
  PASS: 'ok',
  INTERCEPT: 'danger',
  REPLACE: 'warn',
  REDIRECT: 'info',
};

/** 图表配色，已用 dataviz 校验脚本在白底上验证（红/蓝/琥珀；琥珀对比度不足 3:1，图上同时标数值）。 */
export const STRATEGY_COLORS: Record<string, string> = {
  INTERCEPT: '#b3262b',
  REDIRECT: '#2a78d6',
  REPLACE: '#eda100',
};

/** 单系列图表（趋势、条形）的数据色：品牌红的同色系亮一级，深红 #94070a 低于图表明度下限。 */
export const CHART_COLOR = '#b3262b';

/** risk_event 只记录有风险的事件，所以没有 PASS。 */
export const RISK_STRATEGIES = ['INTERCEPT', 'REDIRECT', 'REPLACE'] as const;

export const SPECIAL_RISK_CODES: Record<number, string> = {
  0: '无风险',
  [-1]: '未判定',
  1100: '附件无法完成检测',
  9000: '边界样本',
  9100: '判定不安全但未细分类目',
};

export const strategyLabel = (value?: string | null) => (value ? STRATEGY_LABELS[value] || value : '-');
export const strategyTone = (value?: string | null) => (value ? STRATEGY_TONES[value] || '' : '');
