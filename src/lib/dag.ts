// DAG 纯函数：从路由抽取目标、建边、重命名、连线/断线、校验，以及分级审核模板。
import type { DagNode } from '../types';

const DIRECT_ROUTER_TYPES = new Set(['simple_next', 'keyword', 'user_end', 'robot_end', 'risk_end']);

export const ROUTER_TYPES = ['simple_next', 'keyword', 'user_end', 'robot_end', 'risk_end', 'groovy', 'stupid_end'];

export const isDirectRouter = (type?: string) => !!type && DIRECT_ROUTER_TYPES.has(type);

export function cloneDag(value: DagNode[] | null | undefined): DagNode[] {
  return JSON.parse(JSON.stringify(value ?? [])) as DagNode[];
}

// return 后面的分支字面量：直接返回（return 'a'）和三元表达式（return x ? 'a' : 'b'）两种写法都识别；
// 条件里的比较值（x == 'foo'）前面是运算符而不是 ? / :，不会被当成目标节点。
const RETURN_EXPR = /\breturn\b([^\n;]*)/g;
const BRANCH_LITERAL = /(?:^|[?:])\s*['"]([^'"]+)['"]/g;

export function routeTargetsFromScript(script: string): string[] {
  const targets: string[] = [];
  for (const statement of script.matchAll(RETURN_EXPR)) {
    for (const literal of statement[1].matchAll(BRANCH_LITERAL)) targets.push(literal[1]);
  }
  return [...new Set(targets)];
}

export function extractRouteTargets(node: DagNode | undefined): string[] {
  const router = node?.routerConf;
  if (!router) return [];
  if (isDirectRouter(router.type)) return router.conf?.nodeId ? [router.conf.nodeId] : [];
  if (router.type !== 'groovy') return [];
  return routeTargetsFromScript(router.conf?.script || '');
}

const functionType = (node?: DagNode) => node?.functionConf?.type;

/** 安全模型门控 → 裁判的连线标注“低置信升级”（对应路由脚本里的 guard.escalate ? 'llm_judge' : null）。 */
export function edgeLabel(source: DagNode, target: DagNode | undefined, index: number, functionTypes: Record<string, string> = {}): string {
  const sourceType = functionType(source) || functionTypes[source.functionConf?.ref || ''];
  const targetType = functionType(target) || functionTypes[target?.functionConf?.ref || ''];
  if (sourceType === 'guard_check' && targetType === 'llm_judge') return '低置信升级';
  return source.routerConf?.type === 'groovy' ? `分支 ${index + 1}` : '';
}

