export { MuralPanel } from "./ui/MuralPanel";
export { MuralRoom } from "./ui/MuralRoom";
export { createMuralPuzzle, fragmentSources, HIDDEN_LAYOUT } from "./model/puzzle";
export type { MuralPuzzle, MuralFragmentDef } from "./model/puzzle";
export {
  createMuralState,
  hydrateMural,
  syncMural,
  doorSealedCells,
  muralPlace,
  muralRemove,
  muralPin,
  muralTransform,
  muralClear,
  muralApplyExample,
  muralCheck,
  muralConfirm,
  muralDismantle,
  sealedAreaSummary,
  sealedNeighbors,
  evidenceContradictions,
} from "./model/room";
export { CLAIMS, claimById, claimDetail } from "./model/claims";
