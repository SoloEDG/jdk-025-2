import { useMemo } from "react";
import {
  Puzzle,
  Brush,
  Check,
  TriangleAlert,
  SearchCheck,
  ScanSearch,
  Pin,
  PinOff,
  RotateCw,
  RotateCcw,
  FlipHorizontal2,
  Undo2,
  Sparkles,
  ListChecks,
  X,
} from "lucide-react";
import type {
  Expedition,
  MuralDoor,
  MuralPlacementState,
  MuralProofStatus,
  PublicBoard,
} from "../../../shared/types";
import type { Command } from "../../../shared/commands";
import type { MuralPuzzle } from "../model/puzzle";
import { fragmentSources, isFragmentRecovered } from "../model/puzzle";
import { placementLabel } from "./labels";

export interface MuralPanelProps {
  expedition: Expedition;
  board: PublicBoard;
  puzzle: MuralPuzzle;
  layout: MuralPlacementState[];
  pins: MuralPlacementState[];
  door: MuralDoor;
  proofStatus: MuralProofStatus;
  distinct: number;
  example: MuralPlacementState[];
  conflicts: { id: string; label: string; reason: string }[];
  localSeams: {
    cells: number;
    total: number;
    matched: number;
    mismatched: number;
    openBoundary: number;
    overlaps: number;
    outOfBounds: number;
  };
  proofStale: boolean;
  staleReason: string;
  evidenceCount: number;
  evidenceSources: number;
  selected: string | null;
  onSelect: (fragment: string | null) => void;
  onPlaceAtSlot: (fragment: string) => void;
  onOpenConfirm: () => void;
  onOpenDismantle: () => void;
  onCommand: (command: Command) => void;
}

