import type { MuralPlacementState } from "../../../shared/types";

export function placementLabel(p: MuralPlacementState) {
  const dir = ["↑", "→", "↓", "←"][((p.rot % 4) + 4) % 4];
  return `(${p.x + 1},${p.y + 1}) ${p.flip ? "翻面·" : ""}${dir}`;
}

export function rotationName(rot: number) {
  return ["北", "东", "南", "西"][((rot % 4) + 4) % 4];
}

/** 把格编号显示成地图坐标（如 D5），避免把内部 id 直接暴露给玩家。 */
export function cellName(id: number, width: number) {
  return `${String.fromCharCode(65 + (id % width))}${Math.floor(id / width) + 1}`;
}
