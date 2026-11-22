import type {
  MuralEdges,
  MuralFragmentDef,
  MuralPuzzle,
  MuralTransform,
} from "../model/puzzle";
import {
  cellsAdjacent,
  fragmentVariants,
  sameToken,
  transformCells,
  OUTER,
} from "../model/puzzle";

/**
 * 壁画校验器。
 *
 * 只沿接缝逐条检查会漏掉「局部都对、整体补不齐」的死局，因此这里做的是
 * 封门框上的精确覆盖搜索：每一格必须被恰好一块碎片覆盖，外缘必须闭合，
 * 地层/朝向/伴出关系等证据作为硬约束。
 *
 * 搜索按「整幅图案」去重（平移归一并按边纹规范化），所以同一图案的
 * 不同碎片编号写法不会被重复计数；固定位置与证据来源由调用方作为输入
 * 保留，不参与「整幅等价」的折叠，不会把不同证据链误判为同一方案。
 */

export type MuralEvidenceKind = "orientation" | "strata" | "join";

export interface MuralEvidenceBase {
  id: string;
  kind: MuralEvidenceKind;
  label: string;
  source: string;
  sourceCell: number | null;
  relic: string | null;
}

export interface MuralOrientationEvidence extends MuralEvidenceBase {
  kind: "orientation";
  fragment: string;
  facing: 0 | 1 | 2 | 3;
}

export interface MuralStrataEvidence extends MuralEvidenceBase {
  kind: "strata";
  fragment: string;
  band: "upper" | "lower";
}

export interface MuralJoinEvidence extends MuralEvidenceBase {
  kind: "join";
  a: string;
  b: string;
  relation: "adjacent" | "separate";
}

export type MuralEvidence =
  | MuralOrientationEvidence
  | MuralStrataEvidence
  | MuralJoinEvidence;

export interface MuralPlacement extends MuralTransform {
  fragment: string;
  pinned: boolean;
}

export interface MuralSolution {
  placements: MuralPlacement[];
  pictureKey: string;
}

export type MuralSolveStatus = "proven" | "conflict" | "unproven";

export interface MuralConflictItem {
  type: "pin" | "evidence";
  id: string;
  label: string;
  fragment: string | null;
  reason: string;
}

export interface MuralSolveResult {
  status: MuralSolveStatus;
  distinct: number;
  unique: boolean;
  exhausted: boolean;
  truncated: boolean;
  nodes: number;
  example: MuralSolution | null;
  evidenceFingerprint: string;
  pinnedSignature: string;
}

interface Option {
  fragment: string;
  x: number;
  y: number;
  rot: number;
  flip: boolean;
  cells: { x: number; y: number; edges: MuralEdges }[];
  mask: number;
}

export function evidenceFingerprint(evidence: MuralEvidence[]) {
  return JSON.stringify(
    [...evidence]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((e) => [
        e.id,
        e.kind,
        e.kind === "join"
          ? `${e.a}|${e.b}|${e.relation}`
          : `${e.fragment}|${"facing" in e ? e.facing : e.band}`,
      ]),
  );
}

export function pinnedSignature(pins: MuralPlacement[]) {
  return JSON.stringify(
    [...pins]
      .sort((a, b) => a.fragment.localeCompare(b.fragment))
      .map((p) => [p.fragment, p.x, p.y, p.rot, p.flip]),
  );
}

export function pictureKeyOf(
  cells: { x: number; y: number; edges: MuralEdges }[],
): string | null {
  if (!cells.length) return null;
  const minX = Math.min(...cells.map((c) => c.x));
  const minY = Math.min(...cells.map((c) => c.y));
  return JSON.stringify(
    cells
      .map((c) => [c.x - minX, c.y - minY, c.edges])
      .sort((a, b) =>
        `${a[0]},${a[1]}`.localeCompare(`${b[0]},${b[1]}`),
      ),
  );
}

/** 按指定变换直接求碎片覆盖的格子（不看是否在合法变体列表里）。 */
export function cellsOfPlacement(
  puzzle: MuralPuzzle,
  placement: MuralTransform & { fragment: string },
) {
  const frag = puzzle.fragments.find((f) => f.id === placement.fragment);
  if (!frag) return null;
  return transformCells(frag.cells, placement.rot, placement.flip).map(
    (c) => ({
      x: c.x + placement.x,
      y: c.y + placement.y,
      edges: c.edges,
    }),
  );
}