export function MuralPanel(props: MuralPanelProps) {
  const {
    expedition: e,
    puzzle,
    layout,
    pins,
    door,
    proofStatus,
    distinct,
    example,
    conflicts,
    proofStale,
    staleReason,
    evidenceCount,
    evidenceSources,
    selected,
    onSelect,
    onPlaceAtSlot,
    onOpenConfirm,
    onOpenDismantle,
  } = props;
  const sources = useMemo(() => fragmentSources(e.board), [e.board]);
  const placed = new Map(layout.map((p) => [p.fragment, p]));
  const pinned = new Set(pins.map((p) => p.fragment));
  const excavated = puzzle.fragments.filter((f) =>
    isFragmentRecovered(e.board, sources[f.id]),
  );
  const allRecovered = excavated.length === puzzle.fragments.length;
  const confirmed = door === "open";
  const send = (command: Command) => props.onCommand(command);
  const sourceLabel = (id: number | null) =>
    id === null
      ? "尚未定位"
      : `${String.fromCharCode(65 + (id % e.board.width))}${Math.floor(id / e.board.width) + 1}`;
  return (
    <section className="mural-room" id="mural">
      <div className="panel-heading mural-heading">
        <Brush size={15} />
        <h2>壁画修复室</h2>
        <span>MURAL LAB / SEAL DOOR</span>
      </div>
      <p className="mural-intro">
        把出土碎片按断口、纹样、朝向与地层关系拼回封门。暂存不算解封；只有搜索穷尽且唯一时，封门才会开启。
      </p>
      <div className="mural-stats">
        <div>
          <b>
            {String(layout.length).padStart(2, "0")}
            <small>/ {puzzle.fragments.length}</small>
          </b>
          <span>暂存碎片</span>
        </div>
        <div>
          <b>{String(pins.length).padStart(2, "0")}</b>
          <span>固定位置</span>
        </div>
        <div>
          <b>{String(evidenceSources).padStart(2, "0")}</b>
          <span>证据来源</span>
        </div>
        <div className={confirmed ? "open" : ""}>
          <b>{confirmed ? "开" : "闭"}</b>
          <span>封门状态</span>
        </div>
      </div>
      {proofStale && staleReason && (
        <div className="mural-warning" role="status">
          <TriangleAlert size={13} />
          <p>{staleReason}</p>
        </div>
      )}
      <div className={"mural-proof " + proofStatus}>
        <ProofSummary
          status={proofStatus}
          distinct={distinct}
          door={door}
          evidenceCount={evidenceCount}
          allRecovered={allRecovered}
          excavated={excavated.length}
          total={puzzle.fragments.length}
        />
      </div>
      <p className="mural-seam-readout">
        逐缝检查：{props.localSeams.matched} 条吻合 ·{" "}
        {props.localSeams.mismatched} 条不符 ·{" "}
        {props.localSeams.openBoundary} 条外缘未闭 · 覆盖{" "}
        {props.localSeams.cells}/{props.localSeams.total} 格
      </p>
      {props.localSeams.cells === props.localSeams.total &&
        props.localSeams.mismatched === 0 &&
        props.localSeams.openBoundary === 0 &&
        proofStatus !== "unique" && (
          <p className="mural-caution">
            <TriangleAlert size={11} />
            局部断口全部吻合，只说明当前摆放未与相邻碎片冲突；整体是否可补全、是否唯一，仍以搜索为准。
          </p>
        )}
      {conflicts.length > 0 && (
        <div className="mural-conflicts">
          <div className="mural-subhead">
            <ListChecks size={12} />
            最小冲突组 · 撤下其中一项即可继续补全
          </div>
          {conflicts.map((c) => (
            <div key={c.id} className="conflict-row">
              <X size={11} />
              <span>
                <strong>{c.label}</strong>
                <small>{c.reason}</small>
              </span>
            </div>
          ))}
        </div>
      )}
      {example.length > 0 && door !== "open" && (
        <div className="mural-example">
          <Sparkles size={12} />
          <div>
            <strong>
              {proofStatus === "unique"
                ? "唯一补全示例"
                : "可参考的补全示例"}
            </strong>
            <small>
              {proofStatus === "unique"
                ? "搜索已穷尽，只有这一幅完整图案；固定位置与证据均已纳入。"
                : "示例展示一条可行摆法，不代表唯一；固定位置和证据仍会参与判断。"}
            </small>
          </div>
          <button
            className="outline-button"
            onClick={() => send({ type: "mural-example" })}
          >
            采用示例
          </button>
        </div>
      )}
      <div className="fragment-strip">
        {puzzle.fragments.map((f) => {
          const source = sources[f.id];
          const recovered = isFragmentRecovered(e.board, source);
          const p = placed.get(f.id);
          const isPinned = pinned.has(f.id);
          return (
            <button
              key={f.id}
              className={[
                "fragment-card",
                recovered ? "" : "locked",
                p ? "placed" : "",
                selected === f.id ? "selected" : "",
                isPinned ? "pinned" : "",
              ].join(" ")}
              disabled={!recovered}
              onClick={() => {
                if (!recovered) return;
                onSelect(selected === f.id ? null : f.id);
                if (!p) onPlaceAtSlot(f.id);
              }}
              title={
                recovered
                  ? `${f.provenance.label} · ${f.band === "upper" ? "上地层" : "下地层"}${f.directional ? " · 有向铭文" : ""}`
                  : "尚未出土"
              }
            >
              <span className="fragment-symbol">{f.symbol}</span>
              <span className="fragment-meta">
                <strong>{recovered ? f.label : "未出土碎片"}</strong>
                <small>
                  {recovered
                    ? `${p ? placementLabel(p) : "未摆放"} · ${f.band === "upper" ? "上段" : "下段"}${f.directional ? " · 正读铭文" : ""}`
                    : `待出土 · 线索点 ${sourceLabel(source)}`}
                </small>
              </span>
              {isPinned && <Pin size={11} className="pin-badge" />}
              {p && !isPinned && <Check size={11} className="ok-badge" />}
            </button>
          );
        })}
      </div>
      {selected && (() => {
        const p = placed.get(selected);
        const frag = puzzle.fragments.find((f) => f.id === selected);
        if (!frag) return null;
        return (
          <div className="fragment-tools">
            <span className="fragment-tools-title">
              {frag.label}
              <small>
                {frag.provenance.label} · 只占一幅封门
              </small>
            </span>
            {p ? (
              <>
                <button
                  className={"mini-action " + (pinned.has(selected) ? "on" : "")}
                  onClick={() =>
                    send({
                      type: "mural-pin",
                      fragment: selected,
                      pinned: !pinned.has(selected),
                    })
                  }
                >
                  {pinned.has(selected) ? <PinOff size={12} /> : <Pin size={12} />}
                  {pinned.has(selected) ? "取消固定" : "固定位置"}
                </button>
                {!pinned.has(selected) && (
                  <>
                    <button
                      className="mini-action"
                      onClick={() =>
                        send({
                          type: "mural-transform",
                          fragment: selected,
                          rot: 1,
                          flip: false,
                        })
                      }
                      title="顺时针旋转"
                    >
                      <RotateCw size={12} />
                    </button>
                    <button
                      className="mini-action"
                      onClick={() =>
                        send({
                          type: "mural-transform",
                          fragment: selected,
                          rot: -1,
                          flip: false,
                        })
                      }
                      title="逆时针旋转"
                    >
                      <RotateCcw size={12} />
                    </button>
                    <button
                      className={"mini-action " + (p.flip ? "on" : "")}
                      onClick={() =>
                        send({
                          type: "mural-transform",
                          fragment: selected,
                          rot: 0,
                          flip: true,
                        })
                      }
                      title="翻面（有向铭文不会视为镜像等价）"
                    >
                      <FlipHorizontal2 size={12} />
                    </button>
                  </>
                )}
                <button
                  className="mini-action danger"
                  onClick={() =>
                    send({ type: "mural-remove", fragment: selected })
                  }
                >
                  <Undo2 size={12} />
                  取回
                </button>
              </>
            ) : (
              <span className="fragment-tools-hint">
                在右侧封门框选择落点，或直接点击「放入下一空位」。
              </span>
            )}
          </div>
        );
      })()}
      <div className="mural-actions">
        <button
          className="outline-button"
          onClick={() => send({ type: "mural-clear" })}
          disabled={!layout.length && !pins.length}
        >
          清空暂存
        </button>
        <button
          className="outline-button"
          onClick={() => send({ type: "mural-check" })}
          disabled={!layout.length && !pins.length}
        >
          <SearchCheck size={13} />
          检验整幅
        </button>
        {confirmed ? (
          <button className="primary" onClick={onOpenDismantle}>
            <Puzzle size={13} />
            拆除成品
          </button>
        ) : (
          <button
            className="primary"
            onClick={onOpenConfirm}
            disabled={proofStatus !== "unique" || !!proofStale}
          >
            <ScanSearch size={13} />
            确认封门
          </button>
        )}
      </div>
      {!allRecovered && (
        <p className="mural-foot">
          还缺 {puzzle.fragments.length - excavated.length} 块碎片未出土。碎片未齐时不存在完整补全，只能说尚未证实，不能判为冲突。
        </p>
      )}
    </section>
  );
}

