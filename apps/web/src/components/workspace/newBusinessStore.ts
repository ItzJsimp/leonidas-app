import { create } from "zustand";

/** Open state of the New business dialog; the command palette calls `openNewBusiness`. */
export const useNewBusinessStore = create<{ open: boolean }>(() => ({ open: false }));

export const openNewBusiness = () => useNewBusinessStore.setState({ open: true });
