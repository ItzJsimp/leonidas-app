import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import type { TeamLens } from "./teamView.logic";

interface TeamLensState {
  readonly lens: TeamLens;
  readonly setLens: (lens: TeamLens) => void;
}

const TeamLensContext = createContext<TeamLensState>({ lens: null, setLens: () => {} });

/** One lens for the whole Command Center: the Team view sets it, the cards read it. */
export function TeamLensProvider(props: { readonly children: ReactNode }) {
  const [lens, setLens] = useState<TeamLens>(null);
  const value = useMemo(() => ({ lens, setLens }), [lens]);
  return <TeamLensContext.Provider value={value}>{props.children}</TeamLensContext.Provider>;
}

export const useTeamLens = () => useContext(TeamLensContext);
