import { PRIMER_CARDS, type PrimerCard } from "../../onboarding/primer.logic";
import { toastManager } from "../ui/toast";

/** The first time a user opens the model or effort menu, repeat its basics card once. */
export function showFirstOpenTip(id: Extract<PrimerCard["id"], "switch" | "effort">) {
  const key = `leonidas:first-open-tip:${id}`;
  try {
    if (localStorage.getItem(key) !== null) return;
    localStorage.setItem(key, "1");
  } catch {
    // No storage means no memory of "seen", so show nothing rather than every time.
    return;
  }
  const card = PRIMER_CARDS.find((candidate) => candidate.id === id);
  if (card) toastManager.add({ type: "info", title: card.title, description: card.body });
}
