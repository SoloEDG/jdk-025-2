import type { Board } from "../../../shared/types";

/**
 * 壁画修复的静态题面。
 *
 * 每块碎片的四条边由「断口编号 + 纹样编号」组成；(0, 0) 表示封门图案的外缘。
 * 拼接是否成立必须同时满足：断口吻合、纹样吻合、外缘封闭、碎片互不重叠、
 * 恰好铺满封门框、以及地层（upper 必须整体位于 lower 之上）。
 *
 * 有方向的铭文碎片不会把「镜像」折叠成等价朝向：翻面后的铭文被视为另一种
 * 摆法，只有铭文正读的朝向才能作为证据支持的补全。
 */

export type MuralBand = "upper" | "lower";
export type MuralDirection = 0 | 1 | 2 | 3;
export type EdgeToken = readonly [number, number];
export type MuralEdges = [EdgeToken, EdgeToken, EdgeToken, EdgeToken];

export interface MuralFragmentCell {
  x: number;
  y: number;
  edges: MuralEdges;
}

export interface MuralProvenance {
  label: string;
  cell: number | null;
}

export interface MuralFragmentDef {
  id: string;
  label: string;
  symbol: string;
  cells: MuralFragmentCell[];
  band: MuralBand;
  directional: boolean;
  facing: MuralDirection;
  provenance: MuralProvenance;
}

export interface MuralTransform {
  x: number;
  y: number;
  rot: number;
  flip: boolean;
}

export interface MuralPuzzle {
  version: 1;
  width: number;
  height: number;
  seed: string;
  fragments: MuralFragmentDef[];
  /** 生成题面时埋入的完整摆法，只用于内部完整性自检。 */
  hidden: Record<string, MuralTransform>;
}

export interface MuralVariant {
  rot: number;
  flip: boolean;
  cells: { x: number; y: number; edges: MuralEdges }[];
}

const FLIP_DIR: MuralDirection[] = [0, 3, 2, 1];
export const OUTER: EdgeToken = [0, 0];

export function rotateCell(
  x: number,
  y: number,
  rot: number,
  flip: boolean,
): [number, number] {
  if (flip) x = -x;
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) {
    const nx = -y;
    const ny = x;
    x = nx;
    y = ny;
  }
  return [x, y];
}

export function rotateDir(
  d: MuralDirection,
  rot: number,
  flip: boolean,
): MuralDirection {
  const base = flip ? FLIP_DIR[d] : d;
  return ((((base + rot) % 4) + 4) % 4) as MuralDirection;
}

export function inverseDir(
  d: MuralDirection,
  rot: number,
  flip: boolean,
): MuralDirection {
  const unrot = ((((d - rot) % 4) + 4) % 4) as MuralDirection;
  return (flip ? FLIP_DIR[unrot] : unrot) as MuralDirection;
}

export function inverseCell(
  x: number,
  y: number,
  rot: number,
  flip: boolean,
): [number, number] {
  for (let i = 0; i < (((4 - rot) % 4) + 4) % 4; i++) {
    const nx = -y;
    const ny = x;
    x = nx;
    y = ny;
  }
  if (flip) x = -x;
  return [x, y];
}

export function transformCells(
  cells: MuralFragmentCell[],
  rot: number,
  flip: boolean,
): { x: number; y: number; edges: MuralEdges }[] {
  const out = cells.map((cell) => {
    const [x, y] = rotateCell(cell.x, cell.y, rot, flip);
    const edges = [OUTER, OUTER, OUTER, OUTER] as MuralEdges;
    for (let d = 0; d < 4; d++) {
      edges[rotateDir(d as MuralDirection, rot, flip)] = cell.edges[d];
    }
    return { x, y, edges };
  });
  const minX = Math.min(...out.map((c) => c.x));
  const minY = Math.min(...out.map((c) => c.y));
  return out.map((c) => ({ ...c, x: c.x - minX, y: c.y - minY }));
}

