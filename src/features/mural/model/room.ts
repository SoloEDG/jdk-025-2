import type {
  Board,
  MuralConflictView,
  MuralEvidenceState,
  MuralPlacementState,
  MuralProofState,
  MuralState,
} from "../../../shared/types";
import { coordinate, neighbors } from "../../../shared/geometry";
import type { MuralPuzzle } from "./puzzle";
import {
  cellsOfPlacement,
  conflictItems,
  evidenceFingerprint,
  localSeamReport,
  minimalConflictGroup,
  pictureKeyOf,
  pinnedSignature,
  solveMural,
  validateCompleteLayout,
  type MuralPlacement,
} from "../lib/solver";
import {
  CLAIMS,
  claimAvailable,
  claimSourceCell,
  claimToEvidence,
  evidenceToSolver,
} from "./claims";
import { createMuralPuzzle, fragmentSources } from "./puzzle";

/** 封门背后的耳室：封门未开时不可进入。随地图生成而固定。 */
export function doorSealedCells(board: Board): number[] {
  if (!board.generated) return [];
  // 耳室是地图右缘靠下一片连续区域；优先取 2×3 的连续块，
  // 避免把远离封门的格子误标为「失去出口」。
  const startX = Math.max(0, board.width - 2);
  const blocks: number[][] = [];
  for (let startY = 0; startY + 3 <= board.height; startY++) {
    const ids: number[] = [];
    for (let y = startY; y < startY + 3; y++)
      for (let x = startX; x < board.width; x++)
        ids.push(y * board.width + x);
    blocks.push(ids);
  }
  const safeBlock = blocks.find((ids) =>
    ids.every((id) => {
      const c = board.cells[id];
      return c && !c.mine && !c.relic;
    }),
  );
  if (safeBlock) return safeBlock;
  const fallback: number[] = [];
  for (const c of board.cells) {
    if (fallback.length >= 6) break;
    if (!c.mine && !c.relic && c.id % board.width >= startX)
      fallback.push(c.id);
  }
  for (const c of board.cells) {
    if (fallback.length >= 6) break;
    if (!c.mine && !c.relic && !fallback.includes(c.id)) fallback.push(c.id);
  }
  return fallback.slice(0, 6);
}

export function emptyProof(): MuralProofState {
  return {
    status: "unproven",
    distinct: 0,
    exhausted: false,
    truncated: false,
    example: [],
    conflicts: [],
    claims: [],
    evidenceSources: 0,
    pinnedSignature: "[]",
    evidenceFingerprint: "[]",
    nodes: 0,
    checkedAt: 0,
    localSeams: {
      cells: 0,
      total: 16,
      matched: 0,
      mismatched: 0,
      openBoundary: 0,
      overlaps: 0,
      outOfBounds: 0,
    },
  };
}

export function createMuralState(board: Board): MuralState {
  return {
    door: "sealed",
    layout: [],
    pins: [],
    confirmed: null,
    proof: emptyProof(),
    evidence: [],
    proofStale: false,
    staleReason: "",
    rewarded: false,
    openedAt: null,
    sealedCells: doorSealedCells(board),
  };
}

function toPlacement(p: MuralPlacementState): MuralPlacement {
  return { ...p, pinned: false };
}

function fromPlacement(p: MuralPlacement): MuralPlacementState {
  return {
    fragment: p.fragment,
    x: p.x,
    y: p.y,
    rot: p.rot,
    flip: p.flip,
  };
}

