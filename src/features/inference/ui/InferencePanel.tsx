import {
  ScanSearch,
  Lightbulb,
  TriangleAlert,
  ArrowUpRight,
  Brush,
  DoorClosed,
  DoorOpen,
} from "lucide-react";
import type {
  Analysis,
  Expedition,
  MuralState,
} from "../../../shared/types";
import { coordinate } from "../../../shared/geometry";
import { inferenceSummary } from "../model/notes";
export function InferencePanel({
  analysis: a,
  expedition: e,
  mural,
  showHints,
  onHints,
  onLocate,
  onMural,
}: {
  analysis: Analysis;
  expedition: Expedition;
  mural?: MuralState;
  showHints: boolean;
  onHints: () => void;
  onLocate: (id: number) => void;
  onMural?: () => void;
}) {
  return (
    <section className="inference-panel">
      <div className="panel-heading">
        <ScanSearch size={15} />
        <h2>推断笔记</h2>
        <span>LOGIC NOTES</span>
      </div>
      <div className={"logic-status " + (a.conflicts.length ? "conflict" : "")}>
        <Lightbulb size={16} />
        <p>{inferenceSummary(a, e, mural)}</p>
      </div>
      <div className="logic-counts">
        <div>
          <b>{String(a.safe.length).padStart(2, "0")}</b>
          <span>条件安全</span>
        </div>
        <div>
          <b>{String(a.danger.length).padStart(2, "0")}</b>
          <span>推断危险</span>
        </div>
        <div>
          <b>{String(a.constraints).padStart(2, "0")}</b>
          <span>有效线索</span>
        </div>
      </div>
      <button
        className={"outline-button " + (showHints ? "active" : "")}
        aria-pressed={showHints}
        onClick={onHints}
      >
        <ScanSearch size={13} />
        {showHints ? "隐藏推断高亮" : "在地图上高亮"}
      </button>
      <div className="deduction-list">
        {[...a.safe.slice(0, 2), ...a.danger.slice(0, 1)].map((d) => (
          <button key={d.cell} onClick={() => onLocate(d.cell)}>
            <i className={d.kind} />
            <span>
              {coordinate(d.cell, e.board.width)} ·{" "}
              {d.kind === "safe" ? "可探索" : "需警惕"}
            </span>
            <ArrowUpRight size={12} />
          </button>
        ))}
      </div>
      <p className="logic-caution">
        <TriangleAlert size={11} />
        推断以你的旗标为条件，不会读取暗格答案。
      </p>
      {mural && onMural && (
        <button className="mural-crosslink" onClick={onMural}>
          {mural.door === "open" ? (
            <DoorOpen size={13} />
          ) : (
            <DoorClosed size={13} />
          )}
          <span>
            壁画修复室
            <small>
              {mural.door === "open"
                ? "封门已开 · 耳室通路开放"
                : mural.proofStale
                  ? "旧证明失效，需重新核对"
                  : mural.proof.status === "unique"
                    ? "已取得唯一补全，可确认封门"
                    : `暂存 ${mural.layout.length} 片 · 尚未证实整幅`}
            </small>
          </span>
          <Brush size={12} />
        </button>
      )}
    </section>
  );
}
