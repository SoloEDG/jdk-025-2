import type { Analysis, Expedition, MuralState } from "../../../shared/types";
export function inferenceSummary(a: Analysis, e: Expedition, mural?: MuralState) {
  if (mural?.proofStale) return "壁画的新证据与旧证明冲突，旧证明已失效；请到修复室重新核对。";
  if (mural?.door === "open") return "封门已开，耳室已并入探索范围；推断仍以旗标为条件。";
  if (e.status === "ready") return "第一步始终安全，选择一块石板开始。";
  if (a.conflicts.length) return "现有旗标与数字冲突，请先检查标记。";
  if (a.safe.length)
    return `找到 ${a.safe.length} 个条件安全格，请核对旗标后探索。`;
  if (a.danger.length)
    return `有 ${a.danger.length} 处可推断危险，建议先做标记。`;
  return "暂未找到直接结论，试试探针或观察更多边界。";
}
