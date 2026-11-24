import { describe, expect, it } from 'vitest';
import type { DefenseItem } from '../types';
import { placeholderText, toRequestAttachments, typeFromMime, urlAttachment } from './attachments';
import { fillDays, lastDaysRange, niceTicks, toApiTime } from './format';
import { fromRows, toRows, validateCategoryMapRows, validateThresholdRows } from './guardConf';
import { parseRiskExt, tierDisagrees } from './riskExt';
import { findSecrets } from './secretGuard';
import { tierView } from './tiered';

describe('tiered result view', () => {
  const guardItem: DefenseItem = {
    riskCheckType: 'guard_check', riskCheckName: 'mm_guard', riskCode: 1003, handleStrategy: 'INTERCEPT',
    riskCheckResult: {
      decidedBy: 'guard', safety: 'unsafe', modelCategories: ['S1'], category: '违法犯罪', confidence: 0.93,
      escalateThreshold: 0.85, escalate: false, safetyProbabilities: { safe: 0.07, unsafe: 0.93 },
      model: 'meta-llama/Llama-Guard-4-12B', imageCount: 1, rawOutput: 'unsafe\nS1', cost: 420,
    },
  };
  const judgeItem: DefenseItem = {
    riskCheckType: 'llm_judge', riskCheckName: 'llm_judge', riskCode: 9000, handleStrategy: 'REDIRECT',
    riskCheckResult: {
      decidedBy: 'llm_judge', safety: 'borderline', category: '边界样本', reason: '询问药物剂量，建议引导就医',
      model: 'Qwen/Qwen3-VL-8B-Instruct', judgeError: null, cost: 2300,
      upstream: { decidedBy: 'guard', safety: 'safe', confidence: 0.61, escalateThreshold: 0.85, escalate: true, cost: 380 },
    },
  };

  it('reads a first-tier verdict directly from the result', () => {
    const view = tierView(guardItem)!;
    expect(view.level).toBe('guard');
    expect(view.confidence).toBe(0.93);
    expect(view.threshold).toBe(0.85);
    expect(view.escalated).toBe(false);
    expect(view.imageCount).toBe(1);
    expect(view.probabilities[0]).toEqual(['unsafe', 0.93]);
    expect(view.rawOutputs.map(item => item.label)).toEqual(['第一层原始输出']);
  });

  it('takes first-tier confidence from upstream after escalation and sums both costs', () => {
    const view = tierView(judgeItem)!;
    expect(view.level).toBe('llm_judge');
    expect(view.confidence).toBe(0.61);
    expect(view.reason).toContain('药物剂量');
    expect([view.guardCost, view.judgeCost, view.totalCost]).toEqual([380, 2300, 2680]);
  });

  it('flags judge fallback and keeps null confidence', () => {
    const fallback: DefenseItem = {
      ...judgeItem,
      riskCheckResult: { ...judgeItem.riskCheckResult, decidedBy: 'guard_fallback', judgeError: 'timeout', upstream: { confidence: null, escalate: true } },
    };
    const view = tierView(fallback)!;
    expect(view.level).toBe('guard_fallback');
    expect(view.judgeError).toBe('timeout');
    expect(view.confidence).toBeNull();
  });

  it('ignores non-tiered results', () => {
    expect(tierView({ riskCheckType: 'keyword', riskCode: 1002 })).toBeNull();
  });
});

describe('secret guard', () => {
  it('allows env-variable names and blocks inline keys', () => {
    expect(findSecrets({ url: 'http://guard:8000/v1', apiKeyEnv: 'GUARD_API_KEY', model: 'x' })).toEqual([]);
    expect(findSecrets({ apiKey: 'abc' })).toEqual(['conf.apiKey']);
    expect(findSecrets({ api_key: 'abc', nested: { token: 'x' } })).toEqual(['conf.api_key', 'conf.nested.token']);
    expect(findSecrets({ header: 'sk-123456' })).toEqual(['conf.header']);
    expect(findSecrets({ list: [{ value: 'hf_abcdef' }] })).toEqual(['conf.list[0].value']);
    expect(findSecrets({ url: 'http://x/v1?api_key=123' })).toEqual(['conf.url']);
    expect(findSecrets({ apiKey: '' })).toEqual([]);
  });
});

