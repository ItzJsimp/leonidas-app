import type { ImageCatalogModel } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  clampToRange,
  computeFit,
  dimensionsFor,
  estimateRunRange,
  filterCatalog,
  filterGallery,
  fitView,
  formatRange,
  groupRuns,
  installCheck,
  licenceView,
  modelTimeLabel,
  needsConfirm,
  resolveSeed,
  sortCatalog,
  toggleCompare,
} from "./catalog.logic";
import { buildCatalog, catalogSpecs } from "./images.mock";

const GB = 1024 ** 3;
const pc = (vram: number, ram = 32) => ({ vramBytes: vram * GB, ramBytes: ram * GB });

describe("computeFit", () => {
  it("labels shared memory as an unverified Mac Beta estimate", () => {
    const hardware = { ...pc(0, 8), unifiedMemory: true };
    expect(computeFit(10 * GB, hardware)).toMatchObject({ fit: "runs-slow" });
    expect(computeFit(10 * GB, hardware).reason).toContain("Beta");
    expect(computeFit(20 * GB, hardware).fit).toBe("too-big");
  });
  it("runs well when the model fits on the card", () => {
    expect(computeFit(10 * GB, pc(12)).fit).toBe("runs-well");
  });
  it("runs slow when half fits and memory holds the rest", () => {
    const result = computeFit(20 * GB, pc(12));
    expect(result.fit).toBe("runs-slow");
    expect(result.reason).toContain("normal memory");
  });
  it("is too big when the card holds less than half", () => {
    expect(computeFit(28 * GB, pc(12)).fit).toBe("too-big");
  });
  it("is too big when normal memory cannot hold the rest", () => {
    expect(computeFit(20 * GB, pc(12, 8)).fit).toBe("too-big");
  });
  it("gives plain labels", () => {
    expect(fitView("runs-well").label).toBe("Runs well");
    expect(fitView("runs-slow").label).toBe("Runs slow");
    expect(fitView("too-big").label).toBe("Too big");
  });
});

describe("time", () => {
  it("labels measured and estimated times", () => {
    expect(modelTimeLabel({ measuredSeconds: 12, estimatedSeconds: 20 })).toBe("12 s on your PC");
    expect(modelTimeLabel({ measuredSeconds: null, estimatedSeconds: 20 })).toBe(
      "about 20 s, estimate",
    );
  });
  it("adds one load per model and widens estimates more than measured times", () => {
    const measured = estimateRunRange(
      [{ measuredSeconds: 10, estimatedSeconds: 99, loadSeconds: 5 }],
      2,
    );
    expect(measured).toEqual({ low: 25, high: 29 });
    const estimated = estimateRunRange(
      [{ measuredSeconds: null, estimatedSeconds: 10, loadSeconds: 5 }],
      2,
    );
    expect(estimated).toEqual({ low: 25, high: 40 });
  });
  it("asks to confirm only above 10 minutes", () => {
    expect(needsConfirm({ low: 300, high: 600 })).toBe(false);
    expect(needsConfirm({ low: 400, high: 601 })).toBe(true);
  });
  it("formats ranges", () => {
    expect(formatRange({ low: 25, high: 40 })).toBe("about 25 s to 40 s");
    expect(formatRange({ low: 40, high: 90 })).toBe("about 40 s to 2 min");
    expect(formatRange({ low: 180, high: 300 })).toBe("about 3 to 5 min");
    expect(formatRange({ low: 60, high: 70 })).toBe("about 1 min");
  });
});

describe("resolveSeed", () => {
  it("picks a new seed in random mode", () => {
    expect(resolveSeed("random", "42", () => 0.5)).toBe(Math.floor(0.5 * 4_294_967_295));
  });
  it("uses the number in fixed mode", () => {
    expect(resolveSeed("fixed", " 42 ")).toBe(42);
  });
  it("rejects an empty or bad fixed seed", () => {
    expect(resolveSeed("fixed", "")).toBe("invalid");
    expect(resolveSeed("fixed", "4.2")).toBe("invalid");
    expect(resolveSeed("fixed", "9999999999")).toBe("invalid");
  });
});

describe("dimensions and ranges", () => {
  it("gives multiples of 64 for each preset", () => {
    expect(dimensionsFor("square", "medium")).toEqual({ width: 1024, height: 1024 });
    expect(dimensionsFor("portrait", "medium")).toEqual({ width: 768, height: 1024 });
    expect(dimensionsFor("wide", "medium")).toEqual({ width: 1024, height: 576 });
  });
  it("clamps and snaps to the model range", () => {
    const range = { min: 0, max: 10, step: 0.5 };
    expect(clampToRange(12, range)).toBe(10);
    expect(clampToRange(-1, range)).toBe(0);
    expect(clampToRange(3.3, range)).toBe(3.5);
  });
});

