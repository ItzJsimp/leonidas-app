import type { HardwareAlert, HardwareSample } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import { hardwareStatus } from "./hardwareStatus.ts";

const sample = {
  at: 1_000,
  cpu: { loadPct: 12, coreLoadPct: [], clockMhz: 4000, packageTempC: 55, maxCoreTempC: 60 },
  memory: { usedBytes: 8, totalBytes: 32 },
  gpus: [{ index: 0, name: "RTX", loadPct: 5, tempC: 40, vramUsedBytes: 2, vramTotalBytes: 8 }],
  volumes: [{ mount: "C:", label: null, mediaType: "ssd", usedBytes: 95, totalBytes: 100 }],
  sensors: [{ id: "x", name: "secret-sensor" }],
} as unknown as HardwareSample;
const alert = (over: Partial<HardwareAlert>) =>
  ({
    id: "a",
    metric: "volume.C:.used",
    label: "Drive C: space used",
    severity: "warning",
    unit: "%",
    value: 95,
    peak: 95,
    limit: 90,
    message: "Drive C: is almost full.",
    resolvedAt: null,
    ...over,
  }) as unknown as HardwareAlert;

describe("hardwareStatus", () => {
  it("includes an open disk-free alert and the free space of each drive", () => {
    const status = hardwareStatus(sample, [alert({})]);
    expect(status.activeAlerts.map((entry) => entry.metric)).toEqual(["volume.C:.used"]);
    expect(status.disks).toEqual([{ mount: "C:", freeBytes: 5, totalBytes: 100, usedPct: 95 }]);
  });

  it("leaves out a resolved alert", () => {
    expect(hardwareStatus(sample, [alert({ resolvedAt: 5 })]).activeAlerts).toEqual([]);
  });

  it("reports CPU, memory and GPU numbers", () => {
    const status = hardwareStatus(sample, []);
    expect(status.cpu).toEqual({ loadPct: 12, tempC: 55, clockMhz: 4000 });
    expect(status.memory?.usedPct).toBe(25);
    expect(status.gpus[0]?.vramUsedPct).toBe(25);
  });

  it("returns nulls before the first reading, and never the raw sensors", () => {
    expect(hardwareStatus(null, []).cpu).toBeNull();
    expect(JSON.stringify(hardwareStatus(sample, []))).not.toContain("secret-sensor");
  });
});
