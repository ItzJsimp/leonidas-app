import { useAtomValue } from "@effect/atom-react";
import { useEffect, useRef } from "react";

import { primaryServerLegacyThreadMigrationAtom } from "../state/server";
import { toastManager } from "./ui/toast";

type MigrationToastId = ReturnType<typeof toastManager.add>;

export function LegacyThreadMigrationToast() {
  const migration = useAtomValue(primaryServerLegacyThreadMigrationAtom);
  const toastIdRef = useRef<MigrationToastId | null>(null);

  useEffect(() => {
    if (migration?.status === "running") {
      if (toastIdRef.current !== null) {
        return;
      }
      toastIdRef.current = toastManager.add({
        type: "loading",
        title: "Restoring your chats…",
        description: `${migration.totalThreadCount.toLocaleString()} ${
          migration.totalThreadCount === 1 ? "chat" : "chats"
        } to move. You can keep working.`,
        timeout: 0,
      });
      return;
    }

    if (toastIdRef.current !== null) {
      toastManager.close(toastIdRef.current);
      toastIdRef.current = null;
    }
  }, [migration]);

  useEffect(
    () => () => {
      if (toastIdRef.current !== null) {
        toastManager.close(toastIdRef.current);
      }
    },
    [],
  );

  return null;
}
