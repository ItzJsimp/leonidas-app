import type { OrchestratorMcpAcceptanceResult } from "@t3tools/contracts";
import * as NodeProcess from "node:process";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SqlClient from "effect/sql/SqlClient";

import * as ProcessRunner from "../processRunner.ts";

const OUTPUT_TAIL_CHARS = 2_000;
const CHECK_TIMEOUT = "5 minutes";

export class DelegatedTaskAcceptance extends Context.Service<
  DelegatedTaskAcceptance,
  {
    /** Remember the check for a task. A repeat registration keeps the first. */
    readonly register: (taskId: string, command: string) => Effect.Effect<void>;
    /**
     * Verdict for a task, running the check in `cwd` the first time. None when the
     * task has no check. Later calls return the stored verdict without a rerun.
     */
    readonly evaluate: (
      taskId: string,
      cwd: string | null,
      checkedAt: string,
    ) => Effect.Effect<Option.Option<OrchestratorMcpAcceptanceResult>>;
  }
>()("t3/mcp/DelegatedTaskAcceptance") {}

// On Windows the command goes in through stdin: argument quoting would mangle
// any command that holds quotes or spaces. `exit /b` carries the last exit code.
const shellInvocation = (command: string) =>
  NodeProcess.platform === "win32"
    ? {
        command: "cmd",
        args: ["/d", "/q"],
        stdin: `${command}

exit /b %errorlevel%

`,
      }
    : { command: "sh", args: ["-c", command], stdin: undefined };

const tail = (text: string) =>
  text.length > OUTPUT_TAIL_CHARS ? text.slice(text.length - OUTPUT_TAIL_CHARS) : text;

interface AcceptanceRow {
  readonly command: string;
  readonly verdict: "pass" | "fail" | "error" | null;
  readonly exit_code: number | null;
  readonly output_tail: string | null;
}

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const processes = yield* ProcessRunner.ProcessRunner;

  const run = (command: string, cwd: string | null) =>
    cwd === null
      ? Effect.succeed({
          verdict: "error" as const,
          exitCode: null,
          outputTail: "The task has no worktree to run the check in.",
        })
      : processes
          .run({
            ...shellInvocation(command),
            cwd,
            timeout: CHECK_TIMEOUT,
            timeoutBehavior: "timedOutResult",
            outputMode: "truncate",
            maxOutputBytes: 64 * 1024,
          })
          .pipe(
            Effect.map((output) => ({
              verdict: output.timedOut
                ? ("error" as const)
                : output.code === 0
                  ? ("pass" as const)
                  : ("fail" as const),
              exitCode: output.code === null ? null : Number(output.code),
              outputTail: output.timedOut
                ? `The check timed out after ${CHECK_TIMEOUT}.`
                : tail(`${output.stdout}${output.stderr}`),
            })),
            Effect.catch((error) =>
              Effect.succeed({
                verdict: "error" as const,
                exitCode: null,
                outputTail: tail(error.message),
              }),
            ),
          );

  return DelegatedTaskAcceptance.of({
    register: (taskId, command) =>
      sql`
        INSERT INTO delegated_task_acceptance (task_id, command)
        VALUES (${taskId}, ${command})
        ON CONFLICT(task_id) DO NOTHING
      `.pipe(
        Effect.asVoid,
        Effect.catch((error) => Effect.logWarning("acceptance check not saved", error)),
      ),
    evaluate: (taskId, cwd, checkedAt) =>
      Effect.gen(function* () {
        const rows = yield* sql<AcceptanceRow>`
          SELECT command, verdict, exit_code, output_tail
          FROM delegated_task_acceptance WHERE task_id = ${taskId}
        `;
        const row = rows[0];
        if (row === undefined) return Option.none();
        if (row.verdict !== null) {
          return Option.some({
            command: row.command,
            verdict: row.verdict,
            exitCode: row.exit_code,
            outputTail: row.output_tail ?? "",
          });
        }
        const result = yield* run(row.command, cwd);
        yield* sql`
          UPDATE delegated_task_acceptance
          SET verdict = ${result.verdict}, exit_code = ${result.exitCode},
            output_tail = ${result.outputTail}, checked_at = ${checkedAt}
          WHERE task_id = ${taskId}
        `;
        return Option.some({ command: row.command, ...result });
      }).pipe(
        Effect.catch((error) =>
          Effect.logWarning("acceptance check failed to read or save", error).pipe(
            Effect.as(Option.none()),
          ),
        ),
      ),
  });
});

export const layer = Layer.effect(DelegatedTaskAcceptance, make);
