import type { HardwareAlert, HardwareSample } from "@t3tools/contracts";

const pct = (used: number, total: number) =>
  total > 0 ? Math.round((used / total) * 1000) / 10 : null;

/**
 * A short, agent-sized view of the newest reading and the alerts still open. It holds numbers
 * only: no process names, command lines or sensor dumps.
 */
export function hardwareStatus(
  sample: HardwareSample | null,
  alerts: ReadonlyArray<HardwareAlert>,
) {
  return {
    sampledAt: sample === null ? null : sample.at,
    cpu:
      sample === null
        ? null
        : {
            loadPct: sample.cpu.loadPct,
            tempC: sample.cpu.packageTempC ?? sample.cpu.maxCoreTempC,
            clockMhz: sample.cpu.clockMhz,
          },
    memory:
      sample === null
        ? null
        : {
            usedBytes: sample.memory.usedBytes,
            totalBytes: sample.memory.totalBytes,
            usedPct: pct(sample.memory.usedBytes, sample.memory.totalBytes),
          },
    gpus: (sample?.gpus ?? []).map((gpu) => ({
      name: gpu.name,
      loadPct: gpu.loadPct,
      tempC: gpu.tempC,
      vramUsedBytes: gpu.vramUsedBytes,
      vramTotalBytes: gpu.vramTotalBytes,
      vramUsedPct:
        gpu.vramUsedBytes !== null && gpu.vramTotalBytes !== null
          ? pct(gpu.vramUsedBytes, gpu.vramTotalBytes)
          : null,
    })),
    disks: (sample?.volumes ?? []).map((volume) => ({
      mount: volume.mount,
      freeBytes: Math.max(0, volume.totalBytes - volume.usedBytes),
      totalBytes: volume.totalBytes,
      usedPct: pct(volume.usedBytes, volume.totalBytes),
    })),
    // A resolved alert is history, not a reason to avoid a heavy run.
    activeAlerts: alerts
      .filter((alert) => alert.resolvedAt === null)
      .map((alert) => ({
        metric: alert.metric,
        label: alert.label,
        severity: alert.severity,
        value: alert.value,
        limit: alert.limit,
        unit: alert.unit,
        message: alert.message,
      })),
  };
}
