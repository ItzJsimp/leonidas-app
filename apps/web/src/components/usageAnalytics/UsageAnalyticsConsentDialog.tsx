import { ensureLocalApi } from "../../localApi";
import {
  USAGE_PRIVACY_URL,
  useUsageAnalyticsStore,
} from "../../lib/usageAnalytics/usageAnalyticsStore";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";

/** First-run question. Nothing is sent until the user chooses Yes. */
export function UsageAnalyticsConsentDialog() {
  const consent = useUsageAnalyticsStore((state) => state.consent);
  const setConsent = useUsageAnalyticsStore((state) => state.setConsent);
  if (consent !== "unknown") return null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) setConsent("declined");
      }}
    >
      <DialogPopup className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Help improve Leonidas?</DialogTitle>
          <DialogDescription>
            Share anonymous usage counts so we can see what works and what does not.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>
              We send: the app version, your system type, and how long and how often you use the
              app.
            </li>
            <li>
              We send: which areas and main buttons you open, how long setup took, and which setup
              step you reached.
            </li>
            <li>
              We send: how many skills and task cards you have, which AI services you connect, how
              many messages you send, and a type label when an error or update happens.
            </li>
            <li>
              Only if you press I'm stuck: a short report with the screen name, your last action, an
              error type and the app version. You see it first and can cancel.
            </li>
            <li>
              Only if you join the friends leaderboard: your weekly word, message and active day
              counts, with a random ID made for it and a nickname only if you show one.
            </li>
            <li>
              Optional: a tester name, if you type one in Settings, so we can tell testers apart.
            </li>
            <li>We never send: your messages, replies, code, file names, folder paths or keys.</li>
            <li>We use a random ID. It has no name, email or account.</li>
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">
            You can change this at any time in Settings, General.{" "}
            <button
              type="button"
              className="relative touch-hit underline"
              onClick={() => void ensureLocalApi().shell.openExternal(USAGE_PRIVACY_URL)}
            >
              Read the privacy notice
            </button>
          </p>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConsent("declined")}>
            Decline
          </Button>
          <Button onClick={() => setConsent("granted")}>Yes, share usage</Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