function cellFits(
  cell: { x: number; y: number; edges: MuralEdges },
  placed: Map<number, MuralEdges>,
  width: number,
  height: number,
) {
  if (cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height)
    return false;
  const dirs: [number, number][] = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  for (let d = 0; d < 4; d++) {
    const [dx, dy] = dirs[d];
    const nx = cell.x + dx;
    const ny = cell.y + dy;
    const outside = nx < 0 || ny < 0 || nx >= width || ny >= height;
    if (outside) {
      if (!sameToken(cell.edges[d], OUTER)) return false;
      continue;
    }
    const other = placed.get(ny * width + nx);
    if (other && !sameToken(other[(d + 2) % 4], cell.edges[d])) return false;
  }
  return true;
}

export function bandRows(band: "upper" | "lower", height: number) {
  const mid = Math.ceil(height / 2);
  return band === "upper"
    ? ([0, mid - 1] as const)
    : ([mid, height - 1] as const);
}

function orientationEvidenceFor(
  evidence: MuralEvidence[],
  fragment: string,
): MuralOrientationEvidence | null {
  return (
    evidence.find(
      (e): e is MuralOrientationEvidence =>
        e.kind === "orientation" && e.fragment === fragment,
    ) ?? null
  );
}

function strataEvidenceFor(
  evidence: MuralEvidence[],
  fragment: string,
): MuralStrataEvidence | null {
  return (
    evidence.find(
      (e): e is MuralStrataEvidence =>
        e.kind === "strata" && e.fragment === fragment,
    ) ?? null
  );
}

function joinEvidence(evidence: MuralEvidence[]) {
  return evidence.filter(
    (e): e is MuralJoinEvidence => e.kind === "join",
  );
}

export function orientationSatisfies(
  frag: MuralFragmentDef,
  ev: MuralOrientationEvidence,
  rot: number,
  flip: boolean,
) {
  if (frag.directional) return !flip && (frag.facing + rot) % 4 === ev.facing;
  return (frag.facing + rot) % 4 === ev.facing;
}

function buildOptions(
  puzzle: MuralPuzzle,
  evidence: MuralEvidence[],
) {
  const byFragment = new Map<string, Option[]>();
  for (const frag of puzzle.fragments) {
    const orientation = orientationEvidenceFor(evidence, frag.id);
    const strata = strataEvidenceFor(evidence, frag.id);
    const rows = strata
      ? bandRows(strata.band, puzzle.height)
      : ([0, puzzle.height - 1] as const);
    const options: Option[] = [];
    for (const variant of fragmentVariants(frag)) {
      if (
        orientation &&
        !orientationSatisfies(frag, orientation, variant.rot, variant.flip)
      )
        continue;
      const maxX = Math.max(...variant.cells.map((c) => c.x));
      const maxY = Math.max(...variant.cells.map((c) => c.y));
      for (let ax = 0; ax + maxX < puzzle.width; ax++) {
        for (let ay = 0; ay + maxY < puzzle.height; ay++) {
          let mask = 0;
          let ok = true;
          const cells: Option["cells"] = [];
          for (const c of variant.cells) {
            const x = ax + c.x;
            const y = ay + c.y;
            if (y < rows[0] || y > rows[1]) {
              ok = false;
              break;
            }
            const bit = 1 << (y * puzzle.width + x);
            if (mask & bit) {
              ok = false;
              break;
            }
            mask |= bit;
            cells.push({ x, y, edges: c.edges });
          }
          if (!ok) continue;
          options.push({
            fragment: frag.id,
            x: ax,
            y: ay,
            rot: variant.rot,
            flip: variant.flip,
            cells,
            mask,
          });
        }
      }
    }
    byFragment.set(frag.id, options);
  }
  return byFragment;
}

export interface LayoutValidation {
  valid: boolean;
  reasons: string[];
  pictureKey: string | null;
  cells: number;
}

