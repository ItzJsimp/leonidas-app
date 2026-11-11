import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const fetchReleaseHistory = vi.hoisted(() => vi.fn());
vi.mock("./releaseHistory", () => ({ fetchReleaseHistory }));
vi.mock("./ReleaseHistoryDialog", () => ({ openReleaseHistoryDialog: vi.fn() }));

import { loadUpdateReleases } from "./UpdateDetailsDialog";

const entry = (version: string) => ({ version, notes: [`Fixed ${version}.`] });
const signal = new AbortController().signal;

describe("loadUpdateReleases", () => {
  beforeEach(() => fetchReleaseHistory.mockReset());

  it("returns the releases after `since` up to `through`, newest first", async () => {
    fetchReleaseHistory.mockResolvedValueOnce({
      entries: ["0.124.101", "0.124.100", "0.124.99", "0.124.98", "0.124.95"].map(entry),
      hasMore: true,
    });
    const found = await loadUpdateReleases({ since: "0.124.95", through: "0.124.100" }, signal);
    expect(found.map((release) => release.version)).toEqual(["0.124.100", "0.124.99", "0.124.98"]);
    // It stopped at `since`, so it did not ask for another page.
    expect(fetchReleaseHistory).toHaveBeenCalledOnce();
  });

  it("reads the next page when the range is longer than one page", async () => {
    fetchReleaseHistory
      .mockResolvedValueOnce({ entries: ["0.124.100", "0.124.99"].map(entry), hasMore: true })
      .mockResolvedValueOnce({ entries: ["0.124.98", "0.124.95"].map(entry), hasMore: false });
    const found = await loadUpdateReleases({ since: "0.124.95", through: "0.124.100" }, signal);
    expect(found.map((release) => release.version)).toEqual(["0.124.100", "0.124.99", "0.124.98"]);
    expect(fetchReleaseHistory).toHaveBeenCalledTimes(2);
  });

  it("shows only the newest five when there is no `since`", async () => {
    fetchReleaseHistory.mockResolvedValueOnce({
      entries: Array.from({ length: 10 }, (_, index) => entry(`0.124.${100 - index}`)),
      hasMore: true,
    });
    const found = await loadUpdateReleases({ since: null, through: "0.124.100" }, signal);
    expect(found).toHaveLength(5);
    expect(found[0]?.version).toBe("0.124.100");
  });
});
