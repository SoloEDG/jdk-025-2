import type { Workspace } from "../shared/types";
import type { Command } from "../shared/commands";
import { isTerminal, emptyArchive, logAction } from "../shared/initial";
import { blankBoard, generateBoard } from "../features/terrain";
import {
  createExpedition,
  mayAct,
  revealCells,
  cycleMark,
  chordCells,
} from "../features/exploration";
import { inspectCell, activateShield } from "../features/tools";
import { settle } from "../features/chronicle";
import {
  createMuralState,
  hydrateMural,
  muralApplyExample,
  muralCheck,
  muralClear,
  muralConfirm,
  muralDismantle,
  doorSealedCells,
  muralPin,
  muralPlace,
  muralRemove,
  muralTransform,
  syncMural,
} from "../features/mural";

export function initialGame(): Workspace {
  const board = blankBoard("scout", "RUIN-025");
  return {
    doc: {
      version: 1,
      expedition: createExpedition(board, crypto.randomUUID(), Date.now()),
      archive: emptyArchive(),
      mural: createMuralState(board),
    },
    notice: "",
  };
}

export function gameReducer(state: Workspace, c: Command): Workspace {
  let e = state.doc.expedition;
  let archive = state.doc.archive;
  let mural = state.doc.mural;
  let notice = state.notice;
  let blockedCells =
    mural.door === "sealed" ? new Set(mural.sealedCells) : new Set<number>();

  const commitMural = (
    mutation: ReturnType<typeof muralCheck>,
    extra?: () => void,
  ) => {
    if (!mutation.changed) {
      notice = mutation.notice;
      return false;
    }
    mural = mutation.mural;
    notice = mutation.notice;
    extra?.();
    return true;
  };

  switch (c.type) {
    case "new": {
      const seed = c.seed.trim().slice(0, 40) || "RUIN-025";
      const board = blankBoard(c.difficulty, seed);
      return {
        ...state,
        doc: {
          ...state.doc,
          expedition: createExpedition(board, crypto.randomUUID(), Date.now()),
          mural: createMuralState(board),
        },
        notice: "新的石板地图已准备好，第一步由你决定。",
      };
    }
    case "mode":
      if (mayAct(e)) e = { ...e, mode: c.mode };
      break;
    case "pause":
      if (e.status === "active") e = { ...e, paused: c.paused ?? !e.paused };
      break;
    case "tick":
      if (e.status === "active" && !e.paused)
        e = { ...e, elapsed: e.elapsed + 1 };
      break;
    case "shield":
      e = activateShield(e);
      break;
    case "extract":
      if (e.status === "active" && !e.paused)
        e = logAction(
          { ...e, status: "extracted", mode: "reveal" },
          "extract",
          null,
          "携带本次发现平安撤离，探险已归档。",
        );
      break;
    case "chord":
      e = chordCells(e, c.id, blockedCells);
      break;
    case "cell": {
      const cell = e.board.cells[c.id];
      if (!mayAct(e) || !cell) break;
      if (!c.mark && e.mode !== "mark" && blockedCells.has(c.id)) {
        notice = "耳室被封门封住，先完成壁画修复才能进入。";
        break;
      }
      if (c.mark || e.mode === "mark") {
        e = cycleMark(e, c.id);
        break;
      }
      if (cell.revealed || cell.mark === "flag") break;
      if (e.mode === "probe" || e.mode === "flare") {
        const result = inspectCell(e, c.id, e.mode, blockedCells);
        e = result.reveal.length
          ? revealCells(result.expedition, result.reveal, blockedCells)
          : result.expedition;
        break;
      }
      if (!e.board.generated) {
        e = {
          ...e,
          status: "active",
          board: generateBoard(e.board, c.id),
        };
        // 首步生成地图后，封门耳室格子才确定；重新计算，避免泛洪穿过封闭区。
        mural = {
          ...mural,
          sealedCells: doorSealedCells(e.board),
        };
        blockedCells =
          mural.door === "sealed"
            ? new Set(mural.sealedCells)
            : new Set<number>();
      }
      e = revealCells(e, [c.id], blockedCells);
      break;
    }
    case "mural-place":
      commitMural(
        muralPlace(
          mural,
          e.board,
          Date.now(),
          c.fragment,
          c.x,
          c.y,
          c.rot,
          c.flip,
        ),
      );
      break;
    case "mural-remove":
      commitMural(muralRemove(mural, e.board, Date.now(), c.fragment));
      break;
    case "mural-pin":
      commitMural(
        muralPin(mural, e.board, Date.now(), c.fragment, c.pinned),
      );
      break;
    case "mural-transform":
      commitMural(
        muralTransform(
          mural,
          e.board,
          Date.now(),
          c.fragment,
          c.rot,
          c.flip,
        ),
      );
      break;
    case "mural-clear":
      commitMural(muralClear(mural, e.board, Date.now()));
      break;
    case "mural-example":
      commitMural(muralApplyExample(mural, e.board, Date.now()));
      break;
    case "mural-check":
      commitMural(muralCheck(mural, e.board, Date.now()));
      break;
    case "mural-confirm": {
      const result = muralConfirm(mural, e.board, Date.now());
      if (!result.changed) {
        notice = result.notice;
        break;
      }
      mural = result.mural;
      notice = result.notice;
      if (result.reward) {
        archive = { ...archive, totalScore: archive.totalScore + result.reward };
        e = logAction(
          e,
          "reveal",
          null,
          `封门壁画修复完成，获得 ${result.reward} 点修复积分。`,
        );
      }
      if (result.openedCells.length)
        e = { ...e, board: { ...e.board } };
      break;
    }
    case "mural-dismantle": {
      const result = muralDismantle(mural, e.board, Date.now(), {
        recall: c.recall,
      });
      if (!result.changed) {
        notice = result.notice;
        break;
      }
      mural = result.mural;
      notice = result.notice;
      if (result.board !== e.board) e = { ...e, board: result.board };
      break;
    }
    case "mural-evidence": {
      const next = mural.evidence.map((ev) =>
        ev.claimId === c.claimId ? { ...ev, accepted: c.accepted } : ev,
      );
      // 仅允许在来源格揭开后切换证据。
      const target = next.find((ev) => ev.claimId === c.claimId);
      if (!target) {
        notice = "这条证据还没有出土。";
        break;
      }
      const sourceOk =
        target.sourceCell !== null &&
        !!e.board.cells[target.sourceCell]?.revealed;
      if (!sourceOk) {
        notice = "证据来源尚未揭开，不能引用。";
        break;
      }
      if (target.claimId.startsWith("c-late") && mural.door !== "open") {
        notice = "耳室题记要在封门开启后才能读到。";
        break;
      }
      mural = syncMural(
        { ...mural, evidence: next },
        e.board,
        Date.now(),
        {
          keepStale: true,
          previousEvidence: state.doc.mural.evidence,
        },
      );
      notice = c.accepted ? "已采信该证据。" : "已暂不采信该证据。";
      break;
    }
  }
  if (e === state.doc.expedition && mural === state.doc.mural)
    return notice === state.notice ? state : { ...state, notice };
  // 地图变化后，重新同步证据来源与证明；已确认/已开启的状态保持。
  if (e !== state.doc.expedition && state.doc.mural.door !== "open")
    mural = syncMural(mural, e.board, Date.now(), {
      keepStale: true,
      previousEvidence: state.doc.mural.evidence,
    });
  if (isTerminal(e.status)) archive = settle(archive, e, Date.now());
  return {
    ...state,
    doc: { ...state.doc, expedition: e, archive, mural },
    notice,
  };
}

export { hydrateMural };
