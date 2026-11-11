import { create } from "zustand";

/** Open state of the New workspace dialog; the workspace menu and command palette open it. */
export const useNewWorkspaceStore = create<{ open: boolean }>(() => ({ open: false }));

export const openNewWorkspace = () => useNewWorkspaceStore.setState({ open: true });
