// 各页面共用的界面组件。
import { Fragment, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, ChevronRight, LoaderCircle, Save, Search, Shield, X, type LucideIcon } from 'lucide-react';
import type { VersionRecord } from '../types';
import { errorMessage } from '../lib/format';
import { strategyLabel, strategyTone } from '../lib/strategy';
import { DEMO_MODE } from '../demo/install';

export const BRAND = '燕云大模型安全护栏';
export const BRAND_EN = 'YANYUN LLM GUARDRAIL';

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

export function Header({ title, desc, action }: { title: string; desc?: ReactNode; action?: ReactNode }) {
  useEffect(() => { document.title = `${title} · ${BRAND}`; }, [title]);
  return (
    <header className="page-head">
      <div>
        <div className="crumb">{BRAND} <ChevronRight /> 控制面{DEMO_MODE && <span className="pill info">在线演示 · 示例数据</span>}</div>
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {action}
    </header>
  );
}

export function Metric({ label, value, tone = '', hint }: { label: string; value: ReactNode; tone?: string; hint?: ReactNode }) {
  return <div className={`metric ${tone}`}><span>{label}</span><b>{value}</b>{hint && <small className="metric-hint">{hint}</small>}</div>;
}

export function Pill({ ok, tone, title, children }: { ok?: boolean; tone?: string; title?: string; children: ReactNode }) {
  return <span className={`pill ${tone ?? (ok ? 'ok' : 'warn')}`} title={title}>{children}</span>;
}

export function StrategyBadge({ value }: { value?: string | null }) {
  if (!value) return <>-</>;
  return <span className={`pill ${strategyTone(value) || 'neutral'}`} title={value}>{strategyLabel(value)}</span>;
}

export function State({ loading, error, empty, children }: { loading?: boolean; error?: unknown; empty?: boolean; children?: ReactNode }) {
  if (loading) return <div className="state"><LoaderCircle className="spin" /><b>正在读取服务数据</b></div>;
  if (error) return <div className="state error-state"><AlertTriangle /><b>{errorMessage(error)}</b></div>;
  if (empty) return <div className="state"><Shield /><b>暂无数据</b></div>;
  return <>{children}</>;
}

export interface Column<T> {
  key: string;
  title: ReactNode;
  render?: (row: T) => ReactNode;
}

export function DataTable<T>({ columns, rows, rowKey, empty = '暂无数据', expand, rowClassName, onRowClick }: {
  columns: Column<T>[];
  rows: T[];
  rowKey?: (row: T, index: number) => string | number;
  empty?: ReactNode;
  expand?: (row: T) => ReactNode;
  rowClassName?: (row: T) => string;
  onRowClick?: (row: T) => void;
}) {
  if (!rows.length) return <div className="state">{empty}</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map(col => <th key={col.key}>{col.title}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => {
            const detail = expand?.(row);
            return (
              <Fragment key={rowKey ? rowKey(row, index) : index}>
                <tr className={rowClassName?.(row)} onClick={onRowClick ? () => onRowClick(row) : undefined}>
                  {columns.map(col => (
                    <td key={col.key}>{col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '-')}</td>
                  ))}
                </tr>
                {detail && <tr className="detail-row"><td colSpan={columns.length}>{detail}</td></tr>}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Field({ label, wide, hint, children }: { label: ReactNode; wide?: boolean; hint?: ReactNode; children: ReactNode }) {
  return <label className={wide ? 'wide' : ''}><span>{label}</span>{children}{hint && <small className="field-hint">{hint}</small>}</label>;
}

export function Modal({ title, eyebrow = '配置工作台', busy, submitLabel = '保存', onClose, onSubmit, children }: {
  title: string; eyebrow?: string; busy?: boolean; submitLabel?: string; onClose: () => void; onSubmit: () => void; children: ReactNode;
}) {
  useEscape(onClose);
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit(); };
  return (
    <>
      <div className="modal-scrim" onClick={onClose} />
      <form className="config-modal" onSubmit={submit}>
        <header><div><span>{eyebrow}</span><h2>{title}</h2></div><button type="button" className="icon-action" title="关闭" onClick={onClose}><X /></button></header>
        <div className="config-body">{children}</div>
        <footer>
          <button type="button" className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Save />}{busy ? '保存中' : submitLabel}</button>
        </footer>
      </form>
    </>
  );
}

export function Sheet({ eyebrow, title, onClose, children }: { eyebrow: string; title: string; onClose: () => void; children: ReactNode }) {
  useEscape(onClose);
  return (
    <>
      <div className="modal-scrim" onClick={onClose} />
      <section className="config-modal version-modal" role="dialog" aria-label={title}>
        <header><div><span>{eyebrow}</span><h2>{title}</h2></div><button type="button" className="icon-action" title="关闭" onClick={onClose}><X /></button></header>
        <div className="config-body">{children}</div>
      </section>
    </>
  );
}

export function VersionSheet({ title, versions, loading, error, onClose }: {
  title: string; versions: VersionRecord[]; loading?: boolean; error?: unknown; onClose: () => void;
}) {
  return (
    <Sheet eyebrow="变更记录" title={title} onClose={onClose}>
      <State loading={loading} error={error} empty={!versions.length}>
        <div className="version-list">
          {versions.map(version => (
            <article key={version.id}>
              <div><b>版本 {version.version}</b><Pill ok={version.status === 'online'}>{version.status}</Pill></div>
              <span>{version.updateTime || version.createTime || '无时间记录'}</span>
              <small>配置 ID: {version.id}</small>
            </article>
          ))}
        </div>
      </State>
    </Sheet>
  );
}

export function SearchBar({ value, onChange, onSubmit, placeholder, busy, children }: {
  value: string; onChange: (value: string) => void; onSubmit: () => void; placeholder: string; busy?: boolean; children?: ReactNode;
}) {
  return (
    <form className="search-bar" onSubmit={event => { event.preventDefault(); onSubmit(); }}>
      <div className="search-input"><Search /><input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} required /></div>
      {children}
      <button className="btn" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Search />}查询</button>
    </form>
  );
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'error' | 'warn'; children: ReactNode }) {
  return <div className={`alert ${tone === 'info' ? '' : tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function Notice({ icon: Icon = AlertTriangle, tone = '', children }: { icon?: LucideIcon; tone?: string; children: ReactNode }) {
  return <div className={`notice ${tone}`}><Icon /><div>{children}</div></div>;
}

/** 写操作前的二次确认，与上下线确认一致。 */
export const confirmAction = (message: string) => window.confirm(message);

/** 只读访客看到的禁用说明。 */
export const VIEWER_HINT = '只读访客不能执行写操作';

export function useMessage() {
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  return {
    message,
    info: (text: string) => setMessage({ text, tone: 'info' }),
    fail: (error: unknown) => setMessage({ text: errorMessage(error), tone: 'error' }),
    clear: () => setMessage(null),
    view: message ? <Alert tone={message.tone}>{message.text}</Alert> : null,
  };
}