export interface DagEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export function buildDagEdges(nodes: DagNode[], functionTypes: Record<string, string> = {}): DagEdge[] {
  const byId = new Map(nodes.map(node => [node.nodeId, node]));
  return nodes.flatMap(node => extractRouteTargets(node).map((target, index) => ({
    id: `${node.nodeId}::${target}::${index}`,
    source: node.nodeId,
    target,
    label: edgeLabel(node, byId.get(target), index, functionTypes),
  })));
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function renameDagNode(nodes: DagNode[], oldId: string, newId: string): DagNode[] {
  if (oldId === newId) return cloneDag(nodes);
  const routePattern = new RegExp(`((?:\\breturn\\s+|\\?\\s*|:\\s*)['"])${escapeRegExp(oldId)}(['"])`, 'g');
  const renameInScript = (script: string) => script.split('\n')
    .map(line => (/\breturn\b/.test(line) ? line.replace(routePattern, `$1${newId}$2`) : line))
    .join('\n');
  return cloneDag(nodes).map(node => {
    if (node.nodeId === oldId) node.nodeId = newId;
    const router = node.routerConf;
    if (router && isDirectRouter(router.type) && router.conf?.nodeId === oldId) router.conf.nodeId = newId;
    if (router?.type === 'groovy' && router.conf?.script) router.conf.script = renameInScript(router.conf.script);
    return node;
  });
}

export function connectDagNodes(nodes: DagNode[], source: string, target: string): DagNode[] {
  const next = cloneDag(nodes);
  const sourceNode = next.find(node => node.nodeId === source);
  if (!sourceNode) throw new Error(`找不到源节点 ${source}`);
  if (source === target) throw new Error('节点不能连接到自身');
  const router = sourceNode.routerConf;
  if (router?.type === 'groovy' && extractRouteTargets(sourceNode).length) {
    throw new Error('该节点使用 Groovy 条件路由，请在右侧脚本中添加或调整分支');
  }
  sourceNode.routerConf = router?.type === 'groovy'
    ? { type: 'groovy', name: 'groovy', conf: { script: `return '${target}'` } }
    : { type: 'simple_next', name: 'simple_next', conf: { nodeId: target } };
  return next;
}

export function disconnectDagNodes(nodes: DagNode[], source: string, target: string): DagNode[] {
  const next = cloneDag(nodes);
  const sourceNode = next.find(node => node.nodeId === source);
  if (!sourceNode) return next;
  const router = sourceNode.routerConf;
  if (router && isDirectRouter(router.type) && router.conf?.nodeId === target) {
    sourceNode.routerConf = { type: 'stupid_end', name: 'stupid_end' };
    return next;
  }
  if (router?.type === 'groovy' && /^\s*return\s+['"][^'"]+['"]\s*;?\s*$/.test(router.conf?.script || '')) {
    sourceNode.routerConf = { type: 'stupid_end', name: 'stupid_end' };
    return next;
  }
  throw new Error('复杂 Groovy 分支不能从画布直接删除，请在右侧脚本中修改');
}

export interface DagDiagnostics {
  errors: string[];
  warnings: string[];
}

export function validateDag(nodes: unknown, rootId: string): DagDiagnostics {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!Array.isArray(nodes) || nodes.length === 0) return { errors: ['节点配置必须是非空数组'], warnings };
  const list = nodes as DagNode[];
  const ids = list.map(node => node?.nodeId).filter(Boolean);
  const idSet = new Set(ids);
  if (ids.length !== list.length) errors.push('每个节点都必须设置 nodeId');
  if (idSet.size !== ids.length) errors.push('nodeId 必须唯一');
  if (!rootId || !idSet.has(rootId)) errors.push(`根节点 ${rootId || '(未设置)'} 不存在`);

  list.forEach(node => {
    if (!node?.nodeId) return;
    const fc = node.functionConf;
    if (!fc || (!fc.ref && !fc.type)) errors.push(`${node.nodeId} 未配置 Function 引用或内联类型`);
    const children = (fc?.conf?.functionConfs as { ref?: string }[] | undefined) || [];
    children.forEach(item => { if (!item.ref) errors.push(`${node.nodeId} 存在空 Function 引用`); });
    const router = node.routerConf;
    if (!router?.type) errors.push(`${node.nodeId} 未配置路由类型`);
    if (router && isDirectRouter(router.type) && !router.conf?.nodeId) errors.push(`${node.nodeId} 的 ${router.type} 路由未设置下一节点`);
    extractRouteTargets(node).forEach(target => {
      if (target === node.nodeId) errors.push(`${node.nodeId} 不能路由到自身`);
      else if (!idSet.has(target)) errors.push(`${node.nodeId} 路由指向不存在的节点 ${target}`);
    });
  });

