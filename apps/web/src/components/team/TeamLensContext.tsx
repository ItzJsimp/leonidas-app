import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { lensForScope } from "./teamLens.logic";
import type { TeamLens } from "./teamView.logic";

interface TeamLensState {
  readonly lens: TeamLens;
  readonly setLens: (lens: TeamLens) => void;
}

const TeamLensContext = createContext<TeamLensState>({ lens: null, setLens: () => {} });

/**
 * One lens for the whole Command Center: the Team view sets it, the cards read it. `scopeKey` names
 * the active workspace, and a lens never carries over to another one.
 */
export function TeamLensProvider(props: {
  readonly scopeKey: string;
  readonly children: ReactNode;
}) {
  const { scopeKey } = props;
  const [state, setState] = useState<{ scopeKey: string; lens: TeamLens }>({
    scopeKey,
    lens: null,
  });
  const lens = lensForScope(state, scopeKey);
  const value = useMemo(
    () => ({ lens, setLens: (next: TeamLens) => setState({ scopeKey, lens: next }) }),
    [lens, scopeKey],
  );
  return <TeamLensContext.Provider value={value}>{props.children}</TeamLensContext.Provider>;
}

export const useTeamLens = () => useContext(TeamLensContext);
