import { useMemo, useState } from 'react';
import { AlertTriangle, Plus, RefreshCw } from 'lucide-react';
import { admin } from '../api';
import { useAuth } from '../auth';
import { DataTable, Field, Header, Modal, Pill, State, VIEWER_HINT, confirmAction, useMessage, type Column } from '../components/ui';
import { CONF_TEMPLATES, FUNCTION_TYPES, GUARD_OUTPUT_FORMATS, TYPE_LABELS, templateText, timeoutFor } from '../lib/functionTypes';
import { pretty } from '../lib/format';
import { SECRET_HINT, findSecrets } from '../lib/secretGuard';
import { useFunctions, useInvalidateConfig } from '../queries';
import type { JsonObject, SafetyFunction } from '../types';

interface AbilityDraft {
  isNew: boolean;
  row?: SafetyFunction;
  name: string;
  type: string;
  desc: string;
  timeoutMilliseconds: number | string;
  confText: string;
}

function parseConf(text: string): JsonObject | null {
  try {
    const value = JSON.parse(text || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : null;
  } catch {
    return null;
  }
}

/** 快捷表单改一个字段：value 为 undefined 时删除该字段。 */
function patchConf(text: string, key: string, value: unknown): string | null {
  const conf = parseConf(text);
  if (!conf) return null;
  if (value === undefined || value === '') delete conf[key];
  else conf[key] = value;
  return pretty(conf);
}

const isPristine = (text: string) => !text.trim() || text.trim() === '{}' || Object.keys(CONF_TEMPLATES).some(type => templateText(type) === text);

/** guard_check / llm_judge 的快捷配置：模型输出格式、密钥环境变量名、远程图片开关。 */
function TieredQuickFields({ draft, onChange }: { draft: AbilityDraft; onChange: (confText: string) => void }) {
  const conf = parseConf(draft.confText);
  if (!conf) return <p className="field-hint wide warn-text"><AlertTriangle />配置 JSON 格式有误，修正后才能使用快捷配置。</p>;
  const set = (key: string, value: unknown) => { const next = patchConf(draft.confText, key, value); if (next) onChange(next); };
  const format = String(conf.outputFormat || 'llama_guard');
  return (
    <div className="quick-fields wide">
      <h3>快捷配置</h3>
      <div className="form-grid">
        {draft.type === 'guard_check' && (
          <Field label="模型输出格式（outputFormat）" hint={format === 'qwen3guard' ? '纯文本模型，不检测图片：图片样本请另配可看图的模型' : undefined}>
            <select value={format} onChange={e => { set('outputFormat', e.target.value); if (e.target.value === 'qwen3guard') set('sendImages', false); }}>
              {GUARD_OUTPUT_FORMATS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </Field>
        )}
        <Field label="密钥环境变量名（apiKeyEnv）" hint="这里填环境变量名，不是 key 本身；自部署不需要鉴权时可以不填">
          <input value={String(conf.apiKeyEnv ?? '')} placeholder="例如 GUARD_API_KEY" pattern="[A-Za-z_][A-Za-z0-9_]*" title="只能是环境变量名" onChange={e => set('apiKeyEnv', e.target.value.trim() || undefined)} />
        </Field>
        <label className="toggle-row wide">
          <input type="checkbox" checked={conf.allowRemoteImageUrls === true} onChange={e => set('allowRemoteImageUrls', e.target.checked)} />
          <span>允许把远程图片 URL 转发给推理服务（allowRemoteImageUrls）</span>
        </label>
        {conf.allowRemoteImageUrls === true && <p className="field-hint wide warn-text"><AlertTriangle />只有图片 URL 都指向可信的内网对象存储时才能打开，否则推理服务可能被用来访问任意地址（SSRF）。</p>}
      </div>
    </div>
  );
}

export default function Abilities() {
  const { credentials, canWrite } = useAuth();
  const functions = useFunctions();
  const invalidate = useInvalidateConfig();
  const msg = useMessage();
  const [editor, setEditor] = useState<AbilityDraft | null>(null);
  const [busy, setBusy] = useState<string | number | null>(null);
  const [formError, setFormError] = useState('');

  const typeOptions = useMemo(() => (editor && !FUNCTION_TYPES.includes(editor.type) ? [editor.type, ...FUNCTION_TYPES] : FUNCTION_TYPES), [editor]);

  const openNew = () => { setFormError(''); setEditor({ isNew: true, name: '', type: 'keyword', desc: '', timeoutMilliseconds: timeoutFor('keyword'), confText: templateText('keyword') }); };
  const openEdit = (row: SafetyFunction) => { setFormError(''); setEditor({ isNew: false, row, name: row.name, type: row.type, desc: row.desc, timeoutMilliseconds: row.timeoutMilliseconds, confText: pretty(row.confObj) }); };

  const changeType = (type: string) => {
    if (!editor) return;
    const pristine = isPristine(editor.confText);
    setEditor({ ...editor, type, confText: pristine && CONF_TEMPLATES[type] ? templateText(type) : editor.confText, timeoutMilliseconds: pristine ? timeoutFor(type) : editor.timeoutMilliseconds });
  };

  const save = async () => {
    if (!editor) return;
    setFormError('');
    const confObj = parseConf(editor.confText);
    if (!confObj) { setFormError('配置 JSON 格式有误，必须是一个 JSON 对象'); return; }
    // 密钥防呆：配置会在控制台展示，也会进入版本历史
    const leaks = findSecrets(confObj);
    if (leaks.length) { setFormError(`${SECRET_HINT}。疑似密钥字段：${leaks.join('、')}`); return; }
    setBusy('save'); msg.clear();
    try {
      const body = { name: editor.name, group: 'default', type: editor.type, desc: editor.desc, timeoutMilliseconds: Number(editor.timeoutMilliseconds), confObj };
      if (editor.isNew) {
        const created = await admin.functionNew(credentials, body);
        await admin.functionOnline(credentials, created.id);
      } else {
        const draft = await admin.functionNewVersion(credentials, { id: editor.row!.id });
        await admin.functionUpdate(credentials, { ...editor.row, ...body, id: draft.id, version: draft.version, status: 'edit' });
        await admin.functionUpgrade(credentials, draft.id);
      }
      setEditor(null); msg.info('能力配置已发布，Runtime API 将在轮询后生效'); invalidate();
    } catch (e) { msg.fail(e); } finally { setBusy(null); }
  };

  const offline = async (row: SafetyFunction) => {
    if (!confirmAction(`确认下线能力“${row.name}”？引用它的 DAG 节点会执行失败。`)) return;
    setBusy(row.id); msg.clear();
    try { await admin.functionOffline(credentials, row.id); msg.info('能力已下线'); invalidate(); }
    catch (e) { msg.fail(e); } finally { setBusy(null); }
  };

  const columns: Column<SafetyFunction>[] = [
    { key: 'name', title: '能力名称' },
    { key: 'type', title: '类型', render: r => <span title={TYPE_LABELS[r.type] || r.type}><code>{r.type}</code></span> },
    { key: 'desc', title: '描述', render: r => r.desc || '-' },
    { key: 'timeoutMilliseconds', title: '超时（ms）' },
    { key: 'version', title: '版本' },
    { key: 'status', title: '状态', render: r => <Pill ok={r.status === 'online'}>{r.status}</Pill> },
    { key: 'action', title: '操作', render: r => <div className="row-actions">
      <button className="link" disabled={!canWrite} title={canWrite ? undefined : VIEWER_HINT} onClick={() => openEdit(r)}>编辑</button>
      <button className="link danger" disabled={!canWrite || busy === r.id} title={canWrite ? undefined : VIEWER_HINT} onClick={() => offline(r)}>{busy === r.id ? '处理中' : '下线'}</button>
    </div> },
  ];

  return (
    <>
      <Header title="安全能力" desc="注册能力地址、类型、超时和 JSON 参数；编辑会自动创建新版本。能力类型创建后不能修改。"
        action={<div className="heading-actions">
          <button className="btn" onClick={() => functions.refetch()}><RefreshCw />刷新</button>
          <button className="btn primary" disabled={!canWrite} onClick={openNew}><Plus />注册能力</button>
        </div>} />
      {msg.view}
      <div className="panel"><State loading={functions.isLoading} error={functions.error}><DataTable columns={columns} rows={functions.data || []} rowKey={r => r.id} /></State></div>
      {editor && (
        <Modal title={editor.isNew ? '注册安全能力' : `编辑 ${editor.name}`} onClose={() => setEditor(null)} onSubmit={save} busy={busy === 'save'} submitLabel={editor.isNew ? '注册并上线' : '发布新版本'}>
          <div className="form-grid">
            <Field label="能力名称"><input required disabled={!editor.isNew} value={editor.name} onChange={e => setEditor({ ...editor, name: e.target.value })} /></Field>
            <Field label="能力类型" hint={TYPE_LABELS[editor.type]}>
              <select disabled={!editor.isNew} value={editor.type} onChange={e => changeType(e.target.value)}>{typeOptions.map(type => <option key={type} value={type}>{type}</option>)}</select>
            </Field>
            <Field label="描述" wide><input required value={editor.desc} onChange={e => setEditor({ ...editor, desc: e.target.value })} /></Field>
            <Field label="超时（ms）"><input type="number" min={1} required value={editor.timeoutMilliseconds} onChange={e => setEditor({ ...editor, timeoutMilliseconds: e.target.value })} /></Field>
            {(editor.type === 'guard_check' || editor.type === 'llm_judge') && <TieredQuickFields draft={editor} onChange={confText => setEditor({ ...editor, confText })} />}
            <Field label="配置 JSON" wide hint="新建时按类型预填模板；模型地址请按实际部署修改。不要在这里填写任何密钥。">
              <textarea className="code-editor" required spellCheck={false} value={editor.confText} onChange={e => setEditor({ ...editor, confText: e.target.value })} />
            </Field>
            {formError && <div className="alert error wide">{formError}</div>}
          </div>
        </Modal>
      )}
    </>
  );
}
