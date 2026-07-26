import { create } from "zustand";
import {
  Cubie,
  Move,
  MOVE_TABLE,
  commitRotation,
  createSolvedCube,
  cubiesForMove,
  isRotation,
  isSolved,
  randomScramble,
} from "../cube/cubeModel";

interface ActiveTurn {
  name: string;
  move: Move;
  affected: Cubie[];
  progress: number;
}

export interface ManualTurn {
  move: Move;
  affected: Cubie[];
  angle: number;
}

interface CubeState {
  cubies: Cubie[];
  queue: string[];
  active: ActiveTurn | null;
  manual: ManualTurn | null;
  history: string[];
  moveCount: number;
  turnCount: number;
  undoCount: number;
  isScrambling: boolean;
  solved: boolean;
  startedAt: number | null;
  solvedAt: number | null;

  enqueueMove: (name: string) => void;
  scramble: () => void;
  reset: () => void;
  undo: () => void;
  tick: (deltaSeconds: number) => void;
  canBeginManual: () => boolean;
  beginManual: (move: Move) => void;
  updateManual: (angle: number) => void;
  commitManual: () => void;
  cancelManual: () => void;
}

const TURN_DURATION = 0.22;

function inverseOf(name: string): string {
  return name.endsWith("'") ? name.slice(0, -1) : `${name}'`;
}

function canManualStart(
  state: Pick<CubeState, "active" | "queue" | "isScrambling" | "manual">
): boolean {
  return !state.active && state.queue.length === 0 && !state.isScrambling && !state.manual;
}

function findMoveName(move: Move): string | null {
  for (const [name, m] of Object.entries(MOVE_TABLE)) {
    if (
      m.axis === move.axis &&
      m.direction === move.direction &&
      m.layers.length === move.layers.length &&
      m.layers.every((l) => move.layers.includes(l))
    ) {
      return name;
    }
  }
  return null;
}

export const useCubeStore = create<CubeState>((set, get) => ({
  cubies: createSolvedCube(),
  queue: [],
  active: null,
  manual: null,
  history: [],
  moveCount: 0,
  turnCount: 0,
  undoCount: 0,
  isScrambling: false,
  solved: true,
  startedAt: null,
  solvedAt: null,

  enqueueMove: (name: string) => {
    const move = MOVE_TABLE[name];
    if (!move) return;
    const rotation = isRotation(move);
    set((state) => ({
      queue: [...state.queue, name],
      startedAt: rotation ? state.startedAt : state.startedAt ?? Date.now(),
      solvedAt: rotation ? state.solvedAt : null,
    }));
  },

  scramble: () => {
    const moves = randomScramble(20);
    set({
      queue: moves,
      isScrambling: true,
      moveCount: 0,
      turnCount: 0,
      undoCount: 0,
      history: [],
      startedAt: null,
      solvedAt: null,
      solved: false,
      manual: null,
    });
  },

  reset: () => {
    set({
      cubies: createSolvedCube(),
      queue: [],
      active: null,
      manual: null,
      history: [],
      moveCount: 0,
      turnCount: 0,
      undoCount: 0,
      isScrambling: false,
      solved: true,
      startedAt: null,
      solvedAt: null,
    });
  },

  undo: () => {
    const state = get();
    if (state.active || state.queue.length > 0 || state.isScrambling || state.manual) return;
    const last = state.history[state.history.length - 1];
    if (!last) return;
    set({ history: state.history.slice(0, -1), undoCount: state.undoCount + 1 });
    get().enqueueMove(inverseOf(last));
  },

  tick: (deltaSeconds: number) => {
    const state = get();
    let { active, queue } = state;

    if (!active && queue.length > 0) {
      const name = queue[0];
      const move = MOVE_TABLE[name];
      const affected = cubiesForMove(state.cubies, move);
      active = { name, move, affected, progress: 0 };
      queue = queue.slice(1);
    }

    if (!active) return;

    const progress = active.progress + deltaSeconds / TURN_DURATION;

    if (progress >= 1) {
      commitRotation(active.affected, active.move.axis, active.move.direction);

      const isUndo = state.undoCount > 0;
      const rotation = isRotation(active.move);
      const stillScrambling = state.isScrambling && queue.length > 0;
      const nowSolved = queue.length === 0 ? isSolved(state.cubies) : state.solved;
      const recordHistory = !state.isScrambling && !isUndo;

      set({
        active: null,
        queue,
        turnCount: state.isScrambling ? state.turnCount : state.turnCount + 1,
        history: recordHistory ? [...state.history, active.name] : state.history,
        moveCount:
          state.isScrambling || rotation
            ? state.moveCount
            : isUndo
            ? state.moveCount - 1
            : state.moveCount + 1,
        undoCount: isUndo ? state.undoCount - 1 : state.undoCount,
        isScrambling: stillScrambling,
        solved: nowSolved,
        solvedAt:
          !stillScrambling && !isUndo && nowSolved && !state.solved ? Date.now() : state.solvedAt,
      });
    } else {
      set({ active: { ...active, progress }, queue });
    }
  },

  canBeginManual: () => canManualStart(get()),

  beginManual: (move: Move) => {
    const state = get();
    if (!canManualStart(state)) return;
    const affected = cubiesForMove(state.cubies, move);
    set({
      manual: { move, affected, angle: 0 },
      startedAt: state.startedAt ?? Date.now(),
      solvedAt: null,
    });
  },

  updateManual: (angle: number) => {
    const state = get();
    if (!state.manual) return;
    set({ manual: { ...state.manual, angle } });
  },

  commitManual: () => {
    const state = get();
    if (!state.manual) return;
    const { move, affected, angle } = state.manual;

    const snapped = Math.round(angle / (Math.PI / 2));

    if (snapped === 0) {
      set({ manual: null });
      return;
    }

    const direction = (snapped > 0 ? 1 : -1) as 1 | -1;
    commitRotation(affected, move.axis, direction);

    const moveName = findMoveName(direction === move.direction ? move : { ...move, direction });
    const added = moveName ? [moveName] : [];

    const nowSolved = isSolved(state.cubies);

    set({
      manual: null,
      turnCount: state.turnCount + 1,
      history: [...state.history, ...added],
      moveCount: state.moveCount + 1,
      solved: nowSolved,
      solvedAt: nowSolved && !state.solved ? Date.now() : state.solvedAt,
    });
  },

  cancelManual: () => {
    set({ manual: null });
  },
}));
