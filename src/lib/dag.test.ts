import { describe, expect, it } from 'vitest';
import type { DagNode } from '../types';
import { GUARD_TEMPLATE, JUDGE_TEMPLATE, MEDIA_EXTRACT_TEMPLATE } from './functionTypes';
import {
  buildDagEdges, connectDagNodes, disconnectDagNodes, extractRouteTargets, insertTieredTemplate,
  renameDagNode, tieredTemplateNodes, validateDag,
} from './dag';

const baseNodes: DagNode[] = [
  { nodeId: 'start', functionConf: { ref: 'keyword' }, routerConf: { type: 'groovy', name: 'groovy', conf: { script: "if (ok) return 'safe'\nreturn 'risk'" } } },
  { nodeId: 'safe', functionConf: { ref: 'keyword' }, routerConf: { type: 'stupid_end', name: 'stupid_end' } },
  { nodeId: 'risk', functionConf: { ref: 'bert' }, routerConf: { type: 'stupid_end', name: 'stupid_end' } },
];

const tiered = () => tieredTemplateNodes(GUARD_TEMPLATE, JUDGE_TEMPLATE, MEDIA_EXTRACT_TEMPLATE);

describe('DAG graph conversion', () => {
  it('extracts Groovy route targets and builds visual edges', () => {
    expect(extractRouteTargets(baseNodes[0])).toEqual(['safe', 'risk']);
    expect(buildDagEdges(baseNodes).map(edge => [edge.source, edge.target])).toEqual([['start', 'safe'], ['start', 'risk']]);
  });

  it('renames a node and all supported inbound references', () => {
    const renamed = renameDagNode(baseNodes, 'safe', 'approved');
    expect(renamed[1].nodeId).toBe('approved');
    expect(renamed[0].routerConf?.conf?.script).toContain("return 'approved'");
  });

  it('reads ternary branches and ignores literals compared in conditions', () => {
    const node: DagNode = {
      nodeId: 'start',
      routerConf: { type: 'groovy', conf: { script: "def req = ctx.curReq[0]\nreturn req.role == 'robot' ? 'robot_check' : \"user_check\"" } },
    };
    expect(extractRouteTargets(node)).toEqual(['robot_check', 'user_check']);
    const renamed = renameDagNode([node], 'user_check', 'input_check');
    expect(renamed[0].routerConf?.conf?.script).toContain("req.role == 'robot' ? 'robot_check' : \"input_check\"");
  });

  it('creates and removes a direct visual connection', () => {
    const connected = connectDagNodes(baseNodes, 'safe', 'risk');
    expect(connected[1].routerConf).toEqual({ type: 'simple_next', name: 'simple_next', conf: { nodeId: 'risk' } });
    expect(disconnectDagNodes(connected, 'safe', 'risk')[1].routerConf?.type).toBe('stupid_end');
  });
});

describe('DAG validation', () => {
  it('accepts a reachable acyclic graph', () => {
    expect(validateDag(baseNodes, 'start')).toEqual({ errors: [], warnings: [] });
  });

  it('reports dangling references, cycles, and unreachable nodes', () => {
    const nodes: DagNode[] = [
      { nodeId: 'start', functionConf: { ref: 'a' }, routerConf: { type: 'simple_next', name: 'simple_next', conf: { nodeId: 'loop' } } },
      { nodeId: 'loop', functionConf: { ref: 'b' }, routerConf: { type: 'simple_next', name: 'simple_next', conf: { nodeId: 'start' } } },
      { nodeId: 'orphan', functionConf: { ref: 'c' }, routerConf: { type: 'simple_next', name: 'simple_next', conf: { nodeId: 'missing' } } },
    ];
    const result = validateDag(nodes, 'start');
    expect(result.errors.some(message => message.includes('环路'))).toBe(true);
    expect(result.errors.some(message => message.includes('missing'))).toBe(true);
    expect(result.warnings).toEqual(['存在不可达节点：orphan']);
  });
});

describe('tiered review (guard_check + llm_judge)', () => {
  it('parses the tiered template and labels the escalation edge', () => {
    const start: DagNode = { nodeId: 'start', functionConf: { type: 'dummy', name: 'dummy' }, routerConf: { type: 'simple_next', name: 'simple_next', conf: { nodeId: 'media_extract' } } };
    const nodes = [start, ...tiered()];
    expect(validateDag(nodes, 'start')).toEqual({ errors: [], warnings: [] });
    const edges = buildDagEdges(nodes);
    expect(edges.map(edge => [edge.source, edge.target])).toEqual([
      ['start', 'media_extract'], ['media_extract', 'keyword_check'], ['keyword_check', 'mm_guard'], ['mm_guard', 'llm_judge'],
    ]);
    expect(edges.find(edge => edge.source === 'mm_guard')?.label).toBe('低置信升级');
    expect(edges.find(edge => edge.source === 'keyword_check')?.label).toBe('分支 1');
  });

  it('labels the escalation edge when nodes reference registered functions', () => {
    const nodes: DagNode[] = [
      { nodeId: 'gate', functionConf: { ref: 'mm_guard' }, routerConf: { type: 'groovy', name: 'groovy', conf: { script: "return guard.escalate ? 'judge' : null" } } },
      { nodeId: 'judge', functionConf: { ref: 'llm_judge' }, routerConf: { type: 'stupid_end', name: 'stupid_end' } },
    ];
    expect(buildDagEdges(nodes, { mm_guard: 'guard_check', llm_judge: 'llm_judge' })[0].label).toBe('低置信升级');
  });

  it('inserts the template, links it from an existing node and rejects id clashes', () => {
    const start: DagNode[] = [{ nodeId: 'start', functionConf: { type: 'dummy', name: 'dummy' }, routerConf: { type: 'stupid_end', name: 'stupid_end' } }];
    const next = insertTieredTemplate(start, tiered(), 'start');
    expect(next).toHaveLength(5);
    expect(next[0].routerConf).toEqual({ type: 'simple_next', name: 'simple_next', conf: { nodeId: 'media_extract' } });
    expect(validateDag(next, 'start').errors).toEqual([]);
    expect(() => insertTieredTemplate(next, tiered())).toThrow('节点 ID 已存在');
  });
});
