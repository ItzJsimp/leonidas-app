// @effect-diagnostics nodeBuiltinImport:off - the symlink test makes a real link with node:fs.
import { TradingLibraryIndexResult, TradingStateError } from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import * as NodeFS from "node:fs";

import {
  listResources,
  readLibraryIndex,
  readLibraryPage,
  saveResource,
  searchLibrary,
} from "./tradingLibrary.ts";

// Made-up course, pages and cards. The real course and its numbers stay in the private pack.
const MANIFEST_HEADER =
  "chapter,chapter_title,lesson,title,duration,lesson_id,tier,transcript,status,keywords,url";
/** The second lesson's transcript climbs out of the pack into the secret folder. */
const manifest = (secretFolder: string) =>
  [
    MANIFEST_HEADER,
    '1,"Chapter A",1,"Opening range",01:00,lesn_one,1,transcripts/one.md,ok,vwap;gap,https://example.com/one',
    `1,"Chapter A",2,"Second lesson",02:00,lesn_two,1,../../${secretFolder}/secret.md,ok,,`,
    "2,Chapter B,1,Third lesson,03:00,lesn_three,1,transcripts/missing.md,ok,,",
    "",
  ].join("\n");
// Far after any test run, so this firm page is never stale.
const FRESH = "2099-06-01";

const decodeIndex = Schema.decodeUnknownEffect(TradingLibraryIndexResult);

/** A workspace root and a pack folder. `pack` false leaves the workspace without a linked pack. */
const setup = (options: { readonly pack: boolean; readonly bigPage?: boolean }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "leonidas-trading-library-" });
    const packFolder = yield* fs.makeTempDirectoryScoped({ prefix: "leonidas-library-pack-" });
    const secretDir = yield* fs.makeTempDirectoryScoped({ prefix: "leonidas-library-secret-" });
    yield* fs.writeFileString(path.join(secretDir, "secret.md"), "SECRET TEXT outside the pack");
    yield* fs.writeFileString(
      path.join(root, "workspace.json"),
      JSON.stringify({
        id: "trading-test",
        name: "Trading test",
        type: "trading",
        schemaVersion: 1,
        ...(options.pack ? { crewPack: packFolder } : {}),
      }),
    );
    yield* fs.makeDirectory(path.join(root, "trading"));
    if (!options.pack) return { root, packFolder, secretDir };
    yield* fs.writeFileString(
      path.join(packFolder, "trading-pack.json"),
      JSON.stringify({
        version: 1,
        firms: [],
        setups: [],
        riskStates: [],
        sessions: { timeZone: "America/New_York", list: [] },
        library: {
          manifest: "course/manifest.csv",
          knowledge: "knowledge/",
          drills: "drills/",
          community: "community/",
          firms: "firms/",
        },
      }),
    );
    const dirs = ["course/transcripts", "knowledge", "community", "firms", "drills"];
    for (const dir of dirs)
      yield* fs.makeDirectory(path.join(packFolder, dir), { recursive: true });
    const write = (name: string, text: string) =>
      fs.writeFileString(path.join(packFolder, name), text);
    yield* write("course/manifest.csv", manifest(path.basename(secretDir)));
    yield* write("course/transcripts/one.md", "Opening range text with VWAP planted.");
    yield* write(
      "knowledge/risk-management.md",
      "# Risk management\n\nKeep a stop. VWAP is not a stop.",
    );
    yield* write("community/morning.md", "# Morning notes\n\nSession text.");
    yield* write("firms/alpha.md", "# Firm Alpha\n\n- **Fetched:** 2026-01-01. Fetch again.\n");
    yield* write("firms/beta.md", `# Firm Beta\n\n- **Fetched:** ${FRESH}. Fresh.\n`);
    yield* write(
      "drills/cards.csv",
      'front,back,citation\n"What is VWAP?","Volume weighted average price.","[JJ]"\n',
    );
    yield* write(
      "drills/quiz.json",
      JSON.stringify([
        {
          id: "Q-01",
          topic: "Foundations",
          level: "Apply",
          source: "Foundations: a check?",
          prompt: "Which check first?",
          correct: 0,
          options: [
            { text: "Read the sample.", why: "" },
            { text: "Count trades.", why: "Too early." },
          ],
        },
      ]),
    );
    if (options.bigPage) {
      yield* write("knowledge/big.md", `# Big\n\n${"x".repeat(1_100_000)}`);
    }
    return { root, packFolder, secretDir };
  });