export function inverseTransformCells(
  cells: MuralFragmentCell[],
  rot: number,
  flip: boolean,
): { x: number; y: number; edges: MuralEdges }[] {
  const out = cells.map((cell) => {
    const [x, y] = inverseCell(cell.x, cell.y, rot, flip);
    const edges = [OUTER, OUTER, OUTER, OUTER] as MuralEdges;
    for (let d = 0; d < 4; d++) {
      edges[inverseDir(d as MuralDirection, rot, flip)] = cell.edges[d];
    }
    return { x, y, edges };
  });
  const minX = Math.min(...out.map((c) => c.x));
  const minY = Math.min(...out.map((c) => c.y));
  return out.map((c) => ({ ...c, x: c.x - minX, y: c.y - minY }));
}

export function variantCells(
  frag: MuralFragmentDef,
  rot: number,
  flip: boolean,
) {
  return transformCells(frag.cells, rot, flip);
}

export function sameToken(a: EdgeToken, b: EdgeToken) {
  return a[0] === b[0] && a[1] === b[1];
}

export function cellsAdjacent(
  a: { x: number; y: number }[],
  b: { x: number; y: number }[],
) {
  return a.some((p) =>
    b.some((q) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y) === 1),
  );
}

const tok = (fracture: number, motif: number): EdgeToken => [fracture, motif];

interface FragmentSpec {
  id: string;
  label: string;
  symbol: string;
  band: MuralBand;
  directional: boolean;
  provenance: string;
  cells: { x: number; y: number; edges: [EdgeToken, EdgeToken, EdgeToken, EdgeToken] }[];
}

/**
 * 经穷举验证的封门图案。6 块碎片恰好铺满 4×4 的封门框；
 * 未取得铭文朝向/地层证据前存在 4 种整幅补全，取得后收敛为唯一解。
 * 数据来自题面推导，修改任何一条边都会改变唯一性。
 */
const FRAGMENT_SPECS: FragmentSpec[] = [
  {
    id: "P1",
    label: "日轮残壁",
    symbol: "☼",
    band: "upper",
    directional: false,
    provenance: "出土编号 M-01 · 北壁塌落层",
    cells: [
      { x: 0, y: 0, edges: [tok(0, 0), tok(3, 1), tok(6, 2), tok(0, 0)] },
      { x: 1, y: 0, edges: [tok(0, 0), tok(3, 2), tok(1, 1), tok(3, 1)] },
      { x: 0, y: 1, edges: [tok(6, 2), tok(2, 2), tok(6, 3), tok(0, 0)] },
    ],
  },
  {
    id: "P2",
    label: "祭文铭板",
    symbol: "☰",
    band: "upper",
    directional: true,
    provenance: "出土编号 M-02 · 祭坛东侧",
    cells: [
      { x: 0, y: 0, edges: [tok(0, 0), tok(3, 3), tok(1, 2), tok(3, 2)] },
      { x: 1, y: 0, edges: [tok(0, 0), tok(0, 0), tok(4, 1), tok(3, 3)] },
      { x: 1, y: 1, edges: [tok(4, 1), tok(0, 0), tok(4, 2), tok(2, 2)] },
    ],
  },
  {
    id: "P3",
    label: "藤纹边饰",
    symbol: "⌁",
    band: "lower",
    directional: false,
    provenance: "出土编号 M-03 · 门楣裂隙",
    cells: [
      { x: 1, y: 0, edges: [tok(4, 2), tok(0, 0), tok(4, 3), tok(2, 1)] },
      { x: 1, y: 1, edges: [tok(4, 3), tok(0, 0), tok(0, 0), tok(5, 1)] },
      { x: 0, y: 1, edges: [tok(1, 2), tok(5, 1), tok(0, 0), tok(5, 2)] },
    ],
  },
  {
    id: "P4",
    label: "星位刻石",
    symbol: "✦",
    band: "lower",
    directional: false,
    provenance: "出土编号 M-04 · 星图基座",
    cells: [
      { x: 1, y: 1, edges: [tok(1, 1), tok(5, 2), tok(0, 0), tok(5, 3)] },
      { x: 0, y: 1, edges: [tok(6, 1), tok(5, 3), tok(0, 0), tok(0, 0)] },
      { x: 0, y: 0, edges: [tok(6, 3), tok(2, 1), tok(6, 1), tok(0, 0)] },
    ],
  },
  {
    id: "P5",
    label: "陶纹基座",
    symbol: "♜",
    band: "upper",
    directional: true,
    provenance: "出土编号 M-05 · 南侧窑址",
    cells: [
      { x: 0, y: 0, edges: [tok(1, 1), tok(1, 1), tok(2, 1), tok(2, 2)] },
      { x: 1, y: 0, edges: [tok(1, 2), tok(2, 2), tok(2, 2), tok(1, 1)] },
    ],
  },
  {
    id: "P6",
    label: "水波纹板",
    symbol: "≋",
    band: "lower",
    directional: false,
    provenance: "出土编号 M-06 · 排水暗沟",
    cells: [
      { x: 0, y: 0, edges: [tok(2, 1), tok(1, 2), tok(1, 1), tok(2, 1)] },
      { x: 1, y: 0, edges: [tok(2, 2), tok(2, 1), tok(1, 2), tok(1, 2)] },
    ],
  },
];