export function evidenceContradictions(
  evidence: MuralEvidenceState[],
): MuralConflictView[] {
  const out: MuralConflictView[] = [];
  const strata = new Map<string, MuralEvidenceState>();
  const orientation = new Map<string, MuralEvidenceState>();
  for (const ev of evidence) {
    if (!ev.accepted) continue;
    if (ev.kind === "strata" && ev.fragment) {
      const prev = strata.get(ev.fragment);
      if (prev && prev.band !== ev.band)
        out.push({
          id: `${prev.id}+${ev.id}`,
          label: `${prev.sourceLabel} 与 ${ev.sourceLabel} 对同一碎片的地层判断相反`,
          reason: "同一碎片不能同时出自上、下地层",
          fragment: ev.fragment,
        });
      else strata.set(ev.fragment, ev);
    }
    if (ev.kind === "orientation" && ev.fragment) {
      const prev = orientation.get(ev.fragment);
      if (prev && prev.facing !== ev.facing)
        out.push({
          id: `${prev.id}+${ev.id}`,
          label: `${prev.sourceLabel} 与 ${ev.sourceLabel} 对铭文朝向的判断相反`,
          reason: "有向铭文只有一个正读朝向",
          fragment: ev.fragment,
        });
      else orientation.set(ev.fragment, ev);
    }
  }
  const joins = new Map<string, MuralEvidenceState>();
  for (const ev of evidence) {
    if (!ev.accepted || ev.kind !== "join" || !ev.a || !ev.b) continue;
    const key = [ev.a, ev.b].sort().join("|");
    const prev = joins.get(key);
    if (prev && prev.relation !== ev.relation)
      out.push({
        id: `${prev.id}+${ev.id}`,
        label: `${prev.sourceLabel} 与 ${ev.sourceLabel} 的伴出判断相反`,
        reason: "同一对碎片不能既相邻又分离",
        fragment: null,
      });
    else joins.set(key, ev);
  }
  return out;
}

function proofFrom(
  puzzle: MuralPuzzle,
  board: Board,
  mural: Pick<MuralState, "layout" | "pins" | "evidence">,
  now: number,
): MuralProofState {
  const solverEvidence = evidenceToSolver(mural.evidence);
  // 暂存的所有碎片都是玩家已经放下的摆法，必须作为固定约束参与检验；
  // 只有「固定位置」额外区分了玩家显式锁定的证据权重。
  const pins = mural.layout.map(toPlacement);
  const local = localSeamReport(puzzle, mural.layout);
  const sources = fragmentSources(board);
  const available = puzzle.fragments.filter(
    (f) => sources[f.id] !== null && !!board.cells[sources[f.id]!]?.revealed,
  );
  const base = {
    claims: mural.evidence.filter((e) => e.accepted).map((e) => e.id),
    evidenceSources: new Set(
      mural.evidence
        .filter((e) => e.accepted)
        .map((e) => e.sourceCell ?? -1)
        .filter((c) => c >= 0),
    ).size,
    pinnedSignature: pinnedSignature(pins),
    evidenceFingerprint: evidenceFingerprint(solverEvidence),
    checkedAt: now,
    localSeams: {
      cells: local.cells,
      total: local.total,
      matched: local.matched,
      mismatched: local.mismatched,
      openBoundary: local.openBoundary,
      overlaps: local.overlaps,
      outOfBounds: local.outOfBounds,
    },
  };
  // 碎片未齐时不存在完整补全：只能「尚未证实」，不能据此判冲突。
  if (available.length < puzzle.fragments.length) {
    return {
      ...base,
      status: "unproven",
      distinct: 0,
      exhausted: false,
      truncated: false,
      example: [],
      conflicts: [],
      nodes: 0,
    };
  }
  const contradiction = evidenceContradictions(mural.evidence);
  if (contradiction.length) {
    return {
      ...base,
      status: "conflict",
      distinct: 0,
      exhausted: true,
      truncated: false,
      example: [],
      conflicts: contradiction,
      nodes: 0,
    };
  }
  const result = solveMural(puzzle, pins, solverEvidence, {
    maxDistinct: 4,
    nodeBudget: 120000,
  });
  if (result.status === "conflict") {
    // 暂存摆法不能由系统擅自撤掉；最小冲突组只在证据之间寻找，
    // 若证据都已最小化，仍会附上玩家必须自行撤回的固定片。
    const group = minimalConflictGroup(puzzle, [], solverEvidence, {
      nodeBudget: 120000,
    });
    const reductionHelps =
      group.items.length < solverEvidence.length ||
      (solverEvidence.length === 0 && pins.length === 0);
    const staged = pins.map((pin) => ({
      id: `pin-${pin.fragment}`,
      label: `暂存 ${puzzle.fragments.find((f) => f.id === pin.fragment)?.label ?? pin.fragment} 于 (${pin.x + 1},${pin.y + 1})`,
      reason: "撤回该片或调整朝向后才能补成整幅",
      fragment: pin.fragment,
    }));
    const evidenceItems = group.items.map((item) => ({
      id: item.id,
      label: item.label,
      reason: item.reason,
      fragment: item.fragment,
    }));
    // 若去掉所有证据仍然无解，冲突一定来自玩家当前的暂存摆法；
    // 若去掉某条证据就能补全，则把它列出来由玩家决定是否撤回。
    let conflicts: MuralConflictView[];
    if (!reductionHelps && staged.length) conflicts = staged;
    else if (evidenceItems.length) conflicts = evidenceItems;
    else
      conflicts = conflictItems(puzzle, [], solverEvidence).map((item) => ({
        id: item.id,
        label: item.label,
        reason: item.reason,
        fragment: item.fragment,
      }));
    return {
      ...base,
      status: "conflict",
      distinct: 0,
      exhausted: true,
      truncated: false,
      example: [],
      conflicts,
      nodes: result.nodes + group.checks,
    };
  }
  if (result.status === "unproven" || (result.truncated && !result.example)) {
    return {
      ...base,
      status: "unproven",
      distinct: 0,
      exhausted: result.exhausted,
      truncated: result.truncated,
      example: [],
      conflicts: [],
      nodes: result.nodes,
    };
  }
  return {
    ...base,
    status: result.unique ? "unique" : "candidate",
    distinct: result.distinct,
    exhausted: result.exhausted,
    truncated: result.truncated,
    example: result.example
      ? result.example.placements.map(fromPlacement)
      : [],
    conflicts: [],
    nodes: result.nodes,
  };
}

