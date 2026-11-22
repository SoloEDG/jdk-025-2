import { useMemo, useState } from "react";
import {
  Grid3X3,
  Layers,
  DoorClosed,
  DoorOpen,
  TriangleAlert,
  ScrollText,
  Link2,
  Compass,
  X,
  Check,
  ArrowUpRight,
} from "lucide-react";
import type {
  Expedition,
  MuralState,
  PublicBoard,
} from "../../../shared/types";
import type { Command } from "../../../shared/commands";
import type { MuralPuzzle } from "../model/puzzle";
import { CLAIMS } from "../model/claims";
import { muralLayoutPreview } from "../model/room";
import { cellsAdjacent } from "../model/puzzle";
import { cellsOfPlacement } from "../lib/solver";
import { MuralPanel } from "./MuralPanel";
import { cellName, placementLabel, rotationName } from "./labels";

export interface MuralRoomProps {
  expedition: Expedition;
  board: PublicBoard;
  mural: MuralState;
  puzzle: MuralPuzzle;
  send: (command: Command) => void;
  onOpenMap: () => void;
}

export function MuralRoom({
  expedition,
  board,
  mural,
  puzzle,
  send,
  onOpenMap,
}: MuralRoomProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"confirm" | "dismantle" | null>(null);
  const preview = useMemo(
    () => muralLayoutPreview(puzzle, mural.layout),
    [puzzle, mural.layout],
  );
  const fragmentOf = (id: string) =>
    puzzle.fragments.find((f) => f.id === id) ?? null;
  const placedPieces = new Map(mural.layout.map((p) => [p.fragment, p]));
  const pinned = new Set(mural.pins.map((p) => p.fragment));
  const firstEmpty = () => {
    for (let y = 0; y < puzzle.height; y++)
      for (let x = 0; x < puzzle.width; x++)
        if (!preview.has(y * puzzle.width + x)) return { x, y };
    return { x: 0, y: 0 };
  };
  const placeAt = (fragment: string, x: number, y: number) => {
    const frag = fragmentOf(fragment);
    if (!frag) return;
    // 保留玩家已调整的朝向；未摆放过才从默认朝向开始。
    const existing = placedPieces.get(fragment);
    send({
      type: "mural-place",
      fragment,
      x,
      y,
      rot: existing?.rot ?? 0,
      flip: existing?.flip ?? false,
    });
  };
  const occupiedBySelected = selected
    ? placedPieces.get(selected) ?? null
    : null;
  const selectedEvidence = CLAIMS.filter((c) => c.fragment === selected);
  // 若玩家手动取消采信，保留可见的「未采信」状态，而不是自动重新采信。
  const evidenceCount = mural.evidence.filter((e) => e.accepted).length;
  const placedFragments = puzzle.fragments;
  const adjacentPairs: [string, string][] = [];
  for (let i = 0; i < placedFragments.length; i++)
    for (let j = i + 1; j < placedFragments.length; j++) {
      const a = mural.layout.find((p) => p.fragment === placedFragments[i].id);
      const b = mural.layout.find((p) => p.fragment === placedFragments[j].id);
      if (!a || !b) continue;
      const ac = cellsOfPlacement(puzzle, a) ?? [];
      const bc = cellsOfPlacement(puzzle, b) ?? [];
      if (cellsAdjacent(ac, bc))
        adjacentPairs.push([placedFragments[i].id, placedFragments[j].id]);
    }
  const sealedSet = new Set(mural.sealedCells);
  const sealedRevealed = mural.sealedCells.filter((id) =>
    expedition.board.cells[id]?.revealed,
  );
  const sealedHidden = mural.sealedCells.filter(
    (id) => !expedition.board.cells[id]?.revealed,
  );

  return (
    <div className="mural-workspace">
      <MuralPanel
        expedition={expedition}
        board={board}
        puzzle={puzzle}
        layout={mural.layout}
        pins={mural.pins}
        door={mural.door}
        proofStatus={mural.proof.status}
        distinct={mural.proof.distinct}
        example={mural.proof.example}
        conflicts={mural.proof.conflicts.map((c) => ({
          id: c.id,
          label: c.label,
          reason: c.reason,
        }))}
        localSeams={mural.proof.localSeams}
        proofStale={mural.proofStale}
        staleReason={mural.staleReason}
        evidenceCount={mural.proof.claims.length}
        evidenceSources={mural.proof.evidenceSources}
        selected={selected}
        onSelect={setSelected}
        onPlaceAtSlot={(fragment) => {
          const slot = firstEmpty();
          placeAt(fragment, slot.x, slot.y);
          setSelected(fragment);
        }}
        onOpenConfirm={() => setDialog("confirm")}
        onOpenDismantle={() => setDialog("dismantle")}
        onCommand={send}
      />
      <div className="mural-side">
        <section className="mural-frame-panel">
          <div className="panel-heading">
            <Grid3X3 size={14} />
            <h2>封门框</h2>
            <span>
              {puzzle.width} × {puzzle.height}
            </span>
          </div>
          <div className="mural-frame-axis">
            {Array.from({ length: puzzle.width }, (_, i) => (
              <span key={i}>{String.fromCharCode(65 + i)}</span>
            ))}
          </div>
          <div
            className="mural-frame"
            style={{
              gridTemplateColumns: `repeat(${puzzle.width}, 1fr)`,
            }}
            role="grid"
            aria-label="封门图案拼装区"
            aria-rowcount={puzzle.height}
            aria-colcount={puzzle.width}
          >
            {Array.from({
              length: puzzle.width * puzzle.height,
            }).map((_, index) => {
              const x = index % puzzle.width;
              const y = Math.floor(index / puzzle.width);
              const cell = preview.get(index);
              const piece = cell ? placedPieces.get(cell.fragment) : null;
              const frag = cell ? fragmentOf(cell.fragment) : null;
              return (
                <button
                  key={index}
                  className={[
                    "mural-cell",
                    cell ? "filled" : "empty",
                    piece && pinned.has(piece.fragment) ? "pinned" : "",
                    selected && piece?.fragment === selected ? "selected" : "",
                  ].join(" ")}
                  role="gridcell"
                  aria-label={
                    cell
                      ? `${frag?.label ?? cell.fragment} 占据第 ${x + 1} 列第 ${y + 1} 行`
                      : `空格 ${x + 1},${y + 1}`
                  }
                  onClick={() => {
                    if (cell) {
                      setSelected(cell.fragment);
                      return;
                    }
                    if (selected) placeAt(selected, x, y);
                  }}
                >
                  {cell ? (
                    <>
                      <span className="mural-symbol">{frag?.symbol}</span>
                      <span className="mural-cell-label">
                        {frag?.label}
                        {piece && pinned.has(piece.fragment) && " · 已固定"}
                      </span>
                      <EdgeMarks edges={cell.edges} />
                    </>
                  ) : (
                    <span className="mural-empty-mark">＋</span>
                  )}
                </button>
              );
            })}
          </div>
          {selected && !occupiedBySelected && (
            <p className="mural-place-hint">
              已选中 {fragmentOf(selected)?.label}。点空格放入；点已有碎片切换选择。
            </p>
          )}
          {selected && occupiedBySelected && (
            <p className="mural-place-hint">
              当前占位 {placementLabel(occupiedBySelected)}，朝向{" "}
              {rotationName(occupiedBySelected.rot)}
              {occupiedBySelected.flip ? "，已翻面" : ""}。
            </p>
          )}
          <div className="mural-frame-foot">
            <span>
              <DoorClosed size={11} />
              暂存不解封
            </span>
            <span>
              <Link2 size={11} />
              相邻 {adjacentPairs.length} 对
            </span>
            <span>
              <Layers size={11} />
              上段 2 行 / 下段 2 行
            </span>
          </div>
        </section>

        <section className="mural-evidence-panel">
          <div className="panel-heading">
            <ScrollText size={14} />
            <h2>证明依据</h2>
            <span>{evidenceCount} 条采信</span>
          </div>
          <div className="mural-evidence-list">
            {CLAIMS.map((claim) => {
              const ev = mural.evidence.find((e) => e.claimId === claim.id);
              const available = !!ev;
              return (
                <div
                  key={claim.id}
                  className={[
                    "evidence-row",
                    available ? "" : "locked",
                    ev?.accepted ? "accepted" : "",
                    claim.timing === "late" ? "late" : "",
                  ].join(" ")}
                  title={claim.detail}
                >
                  <span className="evidence-dot" />
                  <span className="evidence-copy">
                    <strong>{claim.label}</strong>
                    <small>
                      {claim.sourceLabel}
                      {claim.timing === "late" ? " · 封门后" : ""}
                      {ev?.sourceCell != null
                        ? ` · 来源 ${cellName(ev.sourceCell, expedition.board.width)}`
                        : ""}
                    </small>
                  </span>
                  {available ? (
                    <button
                      className={"evidence-toggle " + (ev?.accepted ? "on" : "")}
                      aria-pressed={!!ev?.accepted}
                      onClick={() =>
                        send({
                          type: "mural-evidence",
                          claimId: claim.id,
                          accepted: !ev?.accepted,
                        })
                      }
                    >
                      {ev?.accepted ? <Check size={11} /> : <X size={11} />}
                      {ev?.accepted ? "采信" : "未采信"}
                    </button>
                  ) : (
                    <span className="evidence-lock">
                      {claim.timing === "late" ? "待开启" : "未出土"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mural-evidence-note">
            <Compass size={10} />
            证据来源（碎片或题记）会随证明一起保存；同一约束来自不同探方时不会互相折叠。
          </p>
          {selectedEvidence.length > 0 && (
            <div className="selected-evidence">
              <span className="mural-subhead">当前碎片的相关证据</span>
              {selectedEvidence.map((c) => {
                const ev = mural.evidence.find((e) => e.claimId === c.id);
                return (
                  <p key={c.id} className={ev?.accepted ? "accepted" : ""}>
                    {c.label}
                    <small>{c.detail}</small>
                  </p>
                );
              })}
            </div>
          )}
        </section>

        <section className="mural-sealed-panel">
          <div className="panel-heading">
            {mural.door === "open" ? (
              <DoorOpen size={14} />
            ) : (
              <DoorClosed size={14} />
            )}
            <h2>耳室通道</h2>
            <span>{sealedSet.size} 格</span>
          </div>
          <p>
            {mural.door === "open"
              ? "封门已开，耳室格子可正常探索；拆除成品会使仍封闭的区域失去出口。"
              : "封门依旧封闭；耳室格子不能揭开，泛洪也不会绕过封门。"}
          </p>
          <div className="sealed-cells">
            {mural.sealedCells.map((id) => (
              <span
                key={id}
                className={
                  expedition.board.cells[id]?.revealed ? "revealed" : "hidden"
                }
              >
                {cellName(id, expedition.board.width)}
              </span>
            ))}
          </div>
          {sealedRevealed.length > 0 && (
            <p className="sealed-caution">
              <TriangleAlert size={10} />
              已探索 {sealedRevealed.length} 格；拆除后这些格仍在，但未探索{" "}
              {sealedHidden.length} 格会失去通路。
            </p>
          )}
          <button className="outline-button" onClick={onOpenMap}>
            回到地图
            <ArrowUpRight size={12} />
          </button>
        </section>
      </div>

      {dialog === "confirm" && (
        <MuralDialog
          title="确认封门图案？"
          onClose={() => setDialog(null)}
          confirmLabel="确认并开启"
          onConfirm={() => {
            send({ type: "mural-confirm" });
            setDialog(null);
          }}
        >
          <p>
            搜索已经穷尽且只对应一幅完整图案。确认后封门开启，耳室通路与相关推断会同步更新。
          </p>
          <ul>
            <li>已发现文物不会重复发放奖励。</li>
            <li>开启后仍可撤回或拆除；拆除前会说明哪些探索区失去出口。</li>
            <li>若之后出现冲突的新证据，旧证明会标记失效。</li>
          </ul>
        </MuralDialog>
      )}
      {dialog === "dismantle" && (
        <MuralDialog
          title="拆除成品前，请确认出口。"
          onClose={() => setDialog(null)}
          confirmLabel="先撤回，再闭门"
          secondaryLabel="直接闭门"
          onSecondary={() => {
            send({ type: "mural-dismantle", recall: false });
            setDialog(null);
          }}
          onConfirm={() => {
            send({ type: "mural-dismantle", recall: true });
            setDialog(null);
          }}
        >
          <p>拆除会把封门重新封闭，并从成品撤回全部占用的碎片。</p>
          <div className="dismantle-summary">
            <span>
              <strong>{sealedHidden.length}</strong> 格尚未探索
            </span>
            <span>
              <strong>{sealedRevealed.length}</strong> 格已经探索
            </span>
          </div>
          <p className="dismantle-cells">
            将失去出口：
            {sealedHidden.length
              ? sealedHidden
                  .map((id) => cellName(id, expedition.board.width))
                  .join("、")
              : "没有仍未探索的格子"}
          </p>
          <p>
            「先撤回」会把耳室里的探索记录退回未探索，避免闭门后留下走不出来的区域；
            已发现文物与积分不会重发。之后仍可重新拼合，但需要再次取得足够证据。
          </p>
        </MuralDialog>
      )}
    </div>
  );
}

function EdgeMarks({
  edges,
}: {
  edges: (readonly [number, number])[];
}) {
  return (
    <span className="edge-marks" aria-hidden="true">
      {["n", "e", "s", "w"].map((side, i) => {
        const token = edges[i];
        const kind = token[0] === 0 ? "outer" : "seam";
        return (
          <i
            key={side}
            className={`edge-${side} ${kind}`}
            data-fracture={token[0]}
            data-motif={token[1]}
          />
        );
      })}
    </span>
  );
}

function MuralDialog({
  title,
  children,
  onClose,
  onConfirm,
  confirmLabel,
  secondaryLabel,
  onSecondary,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="dialog mural-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mural-dialog-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <button
          className="icon-button close"
          aria-label="关闭"
          onClick={onClose}
        >
          <X size={17} />
        </button>
        <ScrollText size={24} />
        <h2 id="mural-dialog-title">{title}</h2>
        {children}
        <div className="dialog-actions">
          <button className="outline-button" onClick={onClose}>
            取消
          </button>
          {secondaryLabel && onSecondary && (
            <button className="outline-button" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          )}
          <button className="primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
