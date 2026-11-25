# Chat details panel and new chat

This spec adds to the [design standard](../../DESIGN.md).

One card holds **Run**, **Context** and **Limits**, in that order. `Ctrl+Shift+B` (`threadPanel.toggle`) shows or hides it. It opens by default. Decision record: ADR 0100 in the builder's AIOS. Doop frames: `dBl8_4S-Tq` (1440 wide) and `eQT4quJsfT` (new chat at 1280, and Limits hidden).

- **Placement:** the card sits inline at the top right while the chat keeps 480 px or more beside it ([`threadDetailsCardLayout.ts`](../../apps/web/src/components/chat/threadDetailsCardLayout.ts)). With less room it is a popover that stays closed until the user opens it. A popover may cover the chat.
- **One chat axis:** the header title, timeline and composer share one center line in the space left of the card ([`chatCanvasLayout.ts`](../../apps/web/src/components/chat/chatCanvasLayout.ts)). At 1024 px with both sidebars open, the title may shift 24 px for the header buttons.
- **Density:** a short card folds Context to one line first, then trims Run. Limits never folds by itself. The user folds it with the chevron, and the choice is saved (`usageOverlayEnabled`).
- **Limits ledger:** columns are Account, 5-hour and Weekly. Extra windows are sub-rows. Each name line keeps a 24 px slot for the reset chip, so chips align. A blue dot marks the account of this chat, with the screen reader text "Active".
- **This chat line:** one muted line under the ledger, for example "This chat used 38% of 5-hour · 4% of weekly". "up to" shows when another chat or device may share the points. It hides with no readings and never folds by itself. Data comes from [`ChatQuotaLog.ts`](../../apps/server/src/usage/ChatQuotaLog.ts) through `server.getChatQuota`.
- **Context:** model, effort, ring and segmented bar. A new chat shows the model that the composer will send with.
- **No thick colored edge:** no colored `border-left` over 1 px.

## New chat hero

- The red helmet at 60 percent, a time-of-day greeting with the project picker, and slow red dots. Jake's pick (Doop `MJ2ukUgbs-`) is dots only, with no haze.
- The dots have soft edges and show behind every chat, at half strength behind an active chat. They drift also when the system asks for reduced motion (Jake's choice). The planned Calm switch stops them.
- The helmet glow is 406 px wide and fades out from the helmet.
- The question line sits 24 px above the composer.
