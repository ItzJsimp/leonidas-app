import { useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { readSettingsDockHref } from "../settings/settingsWindow";

/** Settings and Usage open as large modals over the last view of the app. */
export function isAppModalPage(pathname: string) {
  return pathname === "/settings" || pathname.startsWith("/settings/") || pathname === "/usage";
}

// Utility pages replace the sidebar utility row with a
// Back button. Everything else is the main app. Legacy `/projects/<key>` links
// redirect into settings, so they count too and are never remembered.
function isSidebarUtilityPage(pathname: string) {
  return (
    isAppModalPage(pathname) ||
    pathname.startsWith("/projects/") ||
    pathname === "/system-care" ||
    pathname === "/images" ||
    pathname === "/scribe" ||
    pathname === "/command-center" ||
    pathname === "/tasks" ||
    pathname === "/git" ||
    pathname === "/pull-requests"
  );
}

let mainAppHref: string | null = null;
// Where a Settings or Usage modal returns: the last page that was not a modal, utility pages included.
let appModalReturnHref: string | null = null;

// Mount once in the app shell. Records the latest main app URL so Back can
// return there no matter how many utility pages were visited since.
export function MainAppLocationTracker() {
  const navigate = useNavigate();
  useEffect(() => {
    const handleSettingsDock = (event: MessageEvent<unknown>) => {
      const href = readSettingsDockHref(event.data, event.origin, window.location.href);
      if (href) void navigate({ href });
    };
    window.addEventListener("message", handleSettingsDock);
    return () => window.removeEventListener("message", handleSettingsDock);
  }, [navigate]);
  const pathname = useLocation({ select: (current) => current.pathname });
  const href = useLocation({ select: (current) => current.href });
  useEffect(() => {
    if (isAppModalPage(pathname)) return;
    appModalReturnHref = href;
    if (!isSidebarUtilityPage(pathname)) mainAppHref = href;
  }, [href, pathname]);
  return null;
}

// Leaves a utility page for the last main app URL, or the thread list when
// the app was opened directly on a utility page.
export function useNavigateToMainApp() {
  const navigate = useNavigate();
  return useCallback(() => navigate({ href: mainAppHref ?? "/" }), [navigate]);
}

/** Leaves Settings or Usage for the page that opened it. */
export function useCloseAppModal() {
  const navigate = useNavigate();
  return useCallback(
    () => navigate({ href: appModalReturnHref ?? mainAppHref ?? "/" }),
    [navigate],
  );
}
