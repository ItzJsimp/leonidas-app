import type { EnvironmentId } from "@t3tools/contracts";
import { CopyIcon, EllipsisIcon, ExternalLinkIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ensureLocalApi } from "../../localApi";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { toastManager } from "../ui/toast";
import { parseDiscord, type DiscordStatus } from "./meetings.logic";
import { useMeetingsCall, type Call } from "./useMeetingsCall";

const PORTAL_URL = "https://discord.com/developers/applications";
const REDIRECT = "http://127.0.0.1";

/**
 * Discord names the speakers on a Discord call. Optional: without it the voices are split by sound.
 * One button saves the keys and connects, so there is no separate Save step.
 */
export function DiscordNamesCard(props: {
  readonly environmentId: EnvironmentId;
  readonly call: Call;
}) {
  const write = useMeetingsCall(props.environmentId, "discord");
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Stop waiting" cannot end the engine's wait, so a result that comes after it is ignored.
  const attempt = useRef(0);

  const refresh = useCallback(async () => {
    const result = await props.call("GET", "discord");
    if (result.ok) setStatus(parseDiscord(result.value));
  }, [props.call]);

  // Read the saved state on load so a finished setup shows as done before it is opened.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saved = status?.configured === true;
  const connected = status?.connected === true;

  const connect = async () => {
    const mine = ++attempt.current;
    setError(null);
    setWaiting(true);
    if (!saved || clientSecret !== "") {
      const put = await write("PUT", "discord", {
        clientId: clientId.trim(),
        ...(clientSecret === "" ? {} : { clientSecret }),
      });
      if (!put.ok) {
        setWaiting(false);
        if (put.message !== null) setError(put.message);
        return;
      }
      setClientSecret("");
    }
    const result = await write("POST", "discord/connect");
    if (mine !== attempt.current) return;
    setWaiting(false);
    if (!result.ok && result.message !== null) setError(result.message);
    await refresh();
  };

  const stopWaiting = () => {
    attempt.current += 1;
    setWaiting(false);
  };

  const remove = async () => {
    const result = await write("DELETE", "discord");
    if (!result.ok && result.message !== null) setError(result.message);
    setClientId("");
    await refresh();
  };

  const copyRedirect = () =>
    void navigator.clipboard.writeText(REDIRECT).then(
      () => toastManager.add({ type: "success", title: "Redirect copied" }),
      () => setError(`Copy failed. Type ${REDIRECT} in the Discord redirect box.`),
    );

  const menu = saved ? (
    <Menu>
      <MenuTrigger
        render={
          <Button size="icon-xs" variant="ghost" aria-label="Discord options">
            <EllipsisIcon aria-hidden />
          </Button>
        }
      />
      <MenuPopup align="end">
        <MenuItem variant="destructive" onClick={() => void remove()}>
          Remove Discord keys
        </MenuItem>
      </MenuPopup>
    </Menu>
  ) : null;

  const title = connected
    ? `Discord names are on${status?.user ? ` (connected as ${status.user})` : ""}`
    : saved
      ? "Discord keys are saved. Connect to finish."
      : "Show who is speaking in Discord calls (optional)";

  return (
    <details>
      <summary className="cursor-pointer text-xs text-muted-foreground">{title}</summary>
      <div className="mt-2 flex max-w-xl flex-col gap-3 text-sm">
        {connected ? (
          <p className="text-muted-foreground">
            Speakers in a Discord call show with their Discord names.
          </p>
        ) : saved ? (
          <p className="text-muted-foreground">
            Press Connect Discord, then click Authorize in the Discord window.
          </p>
        ) : (
          <>
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-muted-foreground">
              <li>
                Open the Discord developer portal and make a new application.{" "}
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => void ensureLocalApi().shell.openExternal(PORTAL_URL)}
                >
                  <ExternalLinkIcon aria-hidden />
                  Open portal
                </Button>
              </li>
              <li>
                Under OAuth2, add this redirect and copy the Client ID and Client secret.{" "}
                <Button size="xs" variant="outline" onClick={copyRedirect}>
                  <CopyIcon aria-hidden />
                  Copy redirect
                </Button>
              </li>
              <li>Paste them here and press Connect Discord.</li>
            </ol>
            <Input
              aria-label="Discord client ID"
              placeholder="Client ID"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
            />
            <Input
              aria-label="Discord client secret"
              type="password"
              placeholder="Client secret"
              autoComplete="off"
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
            />
          </>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {connected ? null : waiting ? (
            <>
              <span role="status" className="text-muted-foreground">
                Waiting for you to click Authorize in Discord…
              </span>
              <Button size="sm" variant="ghost" onClick={stopWaiting}>
                Stop waiting
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              disabled={!saved && (clientId.trim() === "" || clientSecret === "")}
              onClick={() => void connect()}
            >
              Connect Discord
            </Button>
          )}
          {menu}
        </div>
        {error !== null ? (
          <p role="alert" className="text-destructive-foreground">
            {error}
          </p>
        ) : null}
      </div>
    </details>
  );
}
