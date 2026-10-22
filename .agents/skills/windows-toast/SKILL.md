---
name: windows-toast
description: "Send native, interactive Windows Action Center toast notifications with audio presets, action buttons and text input routing. Use when a task needs a desktop alert or a reply prompt."
category: pc
type: skill
id: skill-windows-toast
title: "Windows Toast Notification Skill"
kind: procedure
load: on-demand
owner: shared
scope: structural
distribution: template
verified: 2026-09-23
related: ["ask-leonidas", "implement", "chat-sync", "telemetry-analyst"]
generated: false
---

# Windows Toast Notification Skill

Standardized, production-grade integration for native Windows 10/11 Action Center toast notifications across Leonidas AIOS. Provides zero-dependency WinRT XML dispatch, rich BurntToast cmdlets, non-disruptive audio profiles, and asynchronous two-way user interactivity via the `leonidas-toast://` protocol handler.

---

## 1. Capabilities & System Boundaries

### What Windows Toasts Can Do

- **Visual Presentation:** Multi-line bold titles, body text, hero images, app logo overrides, attribution text, and progress bars.
- **Interactive Control Plane:** Single-line text input fields (`<input type="text">`), dropdown pick lists (`<input type="selection">`), and up to 5 clickable action buttons.
- **Asynchronous Protocol Dispatch:** Input substitutions (`{replyText}`) passed directly to custom URL schemes (`leonidas-toast://`) without keeping background processes resident in memory.
- **Persistence & History:** Notifications remain in the Windows Action Center until explicitly acted upon, swiped away, or dismissed.
- **Sleek Audio Feedback:** Plays calibrated single-shot Windows notification WAVs without repetitive alarms.

### What Windows Toasts Cannot Do

- **Multi-line Rich Text Inputs:** Windows Action Center input boxes are strictly single-line text fields; complex multi-paragraph drafting requires opening an editor.
- **Arbitrary In-Memory Callbacks:** `Register-ObjectEvent` on WinRT objects terminates as soon as the triggering PowerShell process exits. True asynchronous responses MUST use protocol activation (`leonidas-toast://`).
- **Focus Assist Bypass:** If Windows Focus Assist (Do Not Disturb) or Priority Only is active, toasts route silently to the Action Center tray without a popup banner unless marked as system priority.
- **Dynamic In-Place Updates (without tag/group keys):** Modifying a toast already on screen requires an explicit `NotificationData` sequence update with a shared `Tag` and `Group`.

---

## 2. Autonomous Trigger Gates (AI Notification Policy)

To eliminate notification fatigue, autonomous AI agents MUST adhere strictly to these three activation gates:

| Gate                                 | Condition                                                                | Sound Profile | Behavior                                                       |
| ------------------------------------ | ------------------------------------------------------------------------ | ------------- | -------------------------------------------------------------- |
| **1. Long-Running Work (>120-240s)** | Background task, test suite, or model operation exceeding 2 to 4 minutes | `Sleek`       | Fires completion notice with summary and optional input field. |
| **2. Critical Failure**              | Substrate audit failure, broken pre-commit hook, or crashed service      | `Warning`     | Sticky notification requiring user attention or review.        |
| **3. Explicit Operator Directive**   | the user explicitly requests a timer, alert, or desktop nudge            | Context-aware | Fires precisely when scheduled or requested.                   |

**Fatigue Suppression Guardrail:** NEVER emit toasts for routine sub-minute tool calls, standard git commits, or mid-conversation chat replies.

---

## 3. Audio Profile Hierarchy (FP-020 Compliance)

Windows 11 forces unpackaged Win32 apps to play a generic system chime regardless of WinRT sound attributes. To guarantee elegant audio, AIOS toasts set `<audio silent="true"/>` inside the XML payload and play calibrated native Windows WAV files once via `System.Media.SoundPlayer`:

| Profile Name          | Windows Audio File             | Sensory Character           | Best Used For                                      |
| --------------------- | ------------------------------ | --------------------------- | -------------------------------------------------- |
| `Sleek` (Default)     | `Windows Notify Messaging.wav` | Modern, subtle, crisp chime | Standard task completions, logged notes, briefings |
| `IM` / `Advisory`     | `Windows Message Nudge.wav`    | Soft, minimal pop           | Non-intrusive status updates, low-priority hints   |
| `Action` / `Reminder` | `Windows Notify Calendar.wav`  | Gentle ascending bell       | Schedule alerts, decision prompts, input requests  |
| `Warning` / `SMS`     | `Windows Background.wav`       | Solid, grounded tone        | Audit failures, blocked tasks, pre-commit issues   |
| `Nudge` / `Mail`      | `chimes.wav`                   | Classic bell chime          | Clock ticks, timer milestones                      |
| `Silent` / `None`     | (No audio playback)            | Completely muted            | Background operations, high-frequency passes       |