/**
 * 同步地图、证据、暂存与固定位置，并重建证明状态。
 * 新证据若让旧证明失效，会保留旧证明依据并标记 stale。
 */
export function syncMural(
  mural: MuralState,
  board: Board,
  now: number,
  options: {
    keepStale?: boolean;
    previousEvidence?: MuralEvidenceState[];
    previousDoor?: MuralState["door"];
  } = {},
): MuralState {
  const puzzle = createMuralPuzzle(board);
  const next: MuralState = {
    ...mural,
    sealedCells: mural.sealedCells.length
      ? mural.sealedCells
      : doorSealedCells(board),
    layout: mural.layout.filter((p) =>
      puzzle.fragments.some((f) => f.id === p.fragment),
    ),
    pins: mural.pins.filter((p) =>
      puzzle.fragments.some((f) => f.id === p.fragment),
    ),
    evidence: [...mural.evidence],
  };
  // 出土碎片自带的证据自动进入证明依据；封门后的耳室题记属于「新证据」，
  // 默认不采信，由玩家决定是否引用——若引用后与旧证明冲突，旧证明标记失效。
  for (const claim of CLAIMS) {
    if (!claimAvailable(claim, puzzle, board, { door: next.door })) continue;
    // 已存在的证据保留玩家当前的采信/拒绝选择，不因刷新或同步被重置。
    if (next.evidence.some((e) => e.claimId === claim.id)) continue;
    next.evidence.push(
      claimToEvidence(
        claim,
        puzzle,
        board,
        next.door,
        claim.timing !== "late",
      ),
    );
  }
  const proof = proofFrom(puzzle, board, next, now);
  const stale =
    !!mural.confirmed &&
    (proof.status === "conflict" ||
      (mural.confirmed.length > 0 &&
        !validateCompleteLayout(
          puzzle,
          mural.confirmed,
          evidenceToSolver(next.evidence),
        ).valid));
  if (stale && !options.keepStale) {
    const previous = options.previousEvidence ?? mural.evidence;
    const before = new Set(
      previous.filter((e) => e.accepted).map((e) => e.claimId),
    );
    const added = next.evidence
      .filter((e) => e.accepted && !before.has(e.claimId))
      .map((e) => e.sourceLabel);
    const sourceBefore = new Set(
      previous.filter((e) => e.accepted).map((e) => e.sourceLabel),
    );
    const newlyAcceptedSources = next.evidence
      .filter(
        (e) => e.accepted && !sourceBefore.has(e.sourceLabel),
      )
      .map((e) => e.sourceLabel);
    next.proofStale = true;
    const cited = added.length ? added : newlyAcceptedSources;
    next.staleReason = cited.length
      ? `新证据「${cited.join("、")}」与既有证明冲突，旧证明已失效，请重新核对。`
      : "新证据与既有证明冲突，旧证明已失效。";
  } else if (proof.status !== "conflict") {
    next.proofStale = false;
    next.staleReason = "";
  }
  next.proof = proof;
  return next;
}

export interface MuralMutation {
  mural: MuralState;
  notice: string;
  changed: boolean;
}

