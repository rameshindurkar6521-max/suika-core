/**
 * SUIKA X — client UI store. Holds the active view, active workspace id, and
 * a global refresh tick that views can bump after mutations.
 */
import { create } from "zustand";

export type SuikaView =
  | "overview"
  | "fabric"
  | "memory"
  | "agents"
  | "router"
  | "observability"
  | "workspaces"
  | "constitution"
  | "identity"
  | "relationship"
  | "operations"
  | "registry"
  | "companion";

interface SuikaState {
  view: SuikaView;
  workspaceId: string | null;
  // monotonically increasing tick — incremented to signal "refetch everything"
  tick: number;
  setView: (v: SuikaView) => void;
  setWorkspace: (id: string | null) => void;
  bump: () => void;
}

export const useSuika = create<SuikaState>((set) => ({
  view: "companion",
  workspaceId: null,
  tick: 0,
  setView: (v) => set({ view: v }),
  setWorkspace: (id) => set({ workspaceId: id }),
  bump: () => set((s) => ({ tick: s.tick + 1 })),
}));
