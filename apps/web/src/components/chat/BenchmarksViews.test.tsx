/* oxlint-disable t3code/require-disposable-render -- Browser tests cannot start in this shell; these use react-test-renderer like ThreadDetailsUsage.refresh.test.tsx. */
import { act } from "react";
import { create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { renderToStaticMarkup } from "react-dom/server";
import {
  COMPARE_METRICS,
  SCORE_METRICS,
  candidatesOfModel,
  groupModels,
  offeredEfforts,
  rankModels,
} from "../../lib/benchmarkWindow";
import { BenchmarkDetail } from "./BenchmarkDetail";
import { BenchmarksBars } from "./BenchmarksBars";
import { BenchmarksChart } from "./BenchmarksChart";
import { BenchmarksTable } from "./BenchmarksTable";
import { FIXTURE_CANDIDATES, FIXTURE_ENTRIES } from "./benchmarksFixtures";
import { EffortNumbers } from "./PickerEffortNumbers";

const models = groupModels(FIXTURE_ENTRIES, "artificialAnalysis");
const opus = models.find((model) => model.name === "Claude Opus 5.5")!;
const score = SCORE_METRICS.artificialAnalysis[0]!;
const offered = (model: typeof opus) => offeredEfforts(model, FIXTURE_CANDIDATES);
const runnable = (model: typeof opus) => candidatesOfModel(model, FIXTURE_CANDIDATES).length > 0;

let renderer: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(() => {
  act(() => renderer.unmount());
  vi.unstubAllGlobals();
});

const text = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === "string" ? child : text(child))).join(" ");

const mount = async (element: React.ReactElement) => {
  await act(async () => {
    renderer = create(element);
  });
  return renderer.root;
};

it("marks an effort the provider offers but no source measured as N/A, never borrowing a number", async () => {
  const detail = (effort: string) => (
    <BenchmarkDetail
      source="artificialAnalysis"
      model={opus}
      score={score}
      rank={{ place: 5, of: 12 }}
      offered={["low", "medium", "high", "xhigh", "max"]}
      effort={effort}
      onEffort={onEffort}
      chat={null}
      onStartChat={null}
      status={null}
    />
  );
  const onEffort = vi.fn();
  const root = await mount(detail("medium"));
  const tile = (name: string) =>
    root.findAll((node) => node.props.role === "radio" && text(node).includes(name))[0]!;
  expect(text(tile("X-High"))).toContain("N/A");
  expect(text(tile("Med"))).toContain("52.1");
  await act(async () => tile("X-High").props.onClick());
  expect(onEffort).toHaveBeenCalledWith("xhigh");
  await act(async () => renderer.update(detail("xhigh")));
  expect(text(renderer.root)).toContain("Not benchmarked");
});

it("puts a name on every model in the Chart, in every effort mode", async () => {
  for (const mode of ["highest", "default", "all"] as const) {
    const root = await mount(
      <BenchmarksChart
        source="artificialAnalysis"
        models={models}
        mode={mode}
        score={score}
        compare={COMPARE_METRICS.artificialAnalysis[0]!}
        runnable={runnable}
        selected={opus}
        selectedEffort="medium"
        onSelect={() => undefined}
      />,
    );
    const names = root.findAll(
      (node) => node.type === "text" && node.props["aria-hidden"] === "true",
    );
    expect(names).toHaveLength(models.length);
    await act(async () => renderer.unmount());
  }
  renderer = create(<div />);
});

it("opens a Table row to show each effort and says Not benchmarked for a gap", async () => {
  const root = await mount(
    <BenchmarksTable
      source="artificialAnalysis"
      ranked={rankModels(models, "highest", score)}
      score={score}
      runnable={runnable}
      offered={offered}
      runs={() => null}
    />,
  );
  expect(text(root)).not.toContain("Not benchmarked");
  const row = root.findAll(
    (node) => node.props.role === "row" && node.props["aria-expanded"] === false,
  )[0]!;
  await act(async () => row.props.onClick());
  // Opus offers X-High; the fixtures hold no X-High run for it.
  expect(text(renderer.root)).toContain("Not benchmarked");
});

it("draws one bar per model, and a bar per effort when every effort is shown", async () => {
  const bars = (mode: "highest" | "all") => (
    <BenchmarksBars
      models={models}
      mode={mode}
      metric={score}
      runnable={runnable}
      selectedKey={null}
      onSelect={() => undefined}
    />
  );
  const root = await mount(bars("highest"));
  const count = () =>
    renderer.root.findAll((node) => node.type === "span" && node.props.style?.height).length;
  expect(count()).toBe(models.length);
  await act(async () => renderer.update(bars("all")));
  expect(count()).toBe(FIXTURE_ENTRIES.length);
  expect(root).toBeDefined();
});

it("says Not benchmarked in the picker for an effort with no run", async () => {
  expect(renderToStaticMarkup(<EffortNumbers stats={null} />)).toContain(
    "Not benchmarked",
  );
});
