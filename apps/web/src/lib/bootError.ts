/** Shows startup failures before React can replace the boot splash. */
export function showBootError(error: unknown) {
  console.error("Leonidas failed to start.", error);
  const bootShell = document.getElementById("boot-shell");
  if (!bootShell) return;

  // index.html owns a watchdog panel with Retry and a copyable fix prompt for an agent.
  const bootFail = (globalThis as { __leonidasBootFail?: (reason: string) => void })
    .__leonidasBootFail;
  if (typeof bootFail === "function") {
    bootFail(error instanceof Error ? error.message : String(error));
    return;
  }

  const content = document.createElement("div");
  content.id = "boot-error";
  content.setAttribute("role", "alert");

  const message = document.createElement("p");
  message.textContent = "Leonidas could not load.";
  content.append(message);

  if (import.meta.env.DEV && error instanceof Error) {
    const detail = document.createElement("p");
    detail.textContent = error.message;
    content.append(detail);
  }

  const reload = document.createElement("button");
  reload.type = "button";
  reload.textContent = "Reload";
  reload.addEventListener("click", () => window.location.reload());
  content.append(reload);
  bootShell.replaceChildren(content);
}
