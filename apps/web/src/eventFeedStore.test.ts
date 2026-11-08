import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useEventFeedStore } from "./eventFeedStore";

describe("event feed store", () => {
  it("does not persist or notify mark subscribers when only feed membership changes", () => {
    const storage = useEventFeedStore.persist.getOptions().storage!;
    const write = vi.spyOn(storage, "setItem");
    const notify = vi.fn();
    const unsubscribe = useEventFeedStore.subscribe(notify);
    try {
      useEventFeedStore.getState().setFeedIds("probe", ["evt_1"]);
      useEventFeedStore.getState().setFeedIds("probe", null);
      expect(write).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
      write.mockRestore();
    }
  });
  beforeEach(() => {
    useEventFeedStore.setState({ marks: {}, typeRules: {} });
    for (const key of ["one", "two", "probe"]) useEventFeedStore.getState().setFeedIds(key, null);
  });

  it("keys read and dismissed state by event id", () => {
    const store = useEventFeedStore.getState();
    store.markRead(["evt_A"]);
    store.dismiss("evt_B");
    expect(useEventFeedStore.getState().marks).toEqual({
      evt_A: { read: true },
      evt_B: { read: true, dismissed: true },
    });
  });

  it("drops the oldest ids past 2000 marks", () => {
    const ids = Array.from({ length: 2001 }, (_, i) => `evt_${String(i).padStart(5, "0")}`);
    useEventFeedStore.getState().markRead(ids);
    const marks = useEventFeedStore.getState().marks;
    expect(Object.keys(marks)).toHaveLength(2000);
    expect(marks.evt_00000).toBeUndefined();
  });

  it("sets and clears a rule per type", () => {
    useEventFeedStore.getState().setTypeRule("script.failed", "inbox");
    useEventFeedStore.getState().setTypeRule("task.worked", "off");
    expect(useEventFeedStore.getState().typeRules).toEqual({
      "script.failed": "inbox",
      "task.worked": "off",
    });
    useEventFeedStore.getState().setTypeRule("script.failed", null);
    expect(useEventFeedStore.getState().typeRules).toEqual({ "task.worked": "off" });
  });

  it("marks all done, then Undo puts every mark back as it was", () => {
    const store = useEventFeedStore.getState();
    store.markRead(["evt_A"]);
    const before = { evt_A: { read: true } as const, evt_B: undefined };
    store.dismissAll(["evt_A", "evt_B"]);
    expect(useEventFeedStore.getState().marks.evt_B).toEqual({ read: true, dismissed: true });
    store.restoreMarks(before);
    expect(useEventFeedStore.getState().marks).toEqual({ evt_A: { read: true } });
  });

  it("moves version 1 muted types to Inbox only", () => {
    const migrate = useEventFeedStore.persist.getOptions().migrate!;
    expect(migrate({ marks: {}, mutedTypes: ["script.failed"] }, 1)).toEqual({
      marks: {},
      typeRules: { "script.failed": "inbox" },
    });
  });

  it("keeps marks in every active feed and drops them only after they leave", () => {
    const store = useEventFeedStore.getState();
    store.setFeedIds("one", ["evt_00000"]);
    store.setFeedIds("two", ["evt_00001"]);
    store.dismiss("evt_00000");
    store.markRead(Array.from({ length: 2002 }, (_, i) => `evt_${String(i).padStart(5, "0")}`));
    expect(useEventFeedStore.getState().marks.evt_00000?.dismissed).toBe(true);
    expect(useEventFeedStore.getState().marks.evt_00001?.read).toBe(true);
    expect(useEventFeedStore.getState().marks.evt_00002).toBeUndefined();
    store.setFeedIds("one", []);
    store.markRead(["evt_99999"]);
    expect(useEventFeedStore.getState().marks.evt_00000).toBeUndefined();
    expect(useEventFeedStore.getState().marks.evt_00001?.read).toBe(true);
    store.setFeedIds("two", null);
    store.markRead(["evt_99998"]);
    expect(useEventFeedStore.getState().marks.evt_00001).toBeUndefined();
  });

  it("never prunes a present mark even when active feeds exceed the mark budget", () => {
    const ids = Array.from({ length: 2001 }, (_, i) => `evt_${i}`);
    useEventFeedStore.getState().setFeedIds("one", ids);
    useEventFeedStore.getState().markRead(ids);
    expect(Object.keys(useEventFeedStore.getState().marks)).toHaveLength(2001);
  });
});