/** 当前整幅摆法是否完整、闭合且满足全部证据。 */
export function validateCompleteLayout(
  puzzle: MuralPuzzle,
  placements: (MuralTransform & { fragment: string })[],
  evidence: MuralEvidence[],
): LayoutValidation {
  const reasons: string[] = [];
  if (placements.length !== puzzle.fragments.length)
    reasons.push("尚未使用全部碎片");
  const ids = new Set(placements.map((p) => p.fragment));
  if (ids.size !== placements.length) reasons.push("同一碎片被重复占用");
  if (ids.size !== puzzle.fragments.length) reasons.push("仍有碎片未入框");

  const cells = new Map<number, MuralEdges>();
  const byFragment = new Map<string, { x: number; y: number }[]>();
  for (const p of placements) {
    const frag = puzzle.fragments.find((f) => f.id === p.fragment);
    if (!frag) {
      reasons.push(`未知碎片 ${p.fragment}`);
      continue;
    }
    const transformed = cellsOfPlacement(puzzle, p);
    if (!transformed) continue;
    for (const c of transformed) {
      if (
        c.x < 0 ||
        c.y < 0 ||
        c.x >= puzzle.width ||
        c.y >= puzzle.height
      ) {
        reasons.push(`${frag.label} 超出封门框`);
        continue;
      }
      const index = c.y * puzzle.width + c.x;
      if (cells.has(index)) reasons.push(`${frag.label} 与其他碎片重叠`);
      else cells.set(index, c.edges);
      const list = byFragment.get(frag.id) ?? [];
      list.push({ x: c.x, y: c.y });
      byFragment.set(frag.id, list);
    }
    const orientation = orientationEvidenceFor(evidence, frag.id);
    if (orientation && !orientationSatisfies(frag, orientation, p.rot, p.flip))
      reasons.push(`${frag.label} 与铭文朝向证据冲突`);
    const strata = strataEvidenceFor(evidence, frag.id);
    if (strata) {
      const rows = bandRows(strata.band, puzzle.height);
      if (transformed.some((c) => c.y < rows[0] || c.y > rows[1]))
        reasons.push(`${frag.label} 与地层证据冲突`);
    }
  }
  if (cells.size !== puzzle.width * puzzle.height)
    reasons.push("封门框仍有空格");
  for (let y = 0; y < puzzle.height; y++)
    for (let x = 0; x < puzzle.width; x++) {
      const edges = cells.get(y * puzzle.width + x);
      if (!edges) continue;
      const right = cells.get(y * puzzle.width + x + 1);
      const down = cells.get((y + 1) * puzzle.width + x);
      if (x + 1 >= puzzle.width) {
        if (!sameToken(edges[1], OUTER)) reasons.push("右侧外缘未闭合");
      } else if (right && !sameToken(edges[1], right[3]))
        reasons.push("横向断口不吻合");
      if (y + 1 >= puzzle.height) {
        if (!sameToken(edges[2], OUTER)) reasons.push("下方外缘未闭合");
      } else if (down && !sameToken(edges[2], down[0]))
        reasons.push("纵向断口不吻合");
    }
  for (const ev of joinEvidence(evidence)) {
    const a = byFragment.get(ev.a) ?? [];
    const b = byFragment.get(ev.b) ?? [];
    if (!a.length || !b.length) continue;
    const adjacent = cellsAdjacent(a, b);
    if (ev.relation === "adjacent" && !adjacent)
      reasons.push(`${ev.label}：两片并未相邻`);
    if (ev.relation === "separate" && adjacent)
      reasons.push(`${ev.label}：两片不应相邻`);
  }
  return {
    valid: reasons.length === 0,
    reasons: [...new Set(reasons)],
    pictureKey: pictureKeyOf(
      placements.flatMap((p) => cellsOfPlacement(puzzle, p) ?? []),
    ),
    cells: cells.size,
  };
}