function withProof(
  mural: MuralState,
  board: Board,
  now: number,
  notice: string,
): MuralMutation {
  return {
    mural: syncMural(mural, board, now),
    notice,
    changed: true,
  };
}

function clampAnchor(
  puzzle: MuralPuzzle,
  fragment: string,
  rot: number,
  flip: boolean,
  x: number,
  y: number,
) {
  const cells = cellsOfPlacement(puzzle, { fragment, x: 0, y: 0, rot, flip });
  if (!cells) return { x, y };
  const maxX = Math.max(...cells.map((c) => c.x));
  const maxY = Math.max(...cells.map((c) => c.y));
  return {
    x: Math.max(0, Math.min(x, puzzle.width - 1 - maxX)),
    y: Math.max(0, Math.min(y, puzzle.height - 1 - maxY)),
  };
}

export function muralPlace(
  mural: MuralState,
  board: Board,
  now: number,
  fragment: string,
  x: number,
  y: number,
  rot: number,
  flip: boolean,
): MuralMutation {
  const puzzle = createMuralPuzzle(board);
  const frag = puzzle.fragments.find((f) => f.id === fragment);
  if (!frag) return { mural, notice: "没有这块碎片。", changed: false };
  const source = fragmentSources(board)[fragment];
  if (source === null || !board.cells[source]?.revealed)
    return {
      mural,
      notice: `${frag.label} 尚未出土，先在地图上找到对应文物格。`,
      changed: false,
    };
  if (mural.pins.some((p) => p.fragment === fragment))
    return {
      mural,
      notice: `${frag.label} 已固定；如需移动，请先取消固定。`,
      changed: false,
    };
  const anchor = clampAnchor(puzzle, fragment, rot, flip, x, y);
  const cells = cellsOfPlacement(puzzle, {
    fragment,
    x: anchor.x,
    y: anchor.y,
    rot,
    flip,
  });
  if (!cells) return { mural, notice: "该朝向无法放入。", changed: false };
  if (
    cells.some(
      (c) =>
        c.x < 0 || c.y < 0 || c.x >= puzzle.width || c.y >= puzzle.height,
    )
  )
    return { mural, notice: "超出封门框，换一个锚点。", changed: false };
  const occupied = new Map<string, string>();
  for (const p of mural.layout) {
    if (p.fragment === fragment) continue;
    for (const c of cellsOfPlacement(puzzle, p) ?? [])
      occupied.set(c.x + "," + c.y, p.fragment);
  }
  const clash = cells.find((c) => occupied.has(c.x + "," + c.y));
  if (clash)
    return {
      mural,
      notice: "与已暂存的碎片重叠，同一格只能由一块碎片占用。",
      changed: false,
    };
  const layout = [
    ...mural.layout.filter((p) => p.fragment !== fragment),
    { fragment, x: anchor.x, y: anchor.y, rot, flip },
  ].sort((a, b) => a.fragment.localeCompare(b.fragment));
  return withProof(
    { ...mural, layout, pins: mural.pins.filter((p) => p.fragment !== fragment) },
    board,
    now,
    `${frag.label} 已暂存，封门仍保持封闭。`,
  );
}

export function muralRemove(
  mural: MuralState,
  board: Board,
  now: number,
  fragment: string,
): MuralMutation {
  if (mural.pins.some((p) => p.fragment === fragment))
    return {
      mural,
      notice: "固定位置需先取消固定，再取下碎片。",
      changed: false,
    };
  const frag = createMuralPuzzle(board).fragments.find(
    (f) => f.id === fragment,
  );
  return withProof(
    { ...mural, layout: mural.layout.filter((p) => p.fragment !== fragment) },
    board,
    now,
    `${frag?.label ?? fragment} 已取回暂存区。`,
  );
}

export function muralPin(
  mural: MuralState,
  board: Board,
  now: number,
  fragment: string,
  pinned: boolean,
): MuralMutation {
  const placed = mural.layout.find((p) => p.fragment === fragment);
  if (pinned && !placed)
    return { mural, notice: "先摆放这块碎片，才能固定位置。", changed: false };
  const pins = pinned
    ? [...mural.pins.filter((p) => p.fragment !== fragment), { ...placed! }]
    : mural.pins.filter((p) => p.fragment !== fragment);
  return withProof(
    { ...mural, pins },
    board,
    now,
    pinned
      ? "固定位置参与等价判断，其他补全必须与它兼容。"
      : "已取消固定。",
  );
}

