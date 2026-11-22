import type {
  Board,
  MuralDoor,
  MuralEvidenceState,
  RelicId,
} from "../../../shared/types";
import type { MuralEvidence } from "../lib/solver";
import type { MuralFragmentDef, MuralPuzzle } from "./puzzle";
import { anteroomCell, fragmentSources } from "./puzzle";

export interface ClaimDef {
  id: string;
  fragment: string;
  kind: "orientation" | "strata" | "join";
  label: string;
  detail: string;
  sourceLabel: string;
  facing?: 0 | 1 | 2 | 3;
  band?: "upper" | "lower";
  a?: string;
  b?: string;
  relation?: "adjacent" | "separate";
  /** late: 封门开启后，在耳室题记处才出现。 */
  timing: "fragment" | "late";
}

/**
 * 证据声明。来源碎片/题记是证明链的一部分：同一条「纹样」若来自不同
 * 探方，即使约束形式相同也不折叠为同一条证据。
 */
export const CLAIMS: ClaimDef[] = [
  {
    id: "c-p1-strata",
    fragment: "P1",
    kind: "strata",
    label: "日轮残壁出自上地层",
    detail: "北壁塌落层压在上层淤土之下，只能落在封门上段。",
    sourceLabel: "M-01 层位记录",
    band: "upper",
    timing: "fragment",
  },
  {
    id: "c-p2-orient",
    fragment: "P2",
    kind: "orientation",
    label: "祭文铭板必须正读朝北",
    detail: "铭文第一行朝北；倒置或镜像都会让祭文反向，不能作为替代摆法。",
    sourceLabel: "M-02 铭文拓片",
    facing: 0,
    timing: "fragment",
  },
  {
    id: "c-p3-strata",
    fragment: "P3",
    kind: "strata",
    label: "藤纹边饰出自下地层",
    detail: "门楣裂隙的填土属于下层堆积，碎片应在封门下段。",
    sourceLabel: "M-03 层位记录",
    band: "lower",
    timing: "fragment",
  },
  {
    id: "c-p4-strata",
    fragment: "P4",
    kind: "strata",
    label: "星位刻石出自下地层",
    detail: "星图基座与下层铺石同层，不会浮在上段。",
    sourceLabel: "M-04 层位记录",
    band: "lower",
    timing: "fragment",
  },
  {
    id: "c-p5-strata",
    fragment: "P5",
    kind: "strata",
    label: "陶纹基座出自上地层",
    detail: "窑址废料压在上层封土中，位置应高于下层纹样。",
    sourceLabel: "M-05 层位记录",
    band: "upper",
    timing: "fragment",
  },
  {
    id: "c-p5-orient",
    fragment: "P5",
    kind: "orientation",
    label: "陶纹基座铭文朝北",
    detail: "基座内壁刻辞朝向入口，旋转后仍须保持正读。",
    sourceLabel: "M-05 刻辞照片",
    facing: 0,
    timing: "fragment",
  },
  {
    id: "c-p6-strata",
    fragment: "P6",
    kind: "strata",
    label: "水波纹板出自下地层",
    detail: "排水暗沟的沉积层低于封门中线。",
    sourceLabel: "M-06 层位记录",
    band: "lower",
    timing: "fragment",
  },
  {
    id: "c-p2p3-join",
    fragment: "P2",
    kind: "join",
    label: "祭文铭板与藤纹边饰伴出",
    detail: "两片在同一探方内叠压，搬运前应共享一条断口。",
    sourceLabel: "M-02/M-03 伴出记录",
    a: "P2",
    b: "P3",
    relation: "adjacent",
    timing: "fragment",
  },
  {
    id: "c-p1p6-join",
    fragment: "P6",
    kind: "join",
    label: "日轮残壁与水波纹板应分离",
    detail: "两条排水沟之间的扰动层显示两片不曾相贴。",
    sourceLabel: "M-06 沟渠记录",
    a: "P1",
    b: "P6",
    relation: "separate",
    timing: "fragment",
  },
  {
    id: "c-late-p5-strata",
    fragment: "P5",
    kind: "strata",
    label: "耳室题记：陶纹基座属下地层",
    detail:
      "封门背后的题记把陶纹基座记为下层遗物。若它成立，先前把 P5 放在上段的证明就需要重验。",
    sourceLabel: "耳室题记 · 封门后新出土",
    band: "lower",
    timing: "late",
  },
];

export function claimById(id: string) {
  return CLAIMS.find((c) => c.id === id) ?? null;
}

export function claimSourceCell(
  claim: ClaimDef,
  puzzle: MuralPuzzle,
  board: Board,
  door: MuralDoor,
) {
  if (claim.timing === "late") return door === "open" ? anteroomCell(board) : null;
  void puzzle;
  const sources = fragmentSources(board);
  return sources[claim.fragment] ?? null;
}

export function claimAvailable(
  claim: ClaimDef,
  puzzle: MuralPuzzle,
  board: Board,
  state: { door: MuralDoor },
) {
  const cell = claimSourceCell(claim, puzzle, board, state.door);
  if (cell === null) return false;
  if (claim.timing === "late" && state.door !== "open") return false;
  return !!board.cells[cell]?.revealed;
}

export function fragmentRelic(board: Board, cell: number | null): RelicId | null {
  if (cell === null) return null;
  return board.cells[cell]?.relic ?? null;
}

export function claimToEvidence(
  claim: ClaimDef,
  puzzle: MuralPuzzle,
  board: Board,
  door: MuralDoor,
  accepted = true,
): MuralEvidenceState {
  const sourceCell = claimSourceCell(claim, puzzle, board, door);
  return {
    id: claim.id,
    claimId: claim.id,
    kind: claim.kind,
    label: claim.label,
    sourceLabel: claim.sourceLabel,
    sourceCell,
    relic: fragmentRelic(board, sourceCell),
    accepted,
    fragment: claim.kind === "join" ? undefined : claim.fragment,
    a: claim.a,
    b: claim.b,
    relation: claim.relation,
    facing: claim.facing,
    band: claim.band,
  };
}

export function evidenceToSolver(
  evidence: MuralEvidenceState[],
): MuralEvidence[] {
  const out: MuralEvidence[] = [];
  for (const e of evidence) {
    if (!e.accepted) continue;
    const base = {
      id: e.id,
      label: e.label,
      source: e.sourceLabel,
      sourceCell: e.sourceCell,
      relic: e.relic,
    };
    if (e.kind === "orientation" && e.fragment)
      out.push({
        ...base,
        kind: "orientation",
        fragment: e.fragment,
        facing: (e.facing ?? 0) as 0 | 1 | 2 | 3,
      });
    else if (e.kind === "strata" && e.fragment)
      out.push({
        ...base,
        kind: "strata",
        fragment: e.fragment,
        band: (e.band ?? "upper") as "upper" | "lower",
      });
    else if (e.kind === "join" && e.a && e.b)
      out.push({
        ...base,
        kind: "join",
        a: e.a,
        b: e.b,
        relation: (e.relation ?? "adjacent") as "adjacent" | "separate",
      });
  }
  return out;
}

export function claimDetail(claimId: string) {
  return claimById(claimId)?.detail ?? "";
}

export function claimFragmentLabel(
  fragments: MuralFragmentDef[],
  id: string | undefined,
) {
  if (!id) return "—";
  return fragments.find((f) => f.id === id)?.label ?? id;
}

