import type {
  MarketingApprovalTicket,
  MarketingListResult,
  MarketingMetricSnapshot,
  MarketingPost,
} from "@t3tools/contracts";

/** Made-up data for tests and previews. Never real brands, posts or numbers. */
const agent = { kind: "agent", name: "fixture agent" } as const;
const hex = (n: number, length: number) => n.toString(16).padStart(length, "0");

export function fixturePost(n: number, overrides: Partial<MarketingPost> = {}): MarketingPost {
  const minute = String(n % 60).padStart(2, "0");
  return {
    v: 1,
    id: `post_2026-10_${hex(n, 12)}` as MarketingPost["id"],
    brand: (n % 2 === 0 ? "acme-games" : "pixel-pets") as MarketingPost["brand"],
    channel: n % 3 === 0 ? "discord" : "x",
    text: `Fixture post ${n}. Short and made up.`,
    status: "draft",
    createdAt: `2026-10-20T10:${minute}:00Z`,
    updatedAt: `2026-10-20T10:${minute}:00Z`,
    author: agent,
    ...overrides,
  };
}

function fixtureTicket(
  post: MarketingPost,
  n: number,
  overrides: Partial<MarketingApprovalTicket> = {},
): MarketingApprovalTicket {
  return {
    v: 1,
    id: `apr_${hex(n, 12)}` as MarketingApprovalTicket["id"],
    postId: post.id,
    act: "publish",
    contentHash: hex(n, 64),
    costEstimateUsd: 0,
    status: "pending",
    requestedAt: `2026-10-21T09:${String(n % 60).padStart(2, "0")}:00Z`,
    requestedBy: agent,
    ...overrides,
  };
}

function fixtureMetric(
  channel: MarketingMetricSnapshot["channel"],
  externalId: string,
  at: string,
  impressions: number,
): MarketingMetricSnapshot {
  return { v: 1, channel, externalId, at, source: "fixture", impressions, likes: 3, replies: 1 };
}

/** `drafts` drafts that ask for approval, and `posted` posted items that have metrics. */
export function fixtureList(drafts = 3, posted = 2): MarketingListResult {
  const draftPosts = Array.from({ length: drafts }, (_, i) => fixturePost(i + 1));
  const postedPosts = Array.from({ length: posted }, (_, i) =>
    fixturePost(1000 + i, { status: "posted", externalId: `ext-${i}` }),
  );
  return {
    brands: [
      { slug: "acme-games" as never, name: "Acme Games", spendCapUsd: 0 },
      { slug: "pixel-pets" as never, name: "Pixel Pets", spendCapUsd: 0 },
    ],
    queue: draftPosts.map((post, i) => ({ ticket: fixtureTicket(post, i + 1), post })),
    queueTotal: draftPosts.length,
    postsTotal: draftPosts.length + postedPosts.length,
    posts: [
      ...draftPosts.map((post) => ({ post, approval: "pending" as const })),
      ...postedPosts.map((post) => ({ post, approval: "approved" as const })),
    ],
    metrics: postedPosts.flatMap((post, i) => [
      fixtureMetric(post.channel, `ext-${i}`, "2026-10-21T00:00:00Z", 100 + i),
      fixtureMetric(post.channel, `ext-${i}`, "2026-10-22T00:00:00Z", 500 + i),
    ]),
    bad: [],
  };
}

export const EMPTY_LIST: MarketingListResult = {
  brands: [],
  queue: [],
  queueTotal: 0,
  posts: [],
  postsTotal: 0,
  metrics: [],
  bad: [],
};
