import { describe, expect, it } from "vite-plus/test";
import {
  redirectPendingApprovals,
  type ApprovalRedirectInput,
  type ApprovalRedirectPorts,
} from "./approvalRedirect";

type Approval = { readonly requestId: string };

const input = (overrides: Partial<ApprovalRedirectInput> = {}): ApprovalRedirectInput => ({
  shownApprovalIds: ["a1"],
  promptAtSend: "go",
  promptForSend: "go",
  attachmentIdsAtSend: [],
  annotationImageId: undefined,
  ...overrides,
});

function fakePorts(overrides: Partial<ApprovalRedirectPorts<Approval>> = {}) {
  const calls: string[] = [];
  const draft = {};
  const ports: ApprovalRedirectPorts<Approval> = {
    isSendingChatActive: () => true,
    pendingApprovals: () => [{ requestId: "a1" }],
    respondingRequestIds: () => [],
    decline: async () => {
      calls.push("decline");
      return true;
    },
    livePrompt: () => "go",
    hasPendingAttachments: () => false,
    liveAttachmentIds: () => [],
    readDraft: () => draft,
    release: () => calls.push("release"),
    toast: (title) => calls.push(`toast:${title}`),
    ...overrides,
  };
  return { ports, calls };
}

describe("redirectPendingApprovals", () => {
  it("proceeds without a decline when no shown approval is pending", async () => {
    const { ports, calls } = fakePorts({ pendingApprovals: () => [] });
    expect(await redirectPendingApprovals(ports, input())).toBe("proceed");
    expect(calls).toEqual([]);
  });

  it("leaves another thread's approvals alone", async () => {
    const { ports, calls } = fakePorts({ isSendingChatActive: () => false });
    expect(await redirectPendingApprovals(ports, input())).toBe("proceed");
    expect(calls).toEqual([]);
  });

  it("declines, then proceeds when nothing changed", async () => {
    const { ports, calls } = fakePorts();
    expect(await redirectPendingApprovals(ports, input())).toBe("proceed");
    expect(calls).toEqual(["decline"]);
  });

  it("stops without declining when the draft changed before the decline", async () => {
    const { ports, calls } = fakePorts({ livePrompt: () => "edited" });
    expect(await redirectPendingApprovals(ports, input())).toBe("stopped");
    expect(calls).toEqual(["release", "toast:Your message changed, so it wasn't sent."]);
  });

  it("stops when an approval is already being answered", async () => {
    const { ports, calls } = fakePorts({ respondingRequestIds: () => ["a1"] });
    expect(await redirectPendingApprovals(ports, input())).toBe("stopped");
    expect(calls).toEqual([
      "release",
      "toast:An approval is already being answered, so your message wasn't sent.",
    ]);
  });

  it("stops quietly when the decline fails", async () => {
    const { ports, calls } = fakePorts({ decline: async () => false });
    expect(await redirectPendingApprovals(ports, input())).toBe("stopped");
    expect(calls).toEqual(["release"]);
  });

  it("stops when a new approval arrives during the decline", async () => {
    let declined = false;
    const { ports, calls } = fakePorts({
      pendingApprovals: () =>
        declined ? [{ requestId: "a1" }, { requestId: "a2" }] : [{ requestId: "a1" }],
      decline: async () => {
        declined = true;
        return true;
      },
    });
    expect(await redirectPendingApprovals(ports, input())).toBe("stopped");
    expect(calls).toEqual([
      "release",
      "toast:Another approval arrived, so your message wasn't sent.",
    ]);
  });

  it("says the approval was declined when the draft changes during the decline", async () => {
    let prompt = "go";
    const { ports, calls } = fakePorts({
      livePrompt: () => prompt,
      decline: async () => {
        prompt = "edited";
        return true;
      },
    });
    expect(await redirectPendingApprovals(ports, input())).toBe("stopped");
    expect(calls).toEqual([
      "release",
      "toast:Approval declined. Your message changed, so it wasn't sent.",
    ]);
  });

  it("accepts a draft that lacks only the annotation image", async () => {
    const { ports } = fakePorts({ liveAttachmentIds: () => ["file"] });
    const result = await redirectPendingApprovals(
      ports,
      input({ attachmentIdsAtSend: ["file", "shot"], annotationImageId: "shot" }),
    );
    expect(result).toBe("proceed");
  });

  it("treats a paste still landing as a changed draft", async () => {
    const { ports } = fakePorts({ hasPendingAttachments: () => true });
    expect(await redirectPendingApprovals(ports, input())).toBe("stopped");
  });
});