function ProofSummary({
  status,
  distinct,
  door,
  evidenceCount,
  allRecovered,
  excavated,
  total,
}: {
  status: MuralProofStatus;
  distinct: number;
  door: MuralDoor;
  evidenceCount: number;
  allRecovered: boolean;
  excavated: number;
  total: number;
}) {
  if (door === "open")
    return (
      <div className="proof-line open">
        <Check size={13} />
        <span>
          封门已开启，证明依据已存档；耳室通路开放。
          <small>拆除成品前，请先确认哪些探索区会失去出口。</small>
        </span>
      </div>
    );
  if (status === "unique")
    return (
      <div className="proof-line unique">
        <SearchCheck size={13} />
        <span>
          搜索已穷尽：当前证据与固定位置只对应一幅完整图案。
          <small>确认后地图开放，并更新相关推断。</small>
        </span>
      </div>
    );
  if (status === "candidate")
    return (
      <div className="proof-line candidate">
        <TriangleAlert size={13} />
        <span>
          尚可补成整幅，但至少还有 {distinct} 种等价摆法，不能称为唯一。
          <small>
            引用更多证据、移动固定片，或检查是否存在平移重复计数的方案。
          </small>
        </span>
      </div>
    );
  if (status === "conflict")
    return (
      <div className="proof-line conflict">
        <TriangleAlert size={13} />
        <span>
          当前固定位置或证据无法补成整幅，已给出最小冲突片组。
          <small>去掉冲突项，或撤回固定位置后重新检验。</small>
        </span>
      </div>
    );
  return (
    <div className="proof-line unproven">
      <ScanSearch size={13} />
      <span>
        尚未证实：搜索没有穷尽，也没有找到唯一整幅。
        <small>
          {allRecovered
            ? `已出土 ${excavated}/${total} 块；需要更多证据或固定位置才能断言完整。`
            : `仅 ${excavated}/${total} 块已出土；局部吻合不等于整幅成立。`}
          {evidenceCount > 0 ? ` 当前引用 ${evidenceCount} 条证据。` : ""}
        </small>
      </span>
    </div>
  );
}