/** 仅做逐缝检查；用于向玩家说明「局部全匹配不等于整幅成立」。 */
export function localSeamReport(
  puzzle: MuralPuzzle,
  placements: (MuralTransform & { fragment: string })[],
) {
  const cells = new Map<number, MuralEdges>();
  let overlaps = 0;
  let outOfBounds = 0;
  for (const p of placements) {
    const transformed = cellsOfPlacement(puzzle, p);
    if (!transformed) continue;
    for (const c of transformed) {
      if (
        c.x < 0 ||
        c.y < 0 ||
        c.x >= puzzle.width ||
        c.y >= puzzle.height
      ) {
        outOfBounds++;
        continue;
      }
      const index = c.y * puzzle.width + c.x;
      if (cells.has(index)) overlaps++;
      else cells.set(index, c.edges);
    }
  }
  let matched = 0;
  let mismatched = 0;
  let openBoundary = 0;
  for (let y = 0; y < puzzle.height; y++)
    for (let x = 0; x < puzzle.width; x++) {
      const edges = cells.get(y * puzzle.width + x);
      if (!edges) continue;
      if (x + 1 >= puzzle.width) {
        if (!sameToken(edges[1], OUTER)) openBoundary++;
      } else {
        const right = cells.get(y * puzzle.width + x + 1);
        if (!right) {
          if (!sameToken(edges[1], OUTER)) openBoundary++;
        } else if (sameToken(edges[1], right[3])) matched++;
        else mismatched++;
      }
      if (y + 1 >= puzzle.height) {
        if (!sameToken(edges[2], OUTER)) openBoundary++;
      } else {
        const down = cells.get((y + 1) * puzzle.width + x);
        if (!down) {
          if (!sameToken(edges[2], OUTER)) openBoundary++;
        } else if (sameToken(edges[2], down[0])) matched++;
        else mismatched++;
      }
    }
  return {
    cells: cells.size,
    total: puzzle.width * puzzle.height,
    matched,
    mismatched,
    openBoundary,
    overlaps,
    outOfBounds,
  };
}

interface SearchState {
  grid: Map<number, MuralEdges>;
  used: Set<string>;
  assignments: Map<string, MuralTransform>;
  mask: number;
}

function solutionFromState(state: SearchState, puzzle: MuralPuzzle) {
  const placements: MuralPlacement[] = [];
  const cells: { x: number; y: number; edges: MuralEdges }[] = [];
  for (const [fragment, transform] of state.assignments) {
    const transformed = cellsOfPlacement(puzzle, { fragment, ...transform });
    if (!transformed) continue;
    placements.push({
      fragment,
      x: transform.x,
      y: transform.y,
      rot: transform.rot,
      flip: transform.flip,
      pinned: false,
    });
    cells.push(...transformed);
  }
  return { placements, pictureKey: pictureKeyOf(cells) ?? "" };
}

export interface SolveOptions {
  maxDistinct?: number;
  nodeBudget?: number;
}