it.layer(NodeServices.layer)("tradingLibrary", (it) => {
  it.effect("reports none when no pack is linked", () =>
    Effect.gen(function* () {
      const { root } = yield* setup({ pack: false });
      const index = yield* readLibraryIndex(root);
      assert.strictEqual(index.status, "none");
      assert.deepStrictEqual(index.chapters, []);
    }),
  );

  it.effect("reads chapters, pages, firms, cards and quiz and matches the RPC schema", () =>
    Effect.gen(function* () {
      // The test clock starts at 0. Set it so the firm pages age as they would on a real day.
      yield* TestClock.setTime(Date.parse("2026-11-12T00:00:00Z"));
      const { root } = yield* setup({ pack: true });
      const index = yield* readLibraryIndex(root);
      assert.strictEqual(index.status, "ready");
      assert.deepStrictEqual(
        index.chapters.map((chapter) => chapter.lessons.length),
        [2, 1],
      );
      const [first, second] = index.chapters[0]?.lessons ?? [];
      assert.deepStrictEqual(first?.keywords, ["vwap", "gap"]);
      assert.strictEqual(first?.url, "https://example.com/one");
      assert.isTrue(first?.hasTranscript ?? false);
      assert.isFalse(second?.hasTranscript ?? true);
      assert.deepStrictEqual(
        index.knowledge.map((page) => page.id),
        ["risk-management"],
      );
      assert.deepStrictEqual(
        index.firms.map((firm) => [firm.id, firm.fetchDate, firm.stale]),
        [
          ["alpha", "2026-01-01", true],
          ["beta", FRESH, false],
        ],
      );
      assert.strictEqual(index.cards.length, 1);
      assert.strictEqual(index.quiz[0]?.correct, 0);
      yield* decodeIndex(JSON.parse(JSON.stringify(index)));
    }),
  );

  it.effect("never reads a transcript path that leaves the pack folder", () =>
    Effect.gen(function* () {
      const { root } = yield* setup({ pack: true });
      // The escaping cell points at a real file outside the pack. It must not be read.
      const page = yield* readLibraryPage(root, { kind: "lesson", id: "lesson-2" });
      assert.strictEqual(page.text, "");
      const hits = yield* searchLibrary(root, { query: "SECRET" });
      assert.deepStrictEqual(hits.hits, []);
    }),
  );

  it.effect("skips a page over 1 MB", () =>
    Effect.gen(function* () {
      const { root } = yield* setup({ pack: true, bigPage: true });
      const index = yield* readLibraryIndex(root);
      assert.isFalse(index.knowledge.some((page) => page.id === "big"));
    }),
  );

  it.effect("skips a symlink that points outside the pack", () =>
    Effect.gen(function* () {
      const { root, packFolder, secretDir } = yield* setup({ pack: true });
      const link = `${packFolder}/knowledge/escape.md`;
      try {
        NodeFS.symlinkSync(`${secretDir}/secret.md`, link, "file");
      } catch (error) {
        // Windows needs a right to make symlinks. Without it this check cannot run here.
        yield* Effect.logInfo(`skipped symlink test: ${(error as Error).message}`);
        return;
      }
      const index = yield* readLibraryIndex(root);
      assert.isFalse(index.knowledge.some((page) => page.id === "escape"));
      const exit = yield* Effect.exit(readLibraryPage(root, { kind: "knowledge", id: "escape" }));
      assert.isTrue(Exit.isFailure(exit));
    }),
  );

  it.effect(
    "reports a pack with more than 5,000 files as invalid",
    () =>
      Effect.gen(function* () {
        const { root, packFolder } = yield* setup({ pack: true });
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const names = Array.from({ length: 5_000 }, (_, i) => `extra-${i}.md`);
        yield* Effect.forEach(
          names,
          (name) => fs.writeFileString(path.join(packFolder, "knowledge", name), "# Extra\n"),
          { concurrency: 64, discard: true },
        );
        const index = yield* readLibraryIndex(root);
        assert.strictEqual(index.status, "invalid");
        assert.include(index.reason ?? "", "5,000");
      }),
    60_000,
  );

  it.effect("returns the text of a lesson, a knowledge page and a firm page", () =>
    Effect.gen(function* () {
      const { root } = yield* setup({ pack: true });
      const lesson = yield* readLibraryPage(root, { kind: "lesson", id: "lesson-1" });
      assert.include(lesson.text, "Opening range text");
      const knowledge = yield* readLibraryPage(root, { kind: "knowledge", id: "risk-management" });
      assert.strictEqual(knowledge.title, "Risk management");
      const firm = yield* readLibraryPage(root, { kind: "firm", id: "alpha" });
      assert.include(firm.text, "Fetched");
      assert.isFalse(firm.truncated);
    }),
  );

  it.effect("a missing page is a page_not_found error", () =>
    Effect.gen(function* () {
      const { root } = yield* setup({ pack: true });
      const error = yield* Effect.flip(
        readLibraryPage(root, { kind: "knowledge", id: "no-such-page" }),
      );
      assert.instanceOf(error, TradingStateError);
      assert.strictEqual(error.reason, "page_not_found");
    }),
  );

  it.effect("search finds the planted term in lessons, knowledge and cards", () =>
    Effect.gen(function* () {
      const { root } = yield* setup({ pack: true });
      const result = yield* searchLibrary(root, { query: "vwap" });
      const kinds = result.hits.map((hit) => hit.kind).toSorted();
      assert.deepStrictEqual(kinds, ["card", "knowledge", "lesson"]);
    }),
  );

  it.effect("saves a Crew resource to the outbox and a private one to resources", () =>
    Effect.gen(function* () {
      const { root } = yield* setup({ pack: true });
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const crew = yield* saveResource(root, {
        kind: "link",
        title: "Good read",
        url: "https://example.com/read",
        private: false,
      });
      const privateNote = yield* saveResource(root, {
        kind: "note",
        title: "Mine only",
        text: "A note.",
        private: true,
      });
      const outbox = path.join(root, "trading", "crew-outbox", `${crew.id}.md`);
      const resources = path.join(root, "trading", "resources", `${privateNote.id}.md`);
      assert.isTrue(yield* fs.exists(outbox));
      assert.isTrue(yield* fs.exists(resources));
      assert.isFalse(yield* fs.exists(path.join(root, "trading", "resources", `${crew.id}.md`)));
      assert.include(yield* fs.readFileString(outbox), '"https://example.com/read"');
      const list = yield* listResources(root);
      assert.deepStrictEqual(list.resources.map((item) => [item.title, item.private]).toSorted(), [
        ["Good read", false],
        ["Mine only", true],
      ]);
    }),
  );

  it.effect("rejects a bad url, an empty title and an over-long title", () =>
    Effect.gen(function* () {
      const { root } = yield* setup({ pack: true });
      const badUrl = yield* Effect.flip(
        saveResource(root, { kind: "link", title: "x", url: "javascript:alert(1)", private: true }),
      );
      assert.strictEqual(badUrl.reason, "invalid_resource");
      const blank = yield* Effect.flip(
        saveResource(root, { kind: "note", title: "   ", private: true }),
      );
      assert.strictEqual(blank.reason, "invalid_resource");
      const long = yield* Effect.flip(
        saveResource(root, { kind: "note", title: "x".repeat(201), private: true }),
      );
      assert.strictEqual(long.reason, "invalid_resource");
    }),
  );

  it.effect("keeps a title with a line break intact in the saved file", () =>
    Effect.gen(function* () {
      const { root } = yield* setup({ pack: true });
      yield* saveResource(root, {
        kind: "note",
        title: 'Line one\nline "two"',
        private: true,
      });
      const list = yield* listResources(root);
      assert.strictEqual(list.resources[0]?.title, 'Line one\nline "two"');
    }),
  );
});
