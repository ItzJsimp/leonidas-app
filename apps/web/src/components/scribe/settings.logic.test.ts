import type { ScribeSettings } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  addBinding,
  bindingFromKey,
  bindingFromMouse,
  bindingKeys,
  checkGroqKey,
  clampMaxRecordSeconds,
  diffDraft,
  modelChoices,
  removeBinding,
  restartMessage,
  rewriteBindings,
  settingsErrorMessage,
  toDraft,
  validateBinding,
} from "./settings.logic";

const settings: ScribeSettings = {
  sections: {
    hotkeys: { hold: ["Ctrl + Shift + T"], toggle: ["Mouse5"], cancel: ["Escape"] },
    audio: { device: null, maxRecordSeconds: 600, minRecordMs: 250 },
    transcription: {
      privateMode: false,
      polishEnabled: true,
      polishInstructions: null,
      whisperModel: "whisper-large-v3-turbo",
      whisperModelBackup: "whisper-large-v3",
      polishModel: "qwen/qwen3.8-27b",
      backupPolishModel: "openai/gpt-oss-20b",
      groqKey: { set: true },
    },
    presets: {},
    hud: { enabled: true },
    features: {},
    goals: {},
  },
};

describe("diffDraft", () => {
  const saved = toDraft(settings);

  it("returns nothing when nothing changed", () => {
    expect(diffDraft(saved, structuredClone(saved))).toEqual([]);
  });

  it("returns one patch per changed section with only the changed keys", () => {
    const draft = structuredClone(saved);
    draft.audio.device = "USB Mic";
    draft.transcription.polishModel = "llama-3.3-70b-versatile";
    draft.hotkeys.hold = ["Ctrl + Alt + Y"];
    expect(diffDraft(saved, draft)).toEqual([
      { section: "hotkeys", values: { hold: ["Ctrl + Alt + Y"] } },
      { section: "audio", values: { device: "USB Mic" } },
      { section: "transcription", values: { polishModel: "llama-3.3-70b-versatile" } },
    ]);
  });

  it("never sends the Groq key and can set the instructions back to the default", () => {
    expect(toDraft(settings).transcription).not.toHaveProperty("groqKey");
    const draft = structuredClone(saved);
    draft.transcription.polishInstructions = "Be brief.";
    const back = structuredClone(draft);
    back.transcription.polishInstructions = null;
    expect(diffDraft(draft, back)).toEqual([
      { section: "transcription", values: { polishInstructions: null } },
    ]);
  });
});

describe("rewrite shortcut", () => {
  it("uses the engine default when the settings have no rewrite list", () => {
    expect(toDraft(settings).hotkeys.rewrite).toEqual(["Ctrl + Shift + A"]);
    const hotkeys = { ...settings.sections.hotkeys, rewrite: [] };
    expect(rewriteBindings(hotkeys)).toEqual([]);
    expect(rewriteBindings({ ...hotkeys, rewrite: ["F9", 3] } as never)).toEqual(["F9"]);
  });

  it("sends a changed rewrite list in the hotkeys patch", () => {
    const saved = toDraft(settings);
    const draft = structuredClone(saved);
    draft.hotkeys.rewrite = ["Ctrl + Alt + R"];
    expect(diffDraft(saved, draft)).toEqual([
      { section: "hotkeys", values: { rewrite: ["Ctrl + Alt + R"] } },
    ]);
  });

  it("splits a shortcut into key caps", () => {
    expect(bindingKeys("Ctrl + Shift + A")).toEqual(["Ctrl", "Shift", "A"]);
    expect(bindingKeys("Mouse5")).toEqual(["Mouse5"]);
  });
});

describe("validateBinding", () => {
  it("accepts what the engine parses", () => {
    for (const text of [
      "Ctrl + Shift + T",
      "ctrl+shift+space",
      "Ctrl + Win",
      "Mouse4",
      "Mouse5",
      "Middle",
      "Escape",
      "F8",
      "a",
      "9",
      "Enter",
      "Tab",
      "F24",
    ]) {
      expect(validateBinding(text), text).toBeNull();
    }
  });

  it("refuses what the engine refuses, with a plain reason", () => {
    for (const text of [
      "Ctrl + BadKey",
      "Ctrl++T",
      "T+Space",
      "F25",
      "F0",
      "Left Ctrl",
      "",
      "   ",
    ]) {
      expect(validateBinding(text), text).not.toBeNull();
    }
    expect(validateBinding("Ctrl + Shift")).toBe(
      "Add one key or mouse button, not only Ctrl, Shift, Alt or Win.",
    );
  });
});

