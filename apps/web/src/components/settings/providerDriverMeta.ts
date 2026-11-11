import {
  AntigravitySettings,
  ClaudeSettings,
  CodexSettings,
  OllamaSettings,
  OpenRouterSettings,
  ProviderDriverKind,
} from "@t3tools/contracts";
import { acpRegistryClient } from "@t3tools/provider-acp-registry/client";
import { makeProviderClientRegistry } from "@t3tools/provider-core/client";
import { cursorClient } from "@t3tools/provider-cursor/client";
import { grokClient } from "@t3tools/provider-grok/client";
import { museClient } from "@t3tools/provider-muse/client";
import { openCodeClient } from "@t3tools/provider-opencode/client";
import { piClient } from "@t3tools/provider-pi/client";

export const providerClients = makeProviderClientRegistry([
  {
    driverKind: ProviderDriverKind.make("codex"),
    label: "Codex",
    settingsSchema: CodexSettings,
  },
  {
    driverKind: ProviderDriverKind.make("claudeAgent"),
    label: "Claude",
    settingsSchema: ClaudeSettings,
  },
  {
    driverKind: ProviderDriverKind.make("openrouter"),
    label: "OpenRouter",
    settingsSchema: OpenRouterSettings,
    icon: {
      viewBox: "0 0 24 24",
      fill: { light: "#6366F1", dark: "#818CF8" },
      paths: [
        {
          d: "M16.778 1.844v1.919q-.569-.026-1.138-.032-.708-.008-1.415.037c-1.93.126-4.023.728-6.149 2.237-2.911 2.066-2.731 1.95-4.14 2.75-.396.223-1.342.574-2.185.798-.841.225-1.753.333-1.751.333v4.229s.768.108 1.61.333c.842.224 1.789.575 2.185.799 1.41.798 1.228.683 4.14 2.75 2.126 1.509 4.22 2.11 6.148 2.236.88.058 1.716.041 2.555.005v1.918l7.222-4.168-7.222-4.17v2.176c-.86.038-1.611.065-2.278.021-1.364-.09-2.417-.357-3.979-1.465-2.244-1.593-2.866-2.027-3.68-2.508.889-.518 1.449-.906 3.822-2.59 1.56-1.109 2.614-1.377 3.978-1.466.667-.044 1.418-.017 2.278.02v2.176L24 6.014Z",
        },
      ],
    },
  },
  {
    driverKind: ProviderDriverKind.make("ollama"),
    label: "Ollama (local)",
    settingsSchema: OllamaSettings,
    icon: {
      viewBox: "0 0 24 24",
      fill: { light: "#111827", dark: "#E5E7EB" },
      paths: [
        {
          d: "M12 3a5 5 0 0 0-5 5v2.2A6 6 0 0 0 5 14.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4.5a6 6 0 0 0-2-4.3V8a5 5 0 0 0-5-5Zm-1.8 6.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm3.6 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM12 13c1.3 0 2.2.7 2.2 1.5S13.3 16 12 16s-2.2-.7-2.2-1.5S10.7 13 12 13Z",
        },
      ],
    },
  },
  cursorClient,
  grokClient,
  openCodeClient,
  {
    driverKind: ProviderDriverKind.make("antigravity"),
    label: "Antigravity",
    settingsSchema: AntigravitySettings,
  },
  museClient,
  piClient,
  acpRegistryClient,
]);