**Global Mute Override:** Setting `$env:AIOS_TOAST_SOUND = 'Silent'` globally suppresses audio across all AIOS toast scripts.

---

## 4. Architecture & Data Flow

```
[Agent / Script]
      |
      v
[Send-TaskToast.ps1 (Native WinRT) OR BurntToast]
      |
      v
[Windows Action Center Desktop Toast]
      |  (User types text and clicks Submit)
      v
[leonidas-toast:// Protocol Handler (HKCU Registry)]
      |
      v
[scripts/Handle-ToastAction.ps1]
      |
      +---> [logs/toast-interactions.jsonl] (Full telemetry)
      +---> [tasks/<task-slug>.md]          (If task specified: appends note)
      +---> [capture/<timestamp>.md]        (If ad-hoc input: creates inbox item)
      +---> Plays Sleek confirmation chime
```

---

## 5. Implementation Recipes

### Recipe A: One-Line Task Toast (Zero Dependencies)

Run via native [`scripts/Send-TaskToast.ps1`](../../../scripts/Send-TaskToast.ps1):

```powershell
pwsh -File scripts/Send-TaskToast.ps1 `
    -Title "Task Completed: Substrate Audit" `
    -Message "Audit finished with 0 errors and 100% pass rate." `
    -Sound "Sleek"
```

### Recipe B: Two-Way Interactive Task Toast

Prompts the user directly on desktop and appends his response directly into the task file:

```powershell
pwsh -File scripts/Send-TaskToast.ps1 `
    -Title "Next Action: Visual Branding" `
    -Message "Specify the target color tokens or press submit." `
    -InputPlaceholder "Type color token or design note..." `
    -SubmitLabel "Log to Task" `
    -TaskSlug "build-leonidas-aios-visual-branding-and-design-system-standard" `
    -Sound "Action"
```

### Recipe C: Quick Capture Toast (Desktop to Inbox)

Allows instant desktop note taking routed directly into [`capture/`](../../../capture/capture-index.md):

```powershell
pwsh -File scripts/Send-TaskToast.ps1 `
    -Title "Quick Capture: Leonidas AIOS" `
    -Message "Log an in-flight thought or task idea." `
    -InputPlaceholder "Type idea here..." `
    -SubmitLabel "Save to Capture" `
    -Sound "IM"
```

### Recipe D: BurntToast Advanced Action Set

For complex toasts with multiple buttons or custom app logos:

```powershell
Import-Module BurntToast

$text1 = New-BTText -Text "Leonidas AIOS Control Plane"
$text2 = New-BTText -Text "Select task priority change or provide input."
$binding = New-BTBinding -Children $text1, $text2
$visual = New-BTVisual -BindingGeneric $binding

$inputBox = New-BTInput -Id "userInput" -PlaceholderContent "Enter notes..."
$btnSubmit = New-BTButton -Content "Submit" -Arguments "leonidas-toast://reply?task=task-slug&input={userInput}" -ActivationType Protocol
$btnDismiss = New-BTButton -Dismiss -Content "Dismiss"
$actions = New-BTAction -Inputs $inputBox -Buttons $btnSubmit, $btnDismiss

$content = New-BTContent -Visual $visual -Actions $actions
Submit-BTNotification -Content $content
```

---

## 6. Maintenance & Verification

- **Register Protocol:** `pwsh -File scripts/Register-ToastProtocol.ps1`
- **Unregister Protocol:** `pwsh -File scripts/Register-ToastProtocol.ps1 -Unregister`
- **Test Audio Profiles:** `pwsh -File scripts/Test-ToastSounds.ps1 -Sound All`
- **Test Interactive Toasts:** `pwsh -File scripts/Test-InteractiveToast.ps1 -Engine Native`
- **Inspect Interaction Telemetry:** `Get-Content logs/toast-interactions.jsonl -Tail 5`
