import { useState } from 'react';
import { Download, Link2, LoaderCircle, Settings2, Upload } from 'lucide-react';
import { admin } from '../api';
import { useAuth } from '../auth';
import { Field, Header, VIEWER_HINT, confirmAction } from '../components/ui';
import { downloadText, errorMessage } from '../lib/format';
import { useBusinesses, useFunctions, useInvalidateConfig } from '../queries';

export default function Diagnostics() {
  const { credentials, canWrite } = useAuth();
  const businesses = useBusinesses();
  const functions = useFunctions();
  const invalidate = useInvalidateConfig();
  const [business, setBusiness] = useState('');
  const [func, setFunc] = useState('');
  const [result, setResult] = useState<unknown>(null);
  const [yaml, setYaml] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const businessName = business || businesses.data?.[0]?.name || '';
  const functionName = func || functions.data?.[0]?.name || '';

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { setResult(await action()); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const exportConfig = () => run(async () => {
    const text = await admin.runtimeConfigYaml(credentials, { group: 'default', businessName });
    downloadText(`${businessName}-runtime.yaml`, text);
    return text;
  });
  const exportDag = () => run(async () => {
    const text = await admin.dagYaml(credentials, { group: 'default', businessName });
    setYaml(text);
    downloadText(`${businessName}-dag.yaml`, text);
    return text;
  });
  const importDag = () => {
    if (!confirmAction('确认提交 YAML？已有 id 时会更新草稿，没有 id 时会创建新 DAG。这是高风险的配置写操作。')) return;
    run(async () => { const text = await admin.dagImportYaml(credentials, yaml); invalidate(); return text; });
  };

  return (
    <>
      <Header title="配置诊断" desc="检查业务与能力的引用关系，查看 Runtime 拿到的配置快照，并导入导出 DAG YAML。" />
      <section className="grid two diagnostics-grid">
        <div className="panel">
          <div className="panel-title"><div><h2>配置关系</h2><p>基于当前在线 DAG 解析双向依赖。</p></div><Link2 /></div>
          <div className="form-stack">
            <Field label="业务"><select value={businessName} onChange={e => setBusiness(e.target.value)}>{(businesses.data || []).map(item => <option key={item.name}>{item.name}</option>)}</select></Field>
            <button className="btn" disabled={busy || !businessName} onClick={() => run(() => admin.businessToFunctions(credentials, { group: 'default', businessName }))}>查询业务使用的能力</button>
            <Field label="能力"><select value={functionName} onChange={e => setFunc(e.target.value)}>{(functions.data || []).map(item => <option key={item.name}>{item.name}</option>)}</select></Field>
            <button className="btn" disabled={busy || !functionName} onClick={() => run(() => admin.funcToBusiness(credentials, { group: 'default', functionName }))}>查询能力影响的业务</button>
          </div>
        </div>
        <div className="panel">
          <div className="panel-title"><div><h2>运行配置快照</h2><p>读取管理服务提供给 Runtime API 的配置；经控制台返回时已去掉密钥字段。</p></div><Settings2 /></div>
          <div className="button-stack">
            <button className="btn" disabled={busy || !businessName} onClick={() => run(() => admin.runtimeConfig(credentials, { group: 'default', businessName }))}>查看 JSON 配置</button>
            <button className="btn" disabled={!canWrite || busy || !businessName} title={canWrite ? undefined : VIEWER_HINT} onClick={exportConfig}><Download />导出 Runtime YAML</button>
            <button className="btn" disabled={busy || !businessName} onClick={exportDag}><Download />导出 DAG YAML</button>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-title"><div><h2>DAG YAML 工作区</h2><p>导出后可审阅；导入属于高风险配置写操作。</p></div><Upload /></div>
        <textarea className="code-editor yaml-editor" spellCheck={false} value={yaml} onChange={e => setYaml(e.target.value)} placeholder="先导出 DAG，或粘贴 YAML 配置" />
        <button className="btn primary" disabled={!canWrite || busy || !yaml.trim()} title={canWrite ? undefined : VIEWER_HINT} onClick={importDag}><Upload />提交 YAML</button>
      </section>
      {error && <div className="alert error">{error}</div>}
      {busy && <div className="state"><LoaderCircle className="spin" />正在查询配置</div>}
      {result != null && <pre className="result-block">{typeof result === 'string' ? result : JSON.stringify(result, null, 2)}</pre>}
    </>
  );
}
