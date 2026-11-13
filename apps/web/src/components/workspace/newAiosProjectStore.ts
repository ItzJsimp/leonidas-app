import { create } from "zustand";

/** Open state of the New project dialog; the Projects window, new-chat picker and hero open it. */
export const useNewAiosProjectStore = create<{ open: boolean }>(() => ({ open: false }));

export const openNewAiosProject = () => useNewAiosProjectStore.setState({ open: true });