describe("catalog", () => {
  const catalog = buildCatalog(catalogSpecs(false), "12", new Map());
  const ids = (models: ReadonlyArray<ImageCatalogModel>) => models.map((model) => model.id);

  it("filters by installed, fit, sale use and speed", () => {
    expect(ids(filterCatalog(catalog, "", new Set(["installed"])))).toEqual([
      "flux2klein",
      "qwen",
      "qwen21",
    ]);
    expect(ids(filterCatalog(catalog, "", new Set(["fits"])))).not.toContain("flux2dev");
    // No licence is verified, so nothing passes "Sale use OK" and nothing is claimed.
    expect(filterCatalog(catalog, "", new Set(["commercial"]))).toEqual([]);
    expect(ids(filterCatalog(catalog, "", new Set(["fast"])))).toEqual(
      expect.arrayContaining(["flux2klein", "zimage-turbo", "sdxl"]),
    );
    expect(ids(filterCatalog(catalog, "", new Set(["fast"])))).not.toContain("qwen");
  });
  it("searches name, family and tags", () => {
    expect(ids(filterCatalog(catalog, "text", new Set()))).toEqual(
      expect.arrayContaining(["qwen", "qwen21"]),
    );
  });
  it("lists at least 30 known models", () => {
    expect(catalog.length).toBeGreaterThanOrEqual(30);
    expect(new Set(ids(catalog)).size).toBe(catalog.length);
  });
  it("sorts ready and fitting models first", () => {
    expect(ids(sortCatalog(catalog, "recommended")).slice(0, 3)).toEqual([
      "flux2klein",
      "qwen21",
      "qwen",
    ]);
    expect(ids(sortCatalog(catalog, "smallest"))[0]).toBe("sd15");
  });
  it("uses measured seconds only for the measured PC", () => {
    const other = buildCatalog(catalogSpecs(false), "24", new Map());
    expect(catalog.find((model) => model.id === "flux2klein")?.measuredSeconds).toBe(15);
    expect(other.find((model) => model.id === "flux2klein")?.measuredSeconds).toBeNull();
  });
  it("builds a 40-model catalog", () => {
    expect(buildCatalog(catalogSpecs(true), "6", new Map())).toHaveLength(40);
  });
});

describe("licenceView", () => {
  it("shows a neutral Check licence when not verified", () => {
    const view = licenceView({ commercialUse: "no", licenceName: "X", licenceVerifiedOn: null });
    expect(view).toEqual({ label: "Check licence", variant: "outline", verified: false });
  });
  it("colours only verified values", () => {
    expect(
      licenceView({
        commercialUse: "yes",
        licenceName: "Apache 2.0",
        licenceVerifiedOn: "2026-10-16",
      }).variant,
    ).toBe("success");
  });
});

describe("installCheck", () => {
  it("blocks when the disk is too small", () => {
    expect(installCheck({ sizeBytes: 50 * GB, state: "not-installed" }, 40 * GB).ok).toBe(false);
    expect(installCheck({ sizeBytes: 5 * GB, state: "not-installed" }, 40 * GB)).toEqual({
      ok: true,
      text: "Needs 5.0 GB. 40 GB is free on the disk.",
    });
  });
});

describe("gallery", () => {
  const g = (id: string, jobId: string, modelId: string, createdAt: number, kept = false) => ({
    id,
    jobId,
    modelId,
    createdAt,
    kept,
  });
  it("groups by run, newest run first, models in first order", () => {
    const runs = groupRuns([
      g("1", "a", "m1", 10),
      g("2", "a", "m2", 10),
      g("3", "a", "m1", 10),
      g("4", "b", "m1", 20),
    ]);
    expect(runs.map((run) => run.jobId)).toEqual(["b", "a"]);
    expect(runs[1]?.byModel.map((entry) => [entry.modelId, entry.items.length])).toEqual([
      ["m1", 2],
      ["m2", 1],
    ]);
  });
  it("filters by model and kept", () => {
    const items = [g("1", "a", "m1", 1, true), g("2", "a", "m2", 1), g("3", "a", "m1", 1)];
    expect(filterGallery(items, "m1", false).map((item) => item.id)).toEqual(["1", "3"]);
    expect(filterGallery(items, null, true).map((item) => item.id)).toEqual(["1"]);
  });
  it("holds at most 4 pictures to compare", () => {
    let chosen: string[] = [];
    for (const id of ["a", "b", "c", "d", "e"]) chosen = toggleCompare(chosen, id);
    expect(chosen).toEqual(["b", "c", "d", "e"]);
    expect(toggleCompare(chosen, "c")).toEqual(["b", "d", "e"]);
  });
});
