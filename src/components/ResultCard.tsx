// AI 交互页的结果卡片：处置方式、风险码、分级审核层级、置信度条与阈值线、概率分布、裁判理由、两层耗时、原始 JSON。
import { AlertTriangle, ChevronRight, Image as ImageIcon, Lock } from 'lucide-react';
import type { DefenseItem } from '../types';
import { fmtMs, fmtPercent } from '../lib/format';
import { SPECIAL_RISK_CODES, strategyLabel, strategyTone } from '../lib/strategy';
import { TIER_LABELS, TIER_TONES, safetyLabel, tierView, type TierView } from '../lib/tiered';
import { riskTypeLabel } from '../lib/functionTypes';

function ConfidenceBar({ view }: { view: TierView }) {
  if (view.confidence == null) {
    return <div className="conf-empty"><AlertTriangle />推理服务没有返回 logprobs：无置信度 · 已升级</div>;
  }
  const value = Math.max(0, Math.min(1, view.confidence));
  const threshold = view.threshold == null ? null : Math.max(0, Math.min(1, view.threshold));
  const below = threshold != null && value < threshold;
  return (
    <div className="conf-bar">
      <div className="conf-head">
        <span>第一层置信度</span>
        <b>{fmtPercent(value)}</b>
        {threshold != null && <small>升级阈值 {fmtPercent(threshold, 0)}{below ? ' · 低于阈值，已升级' : ''}</small>}
      </div>
      <div className="conf-track" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={value} aria-label="第一层置信度">
        <i className={below ? 'low' : ''} style={{ width: `${value * 100}%` }} />
        {threshold != null && <span className="conf-threshold" style={{ left: `${threshold * 100}%` }} title={`升级阈值 ${threshold}`} />}
      </div>
    </div>
  );
}

function Probabilities({ items }: { items: [string, number][] }) {
  if (!items.length) return null;
  return (
    <div className="prob-list">
      <span className="card-label">标签概率分布</span>
      {items.map(([label, value]) => (
        <div key={label} className="prob-row">
          <span>{safetyLabel(label)}</span>
          <span className="prob-track"><i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} /></span>
          <b>{fmtPercent(value)}</b>
        </div>
      ))}
    </div>
  );
}

function TierDetail({ view }: { view: TierView }) {
  return (
    <div className="tier-detail">
      <div className="tier-flow">
        <div className={`tier-step ${view.level === 'guard' ? 'decided' : ''}`}>
          <span className="card-label">第一层 · 安全模型</span>
          <b>{safetyLabel(view.guard?.safety)}</b>
          <small>{view.guard?.model || '-'} · {fmtMs(view.guardCost)}</small>
        </div>
        {view.escalated && (
          <>
            <ChevronRight className="tier-arrow" />
            <div className={`tier-step ${view.level !== 'guard' ? 'decided' : ''} ${view.level === 'guard_fallback' ? 'failed' : ''}`}>
              <span className="card-label">第二层 · 裁判大模型</span>
              <b>{view.level === 'guard_fallback' ? '调用失败' : safetyLabel(view.judge?.safety)}</b>
              <small>{view.judge?.model || '-'} · {fmtMs(view.judgeCost)}</small>
            </div>
          </>
        )}
        {view.totalCost != null && <div className="tier-total"><span className="card-label">模型耗时合计</span><b>{fmtMs(view.totalCost)}</b></div>}
      </div>
      {view.level === 'guard_fallback' && <p className="warn-text"><AlertTriangle />裁判失败，已回落到第一层结论{view.judgeError ? `：${view.judgeError}` : ''}</p>}
      <ConfidenceBar view={view} />
      <Probabilities items={view.probabilities} />
      {(view.modelCategories.length > 0 || view.category) && (
        <div className="category-row">
          <span className="card-label">模型类目</span>
          {view.modelCategories.map(item => <code key={item} className="tag">{item}</code>)}
          {view.category && <span className="mapped">→ {view.category}</span>}
        </div>
      )}
      {view.imageCount > 0 && <div className="image-count"><ImageIcon />已送检 {view.imageCount} 张图片</div>}
      {view.reason && (
        <div className="judge-reason">
          <b>裁判理由</b><span className="pill neutral"><Lock />仅内部可见</span>
          <p>{view.reason}</p>
        </div>
      )}
    </div>
  );
}

export function ResultCard({ item }: { item: DefenseItem }) {
  const view = tierView(item);
  const code = item.riskCode;
  const special = code != null ? SPECIAL_RISK_CODES[code] : undefined;
  const tone = strategyTone(item.handleStrategy) || 'neutral';
  return (
    <article className={`result-card tone-${tone}`}>
      <header>
        <span className={`pill strategy ${tone}`}>{strategyLabel(item.handleStrategy)}</span>
        <div className="result-code"><b>风险码 {code ?? '-'}</b><span>{item.riskMessage || special || ''}</span></div>
        <div className="result-meta">
          <span>检测能力：{item.riskCheckName || '-'}（{riskTypeLabel(item.riskCheckType)}）</span>
          {view && <span className={`pill ${TIER_TONES[view.level]}`}>{TIER_LABELS[view.level]}</span>}
        </div>
      </header>
      {view && <TierDetail view={view} />}
      {view?.rawOutputs.map(raw => (
        <details key={raw.label} className="raw-block"><summary>{raw.label}（rawOutput）</summary><pre>{raw.text}</pre></details>
      ))}
    </article>
  );
}

export function ResultList({ items }: { items: DefenseItem[] }) {
  if (!items.length) return <div className="state">检测完成，但没有返回结果（content 为空时后端直接放行）。</div>;
  return <div className="result-list">{items.map((item, index) => <ResultCard key={index} item={item} />)}</div>;
}
