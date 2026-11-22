import type { Difficulty, Mode } from "./types";
export type Command =
  | { type: "cell"; id: number; mark?: boolean }
  | { type: "chord"; id: number }
  | { type: "mode"; mode: Mode }
  | { type: "shield" }
  | { type: "pause"; paused?: boolean }
  | { type: "tick" }
  | { type: "extract" }
  | { type: "new"; difficulty: Difficulty; seed: string }
  | {
      type: "mural-place";
      fragment: string;
      x: number;
      y: number;
      rot: number;
      flip: boolean;
    }
  | { type: "mural-remove"; fragment: string }
  | { type: "mural-pin"; fragment: string; pinned: boolean }
  | {
      type: "mural-transform";
      fragment: string;
      rot: number;
      flip: boolean;
    }
  | { type: "mural-clear" }
  | { type: "mural-example" }
  | { type: "mural-check" }
  | { type: "mural-confirm" }
  | { type: "mural-dismantle"; recall?: boolean }
  | { type: "mural-evidence"; claimId: string; accepted: boolean };
