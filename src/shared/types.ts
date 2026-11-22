export type Difficulty = "scout" | "scholar" | "legend";
export type Mode = "reveal" | "mark" | "probe" | "flare";
export type Status = "ready" | "active" | "won" | "lost" | "extracted";
export type Mark = "none" | "flag" | "question";
export type RelicId = "sun" | "vessel" | "tablet";
export interface Cell {
  id: number;
  mine: boolean;
  adjacent: number;
  revealed: boolean;
  mark: Mark;
  intel: "unknown" | "safe" | "danger";
  relic: RelicId | null;
  terrain: "moss" | "stone" | "water";
}
export interface Board {
  width: number;
  height: number;
  mines: number;
  seed: string;
  difficulty: Difficulty;
  generated: boolean;
  cells: Cell[];
}
export interface ActionEntry {
  id: number;
  kind: "reveal" | "mark" | "probe" | "flare" | "hit" | "shield" | "extract";
  cell: number | null;
  message: string;
  second: number;
}
export interface Expedition {
  id: string;
  board: Board;
  status: Status;
  mode: Mode;
  lives: number;
  shield: boolean;
  tools: { probe: number; flare: number; shield: number };
  used: number;
  mistakes: number;
  elapsed: number;
  paused: boolean;
  actions: ActionEntry[];
  nextAction: number;
  selected: number | null;
  startedAt: number;
}
export interface Report {
  id: string;
  seed: string;
  difficulty: Difficulty;
  outcome: Status;
  safe: number;
  totalSafe: number;
  relics: RelicId[];
  score: number;
  seconds: number;
  used: number;
  mistakes: number;
  endedAt: number;
}
export interface Archive {
  reports: Report[];
  discoveries: Partial<Record<RelicId, number>>;
  totalScore: number;
}
export type MuralDoor = "sealed" | "open";
export interface MuralPlacementState {
  fragment: string;
  x: number;
  y: number;
  rot: number;
  flip: boolean;
}
export interface MuralEvidenceState {
  id: string;
  claimId: string;
  kind: "orientation" | "strata" | "join";
  label: string;
  sourceLabel: string;
  sourceCell: number | null;
  relic: RelicId | null;
  accepted: boolean;
  fragment?: string;
  a?: string;
  b?: string;
  relation?: "adjacent" | "separate";
  facing?: 0 | 1 | 2 | 3;
  band?: "upper" | "lower";
}
export type MuralProofStatus =
  | "unique"
  | "candidate"
  | "unproven"
  | "conflict";
export interface MuralConflictView {
  id: string;
  label: string;
  reason: string;
  fragment: string | null;
}
export interface MuralProofState {
  status: MuralProofStatus;
  distinct: number;
  exhausted: boolean;
  truncated: boolean;
  example: MuralPlacementState[];
  conflicts: MuralConflictView[];
  claims: string[];
  evidenceSources: number;
  pinnedSignature: string;
  evidenceFingerprint: string;
  nodes: number;
  checkedAt: number;
  localSeams: {
    cells: number;
    total: number;
    matched: number;
    mismatched: number;
    openBoundary: number;
    overlaps: number;
    outOfBounds: number;
  };
}
export interface MuralState {
  door: MuralDoor;
  layout: MuralPlacementState[];
  pins: MuralPlacementState[];
  confirmed: MuralPlacementState[] | null;
  proof: MuralProofState;
  evidence: MuralEvidenceState[];
  proofStale: boolean;
  staleReason: string;
  rewarded: boolean;
  openedAt: number | null;
  sealedCells: number[];
}
export interface GameDocument {
  version: 1;
  expedition: Expedition;
  archive: Archive;
  mural: MuralState;
}
export interface PublicCell {
  id: number;
  revealed: boolean;
  mark: Mark;
  adjacent: number | null;
  intel: Cell["intel"];
  exploded: boolean;
}
export interface PublicBoard {
  width: number;
  height: number;
  mines: number;
  cells: PublicCell[];
}
export interface Deduction {
  cell: number;
  kind: "safe" | "danger";
  reasons: number[];
  text: string;
}
export interface Analysis {
  safe: Deduction[];
  danger: Deduction[];
  conflicts: number[];
  constraints: number;
}
export interface Workspace {
  doc: GameDocument;
  notice: string;
}