  if (rootId && idSet.has(rootId)) {
    const adjacency = new Map(list.map(node => [node.nodeId, extractRouteTargets(node).filter(id => idSet.has(id))]));
    const visited = new Set<string>();
    const visiting = new Set<string>();
    let cycle: string[] | null = null;
    const walk = (id: string, path: string[]) => {
      if (cycle) return;
      if (visiting.has(id)) { cycle = [...path.slice(path.indexOf(id)), id]; return; }
      if (visited.has(id)) return;
      visiting.add(id);
      (adjacency.get(id) || []).forEach(next => walk(next, [...path, id]));
      visiting.delete(id);
      visited.add(id);
    };
    walk(rootId, []);
    if (cycle) errors.push(`检测到环路：${(cycle as string[]).join(' -> ')}`);
    const reachable = new Set<string>();
    const mark = (id: string) => {
      if (reachable.has(id)) return;
      reachable.add(id);
      (adjacency.get(id) || []).forEach(mark);
    };
    mark(rootId);
    const unreachable = ids.filter(id => !reachable.has(id));
    if (unreachable.length) warnings.push(`存在不可达节点：${unreachable.join('、')}`);
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

export const TIERED_NODE_IDS = ['media_extract', 'keyword_check', 'mm_guard', 'llm_judge'];

/** 一键插入的分级审核节点：media_extract → keyword → mm_guard → llm_judge，内容同 layers_with_guard_judge.yml。 */
export function tieredTemplateNodes(guardConf: Record<string, unknown>, judgeConf: Record<string, unknown>, mediaConf: Record<string, unknown>, keywordRef = 'keyword'): DagNode[] {
  return [
    {
      nodeId: 'media_extract',
      functionConf: { type: 'media_extract', name: 'media_extract', timeoutMilliseconds: 5000, conf: mediaConf },
      routerConf: { type: 'groovy', name: 'groovy', conf: { script: "def me = ctx.curResult\nif (me != null && me.hasRisk()) {\n    return null\n}\nreturn 'keyword_check'" } },
      ignoreError: true,
    },
    {
      nodeId: 'keyword_check',
      functionConf: { ref: keywordRef },
      routerConf: { type: 'groovy', name: 'groovy', conf: { script: "def kw = ctx.curResult\n// 黑名单命中直接结束；其余交给安全模型\nif (kw != null && kw.hasRisk()) {\n    return null\n}\nreturn 'mm_guard'" } },
      ignoreError: true,
    },
    {
      nodeId: 'mm_guard',
      functionConf: { type: 'guard_check', name: 'mm_guard', timeoutMilliseconds: 1500, conf: guardConf },
      routerConf: { type: 'groovy', name: 'groovy', conf: { script: "def guard = ctx.curResult\n// 安全模型调用失败（超时/服务不可用）时整条交给裁判兜底\nif (guard == null) {\n    return 'llm_judge'\n}\n// 置信度低于阈值 / 争议类 / 拿不到置信度 -> 升级；否则以第一层结论结束\nreturn guard.escalate ? 'llm_judge' : null" } },
      ignoreError: true,
    },
    {
      nodeId: 'llm_judge',
      functionConf: { type: 'llm_judge', name: 'llm_judge', timeoutMilliseconds: 4000, conf: judgeConf },
      routerConf: { type: 'stupid_end', name: 'stupid_end' },
      ignoreError: true,
    },
  ];
}

/** 把分级审核模板插进现有 DAG：节点 ID 冲突时报错；可选让某个节点直接路由到 media_extract。 */
export function insertTieredTemplate(nodes: DagNode[], template: DagNode[], linkFrom?: string): DagNode[] {
  const existing = new Set(nodes.map(node => node.nodeId));
  const clash = template.map(node => node.nodeId).filter(id => existing.has(id));
  if (clash.length) throw new Error(`节点 ID 已存在：${clash.join('、')}，请先重命名或删除`);
  let next = [...cloneDag(nodes), ...cloneDag(template)];
  if (linkFrom) {
    const source = next.find(node => node.nodeId === linkFrom);
    if (!source) throw new Error(`找不到节点 ${linkFrom}`);
    if (source.routerConf?.type === 'groovy' && extractRouteTargets(source).length) {
      throw new Error(`${linkFrom} 使用 Groovy 条件路由，请在脚本里手动加上 return 'media_extract'`);
    }
    next = connectDagNodes(next, linkFrom, template[0].nodeId);
  }
  return next;
}
