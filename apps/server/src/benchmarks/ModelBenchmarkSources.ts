/**
 * Pure readers for the public benchmark feeds, and the matcher that pairs a
 * provider's model id with a source's record. Feeds are read leniently: a
 * field a source drops or renames becomes a missing value, never a failure.
 */
import type { ModelBenchmarkEntry, ModelBenchmarkMetric } from "@t3tools/contracts";

export interface ParsedBenchmarkSource {
  readonly metrics: ReadonlyArray<ModelBenchmarkMetric>;
  readonly entries: ReadonlyArray<ModelBenchmarkEntry>;
}

type UnknownRecord = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const recordAt = (value: unknown, key: string): UnknownRecord | undefined => {
  const child = isRecord(value) ? value[key] : undefined;
  return isRecord(child) ? child : undefined;
};
const itemsOf = (value: unknown, key: string): ReadonlyArray<UnknownRecord> => {
  const items = isRecord(value) ? value[key] : undefined;
  return Array.isArray(items) ? items.filter(isRecord) : [];
};
const numberAt = (value: unknown, key: string): number | undefined => {
  const field = isRecord(value) ? value[key] : undefined;
  return typeof field === "number" && Number.isFinite(field) ? field : undefined;
};
const stringAt = (value: unknown, key: string): string | undefined => {
  const field = isRecord(value) ? value[key] : undefined;
  return typeof field === "string" && field.trim().length > 0 ? field.trim() : undefined;
};

export {
  canonicalModelKey,
  matchBenchmarks,
  splitEffort,
} from "@t3tools/shared/modelBenchmarkMatch";
import { splitEffort } from "@t3tools/shared/modelBenchmarkMatch";

const BENCHLM_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  agentic: "Agentic",
  coding: "Coding",
  reasoning: "Reasoning",
  multimodalGrounded: "Multimodal",
  knowledge: "Knowledge",
  multilingual: "Multilingual",
  instructionFollowing: "Instruction following",
  math: "Math",
};

export interface BenchLmFeeds {
  readonly models: unknown;
  readonly pricing: unknown;
  readonly speed: unknown;
  readonly benchmarks: unknown;
}

/**
 * Reads BenchLM's static files: the published overall score, category scores
 * and every individual benchmark it carries (which include Arena, Vals and
 * LiveBench results), joined with its price and speed tables by model key.
 */