export function solveMural(
  puzzle: MuralPuzzle,
  pins: MuralPlacement[],
  evidence: MuralEvidence[],
  options: SolveOptions = {},
): MuralSolveResult {
  const maxDistinct = options.maxDistinct ?? 2;
  const nodeBudget = options.nodeBudget ?? 150000;
  const width = puzzle.width;
  const height = puzzle.height;
  const cellCount = width * height;
  const state: SearchState = {
    grid: new Map(),
    used: new Set(),
    assignments: new Map(),
    mask: 0,
  };
  const joins = joinEvidence(evidence);
  let nodes = 0;
  let truncated = false;
  let exhausted = true;
  const solutions = new Map<string, MuralSolution>();

  const pinProblems: string[] = [];
  for (const pin of pins) {
    const frag = puzzle.fragments.find((f) => f.id === pin.fragment);
    if (!frag) {
      pinProblems.push(`未知碎片 ${pin.fragment}`);
      continue;
    }
    if (state.used.has(pin.fragment)) {
      pinProblems.push(`${frag.label} 被固定了不止一次`);
      continue;
    }
    const transformed = cellsOfPlacement(puzzle, pin);
    if (!transformed) {
      pinProblems.push(`${frag.label} 的朝向不合法`);
      continue;
    }
    let bad = false;
    for (const c of transformed) {
      if (!cellFits(c, state.grid, width, height)) {
        pinProblems.push(`${frag.label} 与已固定碎片的断口不符`);
        bad = true;
        break;
      }
    }
    if (bad) continue;
    const orientation = orientationEvidenceFor(evidence, frag.id);
    if (
      orientation &&
      !orientationSatisfies(frag, orientation, pin.rot, pin.flip)
    ) {
      pinProblems.push(`${frag.label} 与铭文朝向证据冲突`);
      continue;
    }
    const strata = strataEvidenceFor(evidence, frag.id);
    if (strata) {
      const rows = bandRows(strata.band, height);
      if (transformed.some((c) => c.y < rows[0] || c.y > rows[1])) {
        pinProblems.push(`${frag.label} 与地层证据冲突`);
        continue;
      }
    }
    for (const c of transformed) {
      const index = c.y * width + c.x;
      state.grid.set(index, c.edges);
      state.mask |= 1 << index;
    }
    state.used.add(pin.fragment);
    state.assignments.set(pin.fragment, {
      x: pin.x,
      y: pin.y,
      rot: pin.rot,
      flip: pin.flip,
    });
  }

  const fragmentCells = (fragment: string) => {
    const t = state.assignments.get(fragment);
    if (!t) return [];
    return (cellsOfPlacement(puzzle, { fragment, ...t }) ?? []).map((c) => ({
      x: c.x,
      y: c.y,
    }));
  };

  const joinsSatisfied = () => {
    for (const ev of joins) {
      if (!state.used.has(ev.a) || !state.used.has(ev.b)) continue;
      const adjacent = cellsAdjacent(
        fragmentCells(ev.a),
        fragmentCells(ev.b),
      );
      if (ev.relation === "adjacent" && !adjacent) return false;
      if (ev.relation === "separate" && adjacent) return false;
    }
    return true;
  };

  const record = () => {
    const solution = solutionFromState(state, puzzle);
    solution.placements = solution.placements.map((p) => ({
      ...p,
      pinned: pins.some((q) => q.fragment === p.fragment),
    }));
    if (!solutions.has(solution.pictureKey))
      solutions.set(solution.pictureKey, solution);
  };

  const fingerprint = evidenceFingerprint(evidence);
  const signature = pinnedSignature(pins);
  if (pinProblems.length || !joinsSatisfied()) {
    return {
      status: "conflict",
      distinct: 0,
      unique: false,
      exhausted: true,
      truncated: false,
      nodes: 0,
      example: null,
      evidenceFingerprint: fingerprint,
      pinnedSignature: signature,
    };
  }

  if (state.mask === (1 << cellCount) - 1) {
    record();
  } else {
    const optionsByFragment = buildOptions(puzzle, evidence);
    const allOptions = [...optionsByFragment.values()].flat();
    const byCell = new Map<number, Option[]>();
    for (const opt of allOptions) {
      for (const c of opt.cells) {
        const index = c.y * width + c.x;
        const list = byCell.get(index) ?? [];
        list.push(opt);
        byCell.set(index, list);
      }
    }

    const canPlace = (opt: Option) => {
      if (state.used.has(opt.fragment)) return false;
      if (opt.mask & state.mask) return false;
      for (const c of opt.cells)
        if (!cellFits(c, state.grid, width, height)) return false;
      return true;
    };

    const place = (opt: Option) => {
      state.used.add(opt.fragment);
      state.assignments.set(opt.fragment, {
        x: opt.x,
        y: opt.y,
        rot: opt.rot,
        flip: opt.flip,
      });
      for (const c of opt.cells) {
        const index = c.y * width + c.x;
        state.grid.set(index, c.edges);
        state.mask |= 1 << index;
      }
    };

    const unplace = (opt: Option) => {
      state.used.delete(opt.fragment);
      state.assignments.delete(opt.fragment);
      for (const c of opt.cells) {
        const index = c.y * width + c.x;
        state.grid.delete(index);
        state.mask &= ~(1 << index);
      }
    };

    const chooseCell = () => {
      let best: { index: number; candidates: Option[] } | null = null;
      for (let index = 0; index < cellCount; index++) {
        if (state.grid.has(index)) continue;
        const candidates = (byCell.get(index) ?? []).filter(canPlace);
        if (best === null || candidates.length < best.candidates.length)
          best = { index, candidates };
        if (candidates.length === 0) break;
      }
      return best;
    };

    const dfs = () => {
      nodes++;
      if (nodes > nodeBudget) {
        truncated = true;
        exhausted = false;
        return;
      }
      if (solutions.size >= maxDistinct) {
        exhausted = false;
        return;
      }
      if (state.mask === (1 << cellCount) - 1) {
        record();
        return;
      }
      const choice = chooseCell();
      if (!choice || choice.candidates.length === 0) return;
      for (const opt of choice.candidates) {
        place(opt);
        if (joinsSatisfied()) dfs();
        unplace(opt);
        if (truncated || solutions.size >= maxDistinct) return;
      }
    };
    dfs();
  }

  const distinct = solutions.size;
  const example = solutions.values().next().value ?? null;
  if (distinct > 0) {
    return {
      status: "proven",
      distinct,
      unique: distinct === 1 && exhausted && !truncated,
      exhausted,
      truncated,
      nodes,
      example,
      evidenceFingerprint: fingerprint,
      pinnedSignature: signature,
    };
  }
  return {
    status: truncated ? "unproven" : "conflict",
    distinct: 0,
    unique: false,
    exhausted,
    truncated,
    nodes,
    example: null,
    evidenceFingerprint: fingerprint,
    pinnedSignature: signature,
  };
}

