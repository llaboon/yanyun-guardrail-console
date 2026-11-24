import { useState } from 'react';
import { BookOpen, Database, Plus, Shield } from 'lucide-react';
import { admin } from '../api';
import { useAuth } from '../auth';
import { DataTable, Field, Header, Modal, Pill, SearchBar, VIEWER_HINT, confirmAction, useMessage, type Column } from '../components/ui';
import { parseJsonValue, pretty } from '../lib/format';
import type { DictEntry, RedlineKnowledge, SensitiveWord } from '../types';

function SensitiveWordsTab() {
  const { credentials, canWrite } = useAuth();
  const empty: SensitiveWord = { word: '', businessScene: 'default', firstClassName: '内容安全', firstClassNo: 1, secondClassName: '敏感内容', secondClassNo: 1, tags: '', matchType: 'keyword', handleStrategy: 'reject', source: 'console', desc: '' };
  const [query, setQuery] = useState('');
  const [scene, setScene] = useState('');
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<SensitiveWord[]>([]);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<SensitiveWord | null>(null);
  const msg = useMessage();
  const search = async () => {
    setBusy(true); msg.clear();
    try { setRows((await admin.sensitiveSearch(credentials, { word: query, businessScene: scene, status })) || []); }
    catch (e) { msg.fail(e); } finally { setBusy(false); }
  };
  const save = async () => {
    if (!editor) return;
    setBusy(true); msg.clear();
    try {
      await admin.sensitiveUpsert(credentials, { ...editor, firstClassNo: Number(editor.firstClassNo), secondClassNo: Number(editor.secondClassNo) });
      setEditor(null); msg.info('敏感词已保存并生成当前版本'); if (query) await search();
    } catch (e) { msg.fail(e); } finally { setBusy(false); }
  };
  const toggle = async (row: SensitiveWord) => {
    if (!confirmAction(`确认${row.status === 'online' ? '下线' : '上线'}敏感词“${row.word}”？`)) return;
    setBusy(true);
    try { await (row.status === 'online' ? admin.sensitiveOffline(credentials, row.id!) : admin.sensitiveOnline(credentials, row.id!)); await search(); }
    catch (e) { msg.fail(e); } finally { setBusy(false); }
  };
  const upgrade = async (row: SensitiveWord) => {
    if (!confirmAction(`确认将“${row.word}”版本 ${row.version} 设为在线版本？`)) return;
    setBusy(true);
    try { await admin.sensitiveUpgrade(credentials, row.id!); await search(); } catch (e) { msg.fail(e); } finally { setBusy(false); }
  };
  const columns: Column<SensitiveWord>[] = [
    { key: 'word', title: '敏感词' },
    { key: 'businessScene', title: '业务场景' },
    { key: 'category', title: '分类', render: r => `${r.firstClassName || '-'} / ${r.secondClassName || '-'}` },
    { key: 'matchType', title: '匹配方式' },
    { key: 'version', title: '版本' },
    { key: 'status', title: '状态', render: r => <Pill ok={r.status === 'online'}>{r.status}</Pill> },
    { key: 'action', title: '操作', render: r => <div className="row-actions">
      <button className="link" disabled={!canWrite} title={canWrite ? undefined : VIEWER_HINT} onClick={() => setEditor({ ...r })}>编辑</button>
      {r.status !== 'online' && <button className="link" disabled={!canWrite || busy} onClick={() => upgrade(r)}>设为当前</button>}
      <button className="link danger" disabled={!canWrite || busy} onClick={() => toggle(r)}>{r.status === 'online' ? '下线' : '上线'}</button>
    </div> },
  ];
  const set = (patch: Partial<SensitiveWord>) => setEditor(editor ? { ...editor, ...patch } : editor);
  return (
    <>
      <div className="sub-head"><div><h2>敏感词库</h2><p>按词语检索，最多返回 100 条，可按场景和状态过滤。业务场景 all 的词对所有业务生效。</p></div><button className="btn primary" disabled={!canWrite} onClick={() => setEditor({ ...empty })}><Plus />新增敏感词</button></div>
      <SearchBar value={query} onChange={setQuery} onSubmit={search} placeholder="输入完整或部分敏感词" busy={busy}>
        <input value={scene} onChange={e => setScene(e.target.value)} placeholder="业务场景（可选）" />
        <select value={status} onChange={e => setStatus(e.target.value)}><option value="">全部状态</option><option value="online">online</option><option value="offline">offline</option></select>
      </SearchBar>
      {msg.view}
      <DataTable columns={columns} rows={rows} rowKey={(r, i) => r.id ?? i} empty="输入关键词后查询敏感词" />
      {editor && (
        <Modal title={editor.id ? `编辑 ${editor.word}` : '新增敏感词'} onClose={() => setEditor(null)} onSubmit={save} busy={busy}>
          <div className="form-grid">
            <Field label="敏感词"><input required value={editor.word} onChange={e => set({ word: e.target.value })} /></Field>
            <Field label="业务场景"><input required value={editor.businessScene} onChange={e => set({ businessScene: e.target.value })} /></Field>
            <Field label="一级分类"><input required value={editor.firstClassName} onChange={e => set({ firstClassName: e.target.value })} /></Field>
            <Field label="一级编号"><input type="number" min={0} required value={editor.firstClassNo} onChange={e => set({ firstClassNo: e.target.value })} /></Field>
            <Field label="二级分类"><input required value={editor.secondClassName} onChange={e => set({ secondClassName: e.target.value })} /></Field>
            <Field label="二级编号"><input type="number" min={0} required value={editor.secondClassNo} onChange={e => set({ secondClassNo: e.target.value })} /></Field>
            <Field label="匹配方式"><input required value={editor.matchType} onChange={e => set({ matchType: e.target.value })} /></Field>
            <Field label="处理策略"><input required value={editor.handleStrategy} onChange={e => set({ handleStrategy: e.target.value })} /></Field>
            <Field label="来源"><input required value={editor.source} onChange={e => set({ source: e.target.value })} /></Field>
            <Field label="标签"><input value={editor.tags || ''} onChange={e => set({ tags: e.target.value })} /></Field>
            <Field label="说明" wide><input value={editor.desc || ''} onChange={e => set({ desc: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}

function RedlineTab() {
  const { credentials, canWrite } = useAuth();
  const empty: RedlineKnowledge = { question: '', answer: '', businessScene: 'default', className: '安全红线', classNo: 1, source: 'console', type: 'qa', metadata: '{}', desc: '' };
  const [query, setQuery] = useState('');
  const [scene, setScene] = useState('');
  const [rows, setRows] = useState<RedlineKnowledge[]>([]);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<RedlineKnowledge | null>(null);
  const msg = useMessage();
  const search = async () => {
    setBusy(true); msg.clear();
    try { setRows(Object.values((await admin.redlineFind(credentials, { questions: [query], businessScene: scene || undefined })) || {})); }
    catch (e) { msg.fail(e); } finally { setBusy(false); }
  };
  const save = async () => {
    if (!editor) return;
    setBusy(true); msg.clear();
    try {
      if (editor.metadata) JSON.parse(editor.metadata);
      await admin.redlineUpsert(credentials, { ...editor, classNo: Number(editor.classNo) });
      setEditor(null); msg.info('红线知识已保存'); if (query) await search();
    } catch (e) { msg.fail(e); } finally { setBusy(false); }
  };
  const toggle = async (row: RedlineKnowledge) => {
    if (!confirmAction(`确认${row.status === 'online' ? '下线' : '上线'}该红线知识？`)) return;
    setBusy(true);
    try { await (row.status === 'online' ? admin.redlineOffline(credentials, row.id!) : admin.redlineOnline(credentials, row.id!)); await search(); }
    catch (e) { msg.fail(e); } finally { setBusy(false); }
  };
  const columns: Column<RedlineKnowledge>[] = [
    { key: 'question', title: '问题' },
    { key: 'answer', title: '安全回答' },
    { key: 'businessScene', title: '场景' },
    { key: 'className', title: '分类' },
    { key: 'status', title: '状态', render: r => <Pill ok={r.status === 'online'}>{r.status}</Pill> },
    { key: 'action', title: '操作', render: r => <div className="row-actions">
      <button className="link" disabled={!canWrite} title={canWrite ? undefined : VIEWER_HINT} onClick={() => setEditor({ ...r })}>编辑</button>
      <button className="link danger" disabled={!canWrite || busy} onClick={() => toggle(r)}>{r.status === 'online' ? '下线' : '上线'}</button>
    </div> },
  ];
  const set = (patch: Partial<RedlineKnowledge>) => setEditor(editor ? { ...editor, ...patch } : editor);
  return (
    <>
      <div className="sub-head"><div><h2>红线知识库</h2><p>后端按问题指纹精确查询，问题文本需与入库内容一致。命中后由“红线代答”能力返回安全回答。</p></div><button className="btn primary" disabled={!canWrite} onClick={() => setEditor({ ...empty })}><Plus />新增知识</button></div>
      <SearchBar value={query} onChange={setQuery} onSubmit={search} placeholder="输入完整问题" busy={busy}><input value={scene} onChange={e => setScene(e.target.value)} placeholder="业务场景（可选）" /></SearchBar>
      {msg.view}
      <DataTable columns={columns} rows={rows} rowKey={(r, i) => r.id ?? i} empty="输入完整问题后查询红线知识" />
      {editor && (
        <Modal title={editor.id ? '编辑红线知识' : '新增红线知识'} onClose={() => setEditor(null)} onSubmit={save} busy={busy}>
          <div className="form-grid">
            <Field label="问题" wide><textarea required value={editor.question} onChange={e => set({ question: e.target.value })} /></Field>
            <Field label="安全回答" wide><textarea required value={editor.answer} onChange={e => set({ answer: e.target.value })} /></Field>
            <Field label="业务场景"><input required value={editor.businessScene} onChange={e => set({ businessScene: e.target.value })} /></Field>
            <Field label="分类"><input required value={editor.className} onChange={e => set({ className: e.target.value })} /></Field>
            <Field label="分类编号"><input type="number" min={0} required value={editor.classNo} onChange={e => set({ classNo: e.target.value })} /></Field>
            <Field label="来源"><input required value={editor.source} onChange={e => set({ source: e.target.value })} /></Field>
            <Field label="类型"><input value={editor.type || ''} onChange={e => set({ type: e.target.value })} /></Field>
            <Field label="说明"><input value={editor.desc || ''} onChange={e => set({ desc: e.target.value })} /></Field>
            <Field label="Metadata JSON" wide><textarea className="code-editor" value={editor.metadata || '{}'} onChange={e => set({ metadata: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}
function DictionariesTab() {
  const { credentials, canWrite, username } = useAuth();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<DictEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{ key: string; desc: string; valueText: string } | null>(null);
  const msg = useMessage();
  const search = async () => {
    setBusy(true); msg.clear();
    try { setRows((await admin.dictList(credentials, { key: query })) || []); } catch (e) { msg.fail(e); } finally { setBusy(false); }
  };
  const save = async () => {
    if (!editor) return;
    setBusy(true); msg.clear();
    try {
      const valueObj = JSON.parse(editor.valueText);
      await admin.dictUpgrade(credentials, { key: editor.key, desc: editor.desc, valueObj, releaseErp: username, releaseName: username });
      setEditor(null); msg.info('字典新版本已发布'); await search();
    } catch (e) { msg.fail(e); } finally { setBusy(false); }
  };
  const toggle = async (row: DictEntry) => {
    if (!confirmAction(`确认${row.status === 'online' ? '下线' : '上线'}字典 ${row.key} v${row.version}？`)) return;
    setBusy(true);
    try { await (row.status === 'online' ? admin.dictOffline(credentials, row.id) : admin.dictOnline(credentials, row.id)); await search(); }
    catch (e) { msg.fail(e); } finally { setBusy(false); }
  };
  const columns: Column<DictEntry>[] = [
    { key: 'key', title: 'Key' },
    { key: 'desc', title: '说明' },
    { key: 'version', title: '版本' },
    { key: 'value', title: '值', render: r => <code className="truncate-code" title={r.value}>{r.value}</code> },
    { key: 'status', title: '状态', render: r => <Pill ok={r.status === 'online'}>{r.status}</Pill> },
    { key: 'action', title: '操作', render: r => <div className="row-actions">
      <button className="link" disabled={!canWrite} title={canWrite ? undefined : VIEWER_HINT} onClick={() => setEditor({ key: r.key, desc: r.desc || '', valueText: pretty(r.valueObj ?? parseJsonValue(r.value)) })}>新版本</button>
      <button className="link danger" disabled={!canWrite || busy} onClick={() => toggle(r)}>{r.status === 'online' ? '下线' : '上线'}</button>
    </div> },
  ];
  return (
    <>
      <div className="sub-head"><div><h2>平台字典</h2><p>修改字典会创建并上线新版本，旧的在线版本自动下线。</p></div><button className="btn primary" disabled={!canWrite} onClick={() => setEditor({ key: '', desc: '', valueText: '{}' })}><Plus />新增字典</button></div>
      <SearchBar value={query} onChange={setQuery} onSubmit={search} placeholder="输入字典 Key 或片段" busy={busy} />
      {msg.view}
      <DataTable columns={columns} rows={rows} rowKey={r => r.id} empty="输入 Key 后查询平台字典" />
      {editor && (
        <Modal title="发布字典新版本" onClose={() => setEditor(null)} onSubmit={save} busy={busy}>
          <div className="form-grid">
            <Field label="Key"><input required value={editor.key} onChange={e => setEditor({ ...editor, key: e.target.value })} /></Field>
            <Field label="说明"><input required value={editor.desc} onChange={e => setEditor({ ...editor, desc: e.target.value })} /></Field>
            <Field label="值（JSON）" wide><textarea className="code-editor" required value={editor.valueText} onChange={e => setEditor({ ...editor, valueText: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}

export default function DataGovernance() {
  const [tab, setTab] = useState<'sensitive' | 'redline' | 'dict'>('sensitive');
  return (
    <>
      <Header title="数据治理" desc="管理关键词检测、红线问答与平台运行字典；后端没有全量分页接口，只能按词、完整问题或 Key 搜索。" />
      <section className="panel governance">
        <div className="tabs" role="tablist">
          <button className={tab === 'sensitive' ? 'active' : ''} onClick={() => setTab('sensitive')}><Shield />敏感词</button>
          <button className={tab === 'redline' ? 'active' : ''} onClick={() => setTab('redline')}><BookOpen />红线知识</button>
          <button className={tab === 'dict' ? 'active' : ''} onClick={() => setTab('dict')}><Database />平台字典</button>
        </div>
        {tab === 'sensitive' && <SensitiveWordsTab />}
        {tab === 'redline' && <RedlineTab />}
        {tab === 'dict' && <DictionariesTab />}
      </section>
    </>
  );
}