export function parseBenchLm(feeds: BenchLmFeeds): ParsedBenchmarkSource {
  const source = "benchLm" as const;
  const metrics = new Map<string, ModelBenchmarkMetric>();
  const addMetric = (metric: Omit<ModelBenchmarkMetric, "source">) => {
    if (!metrics.has(metric.key)) metrics.set(metric.key, { ...metric, source });
  };

  const benchmarkInfo = new Map<string, { label: string; category: string | undefined }>();
  for (const item of itemsOf(feeds.benchmarks, "items")) {
    const key = stringAt(item, "benchmarkKey");
    const label = stringAt(item, "name");
    if (key && label) benchmarkInfo.set(key, { label, category: stringAt(item, "category") });
  }

  const pricing = new Map(
    itemsOf(feeds.pricing, "items").flatMap((item) => {
      const key = stringAt(item, "canonicalModelKey");
      return key ? [[key, item] as const] : [];
    }),
  );
  const speed = new Map(
    itemsOf(feeds.speed, "items").flatMap((item) => {
      const key = stringAt(item, "canonicalModelKey");
      return key ? [[key, item] as const] : [];
    }),
  );

  const entries: ModelBenchmarkEntry[] = [];
  for (const model of itemsOf(feeds.models, "items")) {
    const key = stringAt(model, "canonicalModelKey") ?? stringAt(model, "slug");
    const name = stringAt(model, "model");
    if (!key || !name) continue;
    const values: Record<string, number> = {};

    const overall = numberAt(model, "displayScore");
    if (overall !== undefined) {
      values["benchLm:overall"] = overall;
      addMetric({
        key: "benchLm:overall",
        label: "BenchLM overall",
        kind: "score",
        unit: "score",
        higherIsBetter: true,
      });
    }
    const categories = recordAt(recordAt(model, "scores"), "displayCategoryScores") ?? {};
    for (const category of Object.keys(categories)) {
      const value = numberAt(categories, category);
      if (value === undefined) continue;
      const metricKey = `benchLm:category:${category}`;
      values[metricKey] = value;
      addMetric({
        key: metricKey,
        label: BENCHLM_CATEGORY_LABELS[category] ?? category,
        kind: "score",
        unit: "score",
        higherIsBetter: true,
        category,
      });
    }
    const benchmarks = recordAt(model, "benchmarks") ?? {};
    for (const category of Object.keys(benchmarks)) {
      const group = recordAt(benchmarks, category) ?? {};
      for (const benchmarkKey of Object.keys(group)) {
        const value = numberAt(group, benchmarkKey);
        // Only benchmarks BenchLM describes: undescribed keys are helper fields.
        const info = benchmarkInfo.get(benchmarkKey);
        if (value === undefined || !info) continue;
        const metricKey = `benchLm:benchmark:${benchmarkKey}`;
        values[metricKey] = value;
        addMetric({
          key: metricKey,
          label: info.label,
          kind: "score",
          unit: "score",
          higherIsBetter: true,
          category: info.category ?? category,
        });
      }
    }

    const price = pricing.get(key);
    const inputPrice = numberAt(price, "inputPrice");
    const outputPrice = numberAt(price, "outputPrice");
    if (inputPrice !== undefined) {
      values["benchLm:price:input"] = inputPrice;
      addMetric({
        key: "benchLm:price:input",
        label: "Input price",
        kind: "price",
        unit: "usd_per_mtok",
        higherIsBetter: false,
      });
    }
    if (outputPrice !== undefined) {
      values["benchLm:price:output"] = outputPrice;
      addMetric({
        key: "benchLm:price:output",
        label: "Output price",
        kind: "price",
        unit: "usd_per_mtok",
        higherIsBetter: false,
      });
    }
    const run = speed.get(key);
    const tokensPerSecond = numberAt(run, "tokensPerSecond");
    const ttft = numberAt(run, "ttft");
    if (tokensPerSecond !== undefined) {
      values["benchLm:speed"] = tokensPerSecond;
      addMetric({
        key: "benchLm:speed",
        label: "Output speed",
        kind: "speed",
        unit: "tokens_per_second",
        higherIsBetter: true,
      });
    }
    if (ttft !== undefined) {
      values["benchLm:ttft"] = ttft;
      addMetric({
        key: "benchLm:ttft",
        label: "Time to first token",
        kind: "latency",
        unit: "seconds",
        higherIsBetter: false,
      });
    }

    // BenchLM lists some effort variants with no numbers yet; they would hide the measured default.
    if (Object.keys(values).length === 0) continue;
    const { effort } = splitEffort(name);
    entries.push({
      source,
      sourceModelKey: key,
      name,
      ...(stringAt(model, "creator") ? { creator: stringAt(model, "creator") } : {}),
      ...(effort ? { effort } : {}),
      values,
      ...(stringAt(model, "url") ? { url: stringAt(model, "url") } : {}),
    });
  }
  return { metrics: [...metrics.values()], entries };
}

const AA_EFFORT_WORD = /\b(minimal|low|medium|high|xhigh|ultra|max)\b/i;

/** First finite number among `record`'s fields whose name passes `test`. */
const numberWhere = (record: UnknownRecord | undefined, test: (name: string) => boolean) => {
  if (!record) return undefined;
  for (const name of Object.keys(record)) {
    const value = numberAt(record, name);
    if (value !== undefined && test(name)) return value;
  }
  return undefined;
};

/**
 * "Claude Sonnet 5.5 (Max, Default Fallback)" -> base "Claude Sonnet 5.5", effort "max".
 * Names with no effort word, such as "(Non-reasoning)", have no effort.
 */
export function splitAaName(name: string): { readonly base: string; readonly effort?: string } {
  const open = name.indexOf("(");
  if (open < 0) return { base: name.trim() };
  const effort = AA_EFFORT_WORD.exec(name.slice(open))?.[1]?.toLowerCase();
  return { base: name.slice(0, open).trim(), ...(effort ? { effort } : {}) };
}

