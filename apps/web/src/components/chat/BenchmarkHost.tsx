import type { EnvironmentId, ModelSelection } from "@t3tools/contracts";
import { useState } from "react";

import { useBenchmarkUi } from "../../benchmarkUiStore";
import type { BenchmarkCandidate } from "../../lib/modelBenchmarks";
import { BenchmarksWindow } from "./BenchmarksWindow";
import { BlindTestDialog, type StartBenchmarkArena } from "./BenchmarkExplorer";

/**
 * Draws the benchmarks window and the blind test. Mounted once in the chat view, which owns the
 * accounts and the way to start a chat; `useBenchmarkUi().openWindow()` opens it from anywhere.
 */
export function BenchmarkHost(props: {
  environmentId: EnvironmentId;
  candidates: ReadonlyArray<BenchmarkCandidate>;
  /** Null when no project is active, which hides the "New chat" buttons. */
  onStartChat: ((selection: ModelSelection) => void) | null;
  onStartArena: StartBenchmarkArena | null;
}) {
  const windowOpen = useBenchmarkUi((state) => state.windowOpen);
  const focusModel = useBenchmarkUi((state) => state.focusModel);
  const closeWindow = useBenchmarkUi((state) => state.closeWindow);
  const [blindTest, setBlindTest] = useState(false);
  const { onStartChat } = props;
  return (
    <>
      {windowOpen ? (
        <BenchmarksWindow
          open
          onOpenChange={(open) => (open ? undefined : closeWindow())}
          environmentId={props.environmentId}
          candidates={props.candidates}
          focusModel={focusModel}
          onStartChat={
            onStartChat
              ? (selection) => {
                  closeWindow();
                  onStartChat(selection);
                }
              : null
          }
          onBlindTest={() => {
            closeWindow();
            setBlindTest(true);
          }}
        />
      ) : null}
      {blindTest ? (
        <BlindTestDialog
          open
          onOpenChange={setBlindTest}
          environmentId={props.environmentId}
          candidates={props.candidates}
          onStartChat={onStartChat}
          onStartArena={props.onStartArena}
        />
      ) : null}
    </>
  );
}