export function muralTransform(
  mural: MuralState,
  board: Board,
  now: number,
  fragment: string,
  rotDelta: number,
  flip: boolean,
): MuralMutation {
  const placed = mural.layout.find((p) => p.fragment === fragment);
  if (!placed) return { mural, notice: "先摆放这块碎片。", changed: false };
  if (mural.pins.some((p) => p.fragment === fragment))
    return { mural, notice: "固定位置不能旋转或翻面，先取消固定。", changed: false };
  const frag = createMuralPuzzle(board).fragments.find(
    (f) => f.id === fragment,
  );
  const nextFlip = flip ? !placed.flip : placed.flip;
  const next = muralPlace(
    mural,
    board,
    now,
    fragment,
    placed.x,
    placed.y,
    (((placed.rot + rotDelta) % 4) + 4) % 4,
    nextFlip,
  );
  if (!next.changed) return next;
  return {
    ...next,
    notice:
      frag?.directional && nextFlip
        ? "已翻面：有向铭文翻面不是镜像等价，需由朝向证据裁决。"
        : next.notice,
  };
}

export function muralClear(
  mural: MuralState,
  board: Board,
  now: number,
): MuralMutation {
  if (!mural.layout.length && !mural.pins.length)
    return { mural, notice: "暂存区已经是空的。", changed: false };
  return withProof(
    { ...mural, layout: [], pins: [] },
    board,
    now,
    "暂存区已清空；封门状态与证据均保留。",
  );
}

export function muralApplyExample(
  mural: MuralState,
  board: Board,
  now: number,
): MuralMutation {
  if (!mural.proof.example.length)
    return {
      mural,
      notice:
        mural.proof.status === "conflict"
          ? "当前证据冲突，没有可采用的补全示例。"
          : "搜索尚未完成，暂时没有可采用的示例。",
      changed: false,
    };
  const layout = mural.proof.example.map((p) => ({ ...p }));
  const compatible = mural.pins.every((pin) =>
    layout.some(
      (p) =>
        p.fragment === pin.fragment &&
        p.x === pin.x &&
        p.y === pin.y &&
        p.rot === pin.rot &&
        p.flip === pin.flip,
    ),
  );
  if (!compatible)
    return {
      mural,
      notice: "示例与固定位置不一致，请先核对固定片。",
      changed: false,
    };
  const pinned = new Set(mural.pins.map((p) => p.fragment));
  return withProof(
    { ...mural, layout, pins: layout.filter((p) => pinned.has(p.fragment)) },
    board,
    now,
    mural.proof.status === "unique"
      ? "已按唯一补全示例摆放；确认后才会开启封门。"
      : "已采用一条补全示例；它还不是唯一证明，不能据此封门。",
  );
}

export function muralCheck(
  mural: MuralState,
  board: Board,
  now: number,
): MuralMutation {
  const next = syncMural(mural, board, now, { keepStale: true });
  return {
    mural: next,
    notice:
      next.proof.status === "unique"
        ? "搜索已穷尽：当前固定位置与证据只对应一幅完整图案。"
        : next.proof.status === "candidate"
          ? `尚可补全，但至少存在 ${next.proof.distinct} 种整幅方案，不能称为唯一。`
          : next.proof.status === "conflict"
            ? "当前固定位置或证据无法补成整幅，已给出最小冲突组。"
            : "搜索尚未完成，只能说尚未证实，不能断言完整。",
    changed: true,
  };
}

export function muralConfirm(
  mural: MuralState,
  board: Board,
  now: number,
): MuralMutation & { reward: number; openedCells: number[] } {
  if (mural.door === "open")
    return { mural, notice: "封门已经开启。", changed: false, reward: 0, openedCells: [] };
  const puzzle = createMuralPuzzle(board);
  const validation = validateCompleteLayout(
    puzzle,
    mural.layout,
    evidenceToSolver(mural.evidence),
  );
  if (!validation.valid)
    return {
      mural,
      notice: `尚不能确认：${validation.reasons[0] ?? "整幅条件不足"}。局部断口全匹配不等于整幅成立。`,
      changed: false,
      reward: 0,
      openedCells: [],
    };
  if (mural.proof.status !== "unique")
    return {
      mural,
      notice:
        mural.proof.status === "candidate"
          ? "整幅可以拼出，但还存在其他方案；请先让证据收敛为唯一。"
          : mural.proof.status === "conflict"
            ? "证据存在冲突，旧证明已失效，不能确认封门。"
            : "搜索尚未完成，只能说尚未证实，不能确认封门。",
      changed: false,
      reward: 0,
      openedCells: [],
    };
  const reward = mural.rewarded ? 0 : 80;
  const openedCells = mural.sealedCells;
  const next: MuralState = {
    ...mural,
    door: "open",
    confirmed: mural.layout.map((p) => ({ ...p })),
    pins: [],
    rewarded: true,
    openedAt: now,
  };
  return {
    mural: syncMural(next, board, now),
    notice: reward
      ? `封门开启，耳室通路已开放。首次修复记入勘探积分 +${reward}；已发现文物不重复计奖。`
      : "封门开启，耳室通路已开放；本次不再重复奖励。",
    changed: true,
    reward,
    openedCells,
  };
}

