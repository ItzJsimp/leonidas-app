// @effect-diagnostics nodeBuiltinImport:off - the X agent saves its analytics as plain files.
import {
  completeFeedEvent,
  type MarketingBadRecord,
  type MarketingConnections,
  type MarketingMetricSnapshot,
} from "@t3tools/contracts";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { appendFeedEvent } from "../events/feedFile.ts";
import { appendMetrics, insideRoot, readCapped, readConnections } from "./marketingFiles.ts";

/** One network. Slice 1 has read only; publish arrives with its own approval check. */
export interface MarketingConnector {
  readonly channel: MarketingMetricSnapshot["channel"];
  readonly readMetrics: (
    root: string,
    connections: MarketingConnections,
  ) => { snapshots: Array<MarketingMetricSnapshot>; errors: Array<MarketingBadRecord> };
}

const count = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

/**
 * X in draft mode: reads the X agent's saved `/2/users/me/tweets` responses
 * (`<analyticsDir>/YYYY-MM-DD.json`). Zero API calls, so zero cost.
 */
export const xDraftConnector: MarketingConnector = {
  channel: "x",
  readMetrics: (root, connections) => {
    const snapshots: Array<MarketingMetricSnapshot> = [];
    const errors: Array<MarketingBadRecord> = [];
    const x = connections.x;
    if (!x) return { snapshots, errors };
    const folder = insideRoot(root, x.analyticsDir);
    if (!folder) {
      errors.push({ file: x.analyticsDir, reason: "the folder is outside the workspace" });
      return { snapshots, errors };
    }
    if (!NodeFS.existsSync(folder)) return { snapshots, errors };
    for (const name of NodeFS.readdirSync(folder).toSorted()) {
      const day = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(name)?.[1];
      if (!day) continue;
      const file = NodePath.relative(root, NodePath.join(folder, name)).replaceAll("\\", "/");
      let body: unknown;
      try {
        const text = readCapped(NodePath.join(folder, name));
        if (text === null) {
          errors.push({ file, reason: "the file is over 5 MB" });
          continue;
        }
        body = JSON.parse(text);
      } catch {
        errors.push({ file, reason: "not valid JSON" });
        continue;
      }
      const data = (body as { data?: unknown } | null)?.data;
      if (!Array.isArray(data)) {
        errors.push({ file, reason: "no data list (not an X posts response)" });
        continue;
      }
      data.forEach((item: unknown, index) => {
        const post = item as { id?: unknown; public_metrics?: Record<string, unknown> } | null;
        const metrics = post?.public_metrics;
        if (typeof post?.id !== "string" || !metrics || typeof metrics !== "object") {
          errors.push({ file, line: index + 1, reason: "post without an id or public_metrics" });
          return;
        }
        const impressions = count(metrics.impression_count);
        const likes = count(metrics.like_count);
        const replies = count(metrics.reply_count);
        const reposts = count(metrics.retweet_count);
        snapshots.push({
          v: 1,
          channel: "x",
          ...(x.brand ? { brand: x.brand } : {}),
          externalId: post.id,
          at: `${day}T00:00:00Z`,
          source: "x-analytics-file",
          ...(impressions === undefined ? {} : { impressions }),
          ...(likes === undefined ? {} : { likes }),
          ...(replies === undefined ? {} : { replies }),
          ...(reposts === undefined ? {} : { reposts }),
        });
      });
    }
    return { snapshots, errors };
  },
};

const CONNECTORS: ReadonlyArray<MarketingConnector> = [xDraftConnector];

export interface SyncResult {
  readonly added: number;
  readonly errors: ReadonlyArray<MarketingBadRecord>;
}

/**
 * Pulls metrics from every connector into `metrics/`. A bad response is skipped, reported back,
 * and written as one `marketing.connector_error` feed event; the other connectors still run.
 */
export function syncMetrics(
  root: string,
  connectors: ReadonlyArray<MarketingConnector> = CONNECTORS,
): SyncResult {
  const connections = readConnections(root);
  if (!("v" in connections)) {
    reportErrors(root, "connections", [connections]);
    return { added: 0, errors: [connections] };
  }
  let added = 0;
  const errors: Array<MarketingBadRecord> = [];
  for (const connector of connectors) {
    let read: ReturnType<MarketingConnector["readMetrics"]>;
    try {
      read = connector.readMetrics(root, connections);
    } catch (error) {
      read = { snapshots: [], errors: [{ file: connector.channel, reason: String(error) }] };
    }
    added += appendMetrics(root, read.snapshots);
    reportErrors(root, connector.channel, read.errors);
    errors.push(...read.errors);
  }
  return { added, errors };
}

function reportErrors(root: string, source: string, errors: ReadonlyArray<MarketingBadRecord>) {
  if (errors.length === 0) return;
  const first = errors[0]!;
  appendFeedEvent(
    root,
    completeFeedEvent({
      level: "failed",
      type: "marketing.connector_error",
      title: `Marketing skipped ${errors.length} bad ${source} record${errors.length === 1 ? "" : "s"}`,
      body: `${first.file}${first.line ? ` line ${first.line}` : ""}: ${first.reason}`.slice(
        0,
        500,
      ),
      actor: { kind: "app", name: "Marketing" },
      dedupe: `marketing.connector_error:${source}:${first.file}`,
    }),
  );
}