describe("recording a binding", () => {
  const none = { ctrl: false, shift: false, alt: false, meta: false };

  it("names keys the way the engine reads them, modifiers first", () => {
    expect(bindingFromKey({ ...none, ctrl: true, shift: true, key: "t" })).toBe("Ctrl + Shift + T");
    expect(bindingFromKey({ ...none, alt: true, meta: true, key: " " })).toBe("Alt + Win + Space");
    expect(bindingFromKey({ ...none, key: "F8" })).toBe("F8");
    expect(bindingFromKey({ ...none, key: "Escape" })).toBe("Escape");
    expect(bindingFromKey({ ...none, key: "9" })).toBe("9");
  });

  it("waits for a real key and skips ones the engine cannot bind", () => {
    expect(bindingFromKey({ ...none, ctrl: true, key: "Control" })).toBeNull();
    expect(bindingFromKey({ ...none, key: "ArrowUp" })).toBeNull();
    expect(bindingFromKey({ ...none, key: "Dead" })).toBeNull();
  });

  it("maps the middle, back and forward mouse buttons", () => {
    expect(bindingFromMouse({ ...none, button: 1 })).toBe("Middle");
    expect(bindingFromMouse({ ...none, ctrl: true, button: 3 })).toBe("Ctrl + Mouse4");
    expect(bindingFromMouse({ ...none, button: 4 })).toBe("Mouse5");
    expect(bindingFromMouse({ ...none, button: 0 })).toBeNull();
    expect(bindingFromMouse({ ...none, button: 2 })).toBeNull();
  });
});

describe("addBinding and removeBinding", () => {
  it("adds a valid binding once, ignoring case and spacing", () => {
    const added = addBinding(["Mouse5"], " ctrl+shift+t ");
    expect(added).toEqual({ ok: true, list: ["Mouse5", "Ctrl + Shift + T"] });
    expect(addBinding(["Ctrl + Shift + T"], "ctrl+shift+t")).toEqual({
      ok: false,
      message: "That shortcut is already in the list.",
    });
    expect(addBinding([], "Ctrl + BadKey").ok).toBe(false);
  });

  it("removes one binding", () => {
    expect(removeBinding(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("numbers, models and keys", () => {
  it("keeps the recording length in the Qt range", () => {
    expect(clampMaxRecordSeconds(5)).toBe(15);
    expect(clampMaxRecordSeconds(10_000)).toBe(900);
    expect(clampMaxRecordSeconds(Number.NaN)).toBe(600);
    expect(clampMaxRecordSeconds(120.4)).toBe(120);
  });

  it("always lists the saved model, even when it is not a known one", () => {
    expect(
      modelChoices("whisper-large-v3-turbo", ["whisper-large-v3-turbo", "whisper-large-v3"]),
    ).toEqual(["whisper-large-v3-turbo", "whisper-large-v3"]);
    expect(modelChoices("custom-model", ["a"])).toEqual(["custom-model", "a"]);
  });

  it("checks a pasted Groq key before it leaves the page", () => {
    expect(checkGroqKey("  gsk_abc123  ")).toEqual({ ok: true, key: "gsk_abc123" });
    expect(checkGroqKey('"gsk_abc"')).toEqual({ ok: true, key: "gsk_abc" });
    expect(checkGroqKey("")).toEqual({ ok: false, message: "Paste your Groq key first." });
    expect(checkGroqKey("sk-other").ok).toBe(false);
    expect(checkGroqKey("gsk_a b").ok).toBe(false);
  });
});

describe("messages", () => {
  it("tells the user when a change waits for the engine to restart", () => {
    expect(restartMessage([false, false])).toBeNull();
    expect(restartMessage([false, true])).toBe(
      "Saved. Model and overlay changes apply the next time the Scribe engine starts.",
    );
  });

  it("names a rejected, failed or unreachable save", () => {
    expect(settingsErrorMessage("bad_request")).toContain("did not accept");
    expect(settingsErrorMessage("store_error")).toContain("could not save");
    expect(settingsErrorMessage("offline")).toBe("Scribe engine is not running.");
    expect(settingsErrorMessage(null)).toBe("Scribe could not do that. Try again.");
  });
});