describe('risk event ext', () => {
  it('detects disagreement between the two tiers', () => {
    expect(tierDisagrees(parseRiskExt('{"decidedBy":"llm_judge","guardSafety":"unsafe","judgeSafety":"safe"}'))).toBe(true);
    expect(tierDisagrees(parseRiskExt('{"decidedBy":"llm_judge","guardSafety":"controversial","judgeSafety":"borderline"}'))).toBe(false);
    expect(tierDisagrees(parseRiskExt('{"decidedBy":"guard","guardSafety":"unsafe"}'))).toBe(false);
    expect(parseRiskExt('not json')).toBeNull();
  });
});

describe('attachments', () => {
  it('maps mime types and builds request payloads', () => {
    expect([typeFromMime('image/png'), typeFromMime('audio/wav'), typeFromMime('video/mp4'), typeFromMime('text/plain')])
      .toEqual(['picture', 'audio', 'video', null]);
    const draft = [
      { id: '1', name: 'a.png', type: 'picture' as const, mime: 'image/png', data: 'AAAA', previewUrl: 'blob:x' },
      urlAttachment('audio', 'https://oss.example/a.wav'),
    ];
    const payload = toRequestAttachments(draft);
    expect(payload).toEqual([
      { type: 'picture', mime: 'image/png', data: 'AAAA' },
      { type: 'audio', mime: undefined, url: 'https://oss.example/a.wav' },
    ]);
    expect(placeholderText(payload)).toBe('[图片] [音频]');
    expect(() => urlAttachment('picture', 'ftp://x')).toThrow('http/https');
  });
});

describe('guard conf rows and chart helpers', () => {
  it('round-trips key-value rows and validates them', () => {
    expect(toRows('{"1001":0.95}')).toEqual([{ key: '1001', value: '0.95' }]);
    expect(fromRows([{ key: '1001', value: '0.95' }, { key: '', value: '1' }, { key: 'S1', value: '1003' }])).toEqual({ '1001': 0.95, S1: 1003 });
    expect(validateThresholdRows([{ key: 'abc', value: '1.5' }]).map(p => p.message)).toEqual(['风险码必须是数字', '阈值必须在 0–1 之间']);
    expect(validateCategoryMapRows([{ key: 'S1', value: '1003' }, { key: 'S1', value: 'x' }]).map(p => p.message)).toEqual(['风险码必须是整数', '类目 S1 重复']);
  });

  it('formats api time, fills missing days and builds nice ticks', () => {
    expect(toApiTime(new Date('2026-11-24T08:09:10.123Z'))).toBe('2026-11-24 08:09:10');
    // 北京时间 2026-11-24 12:00，最近 3 个自然日从 11-22 零点（UTC 11-21 16:00）开始
    const range = lastDaysRange(3, new Date('2026-11-24T04:00:00Z'));
    expect(range.startTime).toBe('2026-11-21 16:00:00');
    expect(fillDays([{ dimension: '2026-11-23', count: 5 }], range.start, range.end)).toEqual([
      { dimension: '2026-11-22', count: 0 },
      { dimension: '2026-11-23', count: 5 },
      { dimension: '2026-11-24', count: 0 },
    ]);
    // 后端返回区间外的日期（时区口径不同）时保留，不丢数据
    expect(fillDays([{ dimension: '2026-11-21', count: 2 }], range.start, range.end).map(d => d.dimension)).toEqual(['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24']);
    expect(niceTicks(38)).toEqual([0, 10, 20, 30, 40]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});