export function muralDismantle(
  mural: MuralState,
  board: Board,
  now: number,
  options: { recall?: boolean } = {},
): MuralMutation & { recalled: number[]; board: Board } {
  if (mural.door !== "open")
    return {
      mural,
      notice: "封门尚未开启。",
      changed: false,
      recalled: [],
      board,
    };
  // 先撤回再闭门：把耳室中已探索的格子退回未探索，避免闭门后
  // 留下无出口的孤立探索区。耳室按构造不含文物，因此不涉及奖励回退。
  const recalled = options.recall
    ? mural.sealedCells.filter((id) => board.cells[id]?.revealed)
    : [];
  const recalledSet = new Set(recalled);
  const nextBoard = recalled.length
    ? {
        ...board,
        cells: board.cells.map((c) =>
          recalledSet.has(c.id)
            ? { ...c, revealed: false, mark: "none" as const, intel: "unknown" as const }
            : c,
        ),
      }
    : board;
  const next: MuralState = {
    ...mural,
    door: "sealed",
    confirmed: null,
    layout: [],
    pins: [],
    openedAt: null,
  };
  return {
    mural: syncMural(next, nextBoard, now),
    notice: recalled.length
      ? `先撤回再闭门：耳室 ${recalled.length} 格探索记录已退回，封门重新封闭；已发现文物不重复奖励。`
      : "成品已拆除，封门重新封闭；仍未被探索的耳室区域失去出口，已发现文物不重复奖励。",
    changed: true,
    recalled,
    board: nextBoard,
  };
}

export function sealedAreaSummary(board: Board, sealedCells: number[]) {
  const revealed = sealedCells.filter((id) => board.cells[id]?.revealed);
  const hidden = sealedCells.filter((id) => !board.cells[id]?.revealed);
  return {
    total: sealedCells.length,
    revealed,
    hidden,
    coordinates: sealedCells.map((id) => coordinate(id, board.width)),
    hiddenCoordinates: hidden.map((id) => coordinate(id, board.width)),
  };
}

export function muralLayoutPreview(
  puzzle: MuralPuzzle,
  layout: MuralPlacementState[],
) {
  const map = new Map<
    number,
    { fragment: string; edges: (readonly [number, number])[] }
  >();
  for (const p of layout)
    for (const c of cellsOfPlacement(puzzle, p) ?? [])
      map.set(c.y * puzzle.width + c.x, {
        fragment: p.fragment,
        edges: c.edges,
      });
  return map;
}

export function muralPictureKey(
  puzzle: MuralPuzzle,
  layout: MuralPlacementState[],
) {
  return pictureKeyOf(layout.flatMap((p) => cellsOfPlacement(puzzle, p) ?? []));
}

export function claimCellLabels(
  puzzle: MuralPuzzle,
  board: Board,
  door: MuralState["door"],
) {
  return CLAIMS.map((claim) => ({
    claim,
    available: claimAvailable(claim, puzzle, board, { door }),
    cell: claimSourceCell(claim, puzzle, board, door),
  }));
}

export function sealedNeighbors(
  board: Board,
  sealedCells: number[],
  ids: number[],
) {
  const sealed = new Set(sealedCells);
  return ids.filter((id) =>
    neighbors(id, board.width, board.height).some((n) => sealed.has(n)),
  );
}

/** 从存档恢复后重建证明；不吞掉已保存的占用、证据来源与封门状态。 */
export function hydrateMural(mural: MuralState, board: Board, now: number) {
  return syncMural(mural, board, now, { keepStale: true });
}