function conflictItemForEvidence(ev: MuralEvidence): MuralConflictItem {
  return {
    type: "evidence",
    id: ev.id,
    label: ev.label,
    fragment: ev.kind === "join" ? null : ev.fragment,
    reason: "证据参与约束",
  };
}

function conflictItemForPin(
  puzzle: MuralPuzzle,
  pin: MuralPlacement,
): MuralConflictItem {
  const frag = puzzle.fragments.find((f) => f.id === pin.fragment);
  return {
    type: "pin",
    id: `pin-${pin.fragment}`,
    label: `固定 ${frag?.label ?? pin.fragment} 于 (${pin.x + 1},${pin.y + 1})`,
    fragment: pin.fragment,
    reason: "固定位置参与约束",
  };
}

/**
 * 删除式最小冲突组：反复尝试去掉一个约束，若仍然无解则永久去掉。
 * 返回「删掉其中任何一项就会变得可补全」的最小片组/证据组。
 */
export function minimalConflictGroup(
  puzzle: MuralPuzzle,
  pins: MuralPlacement[],
  evidence: MuralEvidence[],
  options: SolveOptions = {},
): { items: MuralConflictItem[]; checks: number } {
  type Item =
    | { type: "pin"; pin: MuralPlacement }
    | { type: "evidence"; evidence: MuralEvidence };
  const items: Item[] = [
    ...pins.map((pin) => ({ type: "pin" as const, pin })),
    ...evidence.map((evidence) => ({
      type: "evidence" as const,
      evidence,
    })),
  ];
  let checks = 0;
  let current = [...items];
  for (const item of items) {
    const candidate = current.filter((x) => x !== item);
    const candidatePins = candidate
      .filter(
        (x): x is { type: "pin"; pin: MuralPlacement } =>
          x.type === "pin",
      )
      .map((x) => x.pin);
    const candidateEvidence = candidate
      .filter(
        (x): x is { type: "evidence"; evidence: MuralEvidence } =>
          x.type === "evidence",
      )
      .map((x) => x.evidence);
    checks++;
    const result = solveMural(puzzle, candidatePins, candidateEvidence, {
      ...options,
      maxDistinct: 1,
    });
    if (result.status === "conflict" && result.exhausted)
      current = candidate;
  }
  return {
    items: current.map((item) =>
      item.type === "pin"
        ? conflictItemForPin(puzzle, item.pin)
        : conflictItemForEvidence(item.evidence),
    ),
    checks,
  };
}

export function conflictItems(
  puzzle: MuralPuzzle,
  pins: MuralPlacement[],
  evidence: MuralEvidence[],
): MuralConflictItem[] {
  return [
    ...pins.map((pin) => conflictItemForPin(puzzle, pin)),
    ...evidence.map(conflictItemForEvidence),
  ];
}