const AA_METRICS: ReadonlyArray<Omit<ModelBenchmarkMetric, "source">> = [
  {
    key: "aa:index",
    label: "Intelligence Index",
    kind: "score",
    unit: "score",
    higherIsBetter: true,
  },
  {
    key: "aa:coding",
    label: "Coding Index",
    kind: "score",
    unit: "score",
    higherIsBetter: true,
    category: "coding",
  },
  {
    key: "aa:agentic",
    label: "Agentic Index",
    kind: "score",
    unit: "score",
    higherIsBetter: true,
    category: "agentic",
  },
  {
    key: "aa:speed",
    label: "Output speed",
    kind: "speed",
    unit: "tokens_per_second",
    higherIsBetter: true,
  },
  {
    key: "aa:ttft",
    label: "Time to first token",
    kind: "latency",
    unit: "seconds",
    higherIsBetter: false,
  },
  {
    key: "aa:first-answer",
    label: "First answer",
    kind: "latency",
    unit: "seconds",
    higherIsBetter: false,
  },
  {
    key: "aa:price:input",
    label: "Input price",
    kind: "price",
    unit: "usd_per_mtok",
    higherIsBetter: false,
  },
  {
    key: "aa:price:output",
    label: "Output price",
    kind: "price",
    unit: "usd_per_mtok",
    higherIsBetter: false,
  },
  {
    key: "aa:cost-per-task",
    label: "Cost per task",
    kind: "price",
    unit: "usd",
    higherIsBetter: false,
  },
];

/**
 * Reads pages of Artificial Analysis's free language-model list. Each effort is
 * its own row there, so an entry here carries one effort's measured numbers.
 * Field names are matched loosely: a renamed field becomes a missing value.
 */
export function parseArtificialAnalysis(pages: ReadonlyArray<unknown>): ParsedBenchmarkSource {
  const entries: ModelBenchmarkEntry[] = [];
  const used = new Set<string>();
  for (const page of pages) {
    for (const model of itemsOf(page, "data")) {
      const name = stringAt(model, "name");
      const slug = stringAt(model, "slug");
      if (!name || !slug) continue;
      const evaluations = recordAt(model, "evaluations");
      const performance = recordAt(model, "performance");
      const performanceV3 = recordAt(model, "performance_v3");
      // `performance` returns null from 2026-12-10 and the v3 means replace it, so v3 goes first.
      const perf = (test: (name: string) => boolean) =>
        numberWhere(performanceV3, test) ?? numberWhere(performance, test);
      const pricing = recordAt(model, "pricing");
      const cost = recordAt(
        recordAt(model, "artificial_analysis_intelligence_index_cost"),
        "cost_per_task",
      );
      const found: Record<string, number | undefined> = {
        "aa:index": numberWhere(evaluations, (n) => n.endsWith("intelligence_index")),
        "aa:coding": numberWhere(evaluations, (n) => n.endsWith("coding_index")),
        "aa:agentic": numberWhere(evaluations, (n) => n.endsWith("agentic_index")),
        "aa:speed": perf((n) => /tokens_per_second/.test(n)),
        "aa:ttft": perf((n) => /time_to_first_token/.test(n) && !/answer/.test(n)),
        "aa:first-answer": perf((n) => /time_to_first_answer_token/.test(n)),
        "aa:price:input": numberWhere(pricing, (n) => /input/.test(n) && !/cache/.test(n)),
        "aa:price:output": numberWhere(pricing, (n) => /output/.test(n)),
        "aa:cost-per-task": numberWhere(cost, (n) => /total/.test(n)),
      };
      const values: Record<string, number> = {};
      for (const [key, value] of Object.entries(found)) {
        if (value === undefined) continue;
        values[key] = value;
        used.add(key);
      }
      if (Object.keys(values).length === 0) continue;
      const { base, effort } = splitAaName(name);
      entries.push({
        source: "artificialAnalysis",
        sourceModelKey: slug,
        name: effort ? `${base} (${effort})` : base,
        ...(stringAt(recordAt(model, "model_creator"), "name")
          ? { creator: stringAt(recordAt(model, "model_creator"), "name") }
          : {}),
        ...(effort ? { effort } : {}),
        values,
      });
    }
  }
  return {
    metrics: AA_METRICS.filter((metric) => used.has(metric.key)).map((metric) => ({
      ...metric,
      source: "artificialAnalysis" as const,
    })),
    entries,
  };
}