export const HIDDEN_LAYOUT: Record<string, MuralTransform> = {
  P1: { x: 0, y: 0, rot: 0, flip: false },
  P2: { x: 2, y: 0, rot: 0, flip: false },
  P3: { x: 2, y: 2, rot: 0, flip: false },
  P4: { x: 0, y: 2, rot: 0, flip: false },
  P5: { x: 1, y: 1, rot: 0, flip: false },
  P6: { x: 1, y: 2, rot: 0, flip: false },
};

export function createMuralPuzzle(board: Board): MuralPuzzle {
  return {
    version: 1,
    width: 4,
    height: 4,
    seed: `${board.seed}|${board.difficulty}|mural-1`,
    fragments: FRAGMENT_SPECS.map((f) => ({
      id: f.id,
      label: f.label,
      symbol: f.symbol,
      band: f.band,
      directional: f.directional,
      facing: 0,
      provenance: { label: f.provenance, cell: null },
      cells: f.cells.map((c) => ({
        x: c.x,
        y: c.y,
        edges: [...c.edges] as MuralEdges,
      })),
    })),
    hidden: { ...HIDDEN_LAYOUT },
  };
}

/**
 * 生成碎片的所有物理朝向。
 *
 * 无向碎片：旋转/镜像后若边纹完全相同，视为同一个摆放。
 * 有向铭文：镜像不会被折叠为同一方案，因此保留 flip 变体；
 * 真正能否成立由朝向证据与完整性校验决定。
 */
export function fragmentVariants(frag: MuralFragmentDef): MuralVariant[] {
  const seen = new Set<string>();
  const out: MuralVariant[] = [];
  for (const flip of [false, true]) {
    for (let rot = 0; rot < 4; rot++) {
      const cells = transformCells(frag.cells, rot, flip);
      if (!frag.directional) {
        const geometry = JSON.stringify(
          [...cells]
            .map((c) => [c.x, c.y, c.edges])
            .sort((a, b) =>
              `${a[0]},${a[1]}`.localeCompare(`${b[0]},${b[1]}`),
            ),
        );
        if (seen.has(geometry)) continue;
        seen.add(geometry);
      }
      out.push({ rot, flip, cells });
    }
  }
  return out;
}

export function isFragmentRecovered(
  board: Board,
  sourceCell: number | null,
) {
  if (sourceCell === null) return false;
  return !!board.cells[sourceCell]?.revealed;
}

/**
 * 碎片与出土位置：按文物格编号排序，依次对应 P1..P6。
 * 只有已被揭开的安全文物格才算「出土」，因此刷新后可从地图恢复。
 */
export function fragmentSources(board: Board) {
  const relicCells = board.cells
    .filter((c) => c.relic)
    .map((c) => c.id)
    .sort((a, b) => a - b);
  const map: Record<string, number | null> = {};
  FRAGMENT_SPECS.forEach((f, i) => {
    map[f.id] = relicCells[i] ?? null;
  });
  return map;
}


/** 封门后耳室题记的出土格：取最大编号文物格之外的已知格。 */
export function anteroomCell(board: Board) {
  const relicCells = board.cells
    .filter((c) => c.relic)
    .map((c) => c.id)
    .sort((a, b) => a - b);
  // 耳室题记复用最后一处文物格，避免引入额外地图改动。
  return relicCells[relicCells.length - 1] ?? null;
}
