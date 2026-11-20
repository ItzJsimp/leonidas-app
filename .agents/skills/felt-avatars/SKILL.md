---
name: felt-avatars
description: "Make, add or review the Leonidas felt avatar library: the locked style, the Z-Image Turbo prompt and settings, the 32-character roster, QA checks and packaging. Use when an agent needs a new agent avatar, regenerates avatars or edits their style."
category: design
scope: structural
distribution: private
---

# Felt avatars

Every agent in the Agents tab has one felt avatar. All avatars look like one family. This skill holds the style, the model, the prompt and the checks. Do not invent a new look.

Decision record: Jake chose felt, then chose Z-Image Turbo from a blind test of three installed models (2026-11-11). Task card: Batch 7, "Agents tab".

## The style (locked)

- **Character:** a cute felted wool animal or toy, head fills most of the frame, front view, simple glossy black bead eyes.
- **Surface:** dense, smooth, matte felt. Very short fuzz. Crisp clean outline. No loops, no yarn, no stitches, no knit pattern.
- **Props:** real objects made of their real material (glass, metal, wood, paper). A prop is never felt. Clothing, such as a beret or a bow tie, may be felt.
- **Frame:** dark charcoal background, soft studio light, shallow depth of field, no text, no logo.
- **Glow:** only the team lead has a glow. Every other avatar has a plain dark charcoal background. Jake removed the color-matched glows after review (2026-11-11).
- **Team lead (orchestrator):** the only hero avatar. A real polished gold Spartan helmet with a tall red crest, a golden aura and a warm orange ember glow (`background` override in `felt.json`). Do not give another character a gold helmet or any glow, so the orchestrator stays the main avatar.
- **Species:** fixed per character in `felt.json`. Do not let the model choose.
- **Color:** one main color per character. Do not reuse a color for roles that sit next to each other in Team.

## Files

- `felt.json`: the model, settings, prompt template and the roster of 32 characters (`id`, `color`, `species`, `prop`, `seed`, and an optional `background` that replaces the plain default (team lead only)). This is the single source.
- `scripts/generate.py`: makes the 1024 px images in a local ComfyUI. The same seed gives the same image.
- `assets/library/<id>.webp`: the shipped avatars, 256 px, about 15 KB each. The app copies from here.

## Make or add an avatar

1. Add an entry to `roster` in `felt.json`. Use a new `id` (lowercase, hyphens), a new `seed`, and one `prop` sentence that starts with "It" and names the real material.
2. Start ComfyUI (see Traps), then run `python -I scripts/generate.py <out-dir> --only <id>`.
3. Run the QA list. If it fails, change the `prop` text or the `seed`, not the template.
4. Save a 256 px WebP: `Image.resize((256, 256), LANCZOS).save("assets/library/<id>.webp", quality=85, method=6)`.
5. Show the new avatar in a Doop frame next to its neighbors before it ships.

To change the template, regenerate all 32 characters and review them as one set. A template change that looks good on one character may break others.

## QA list (every avatar)

- Surface reads as felt, not crochet and not fur. Edges are tidy, with no orange or colored fringe.
- Prop is real and readable at 56 px. No felt prop.
- The character holds one prop and no more. Hands are not melted.
- The face is centered. The head is not cut at the top in a circle crop.
- Color differs from the avatars next to it in Team.
- It is legible as a 20 px circle (use the crop below).

## Show it as an avatar

Use a circle with `background-size: 125%` and `background-position: 50% 3%`. At 125% the whole head fits. At 165% the top of the head is cut.

## Model and settings

- Model: Z-Image Turbo (`z_image_turbo_bf16.safetensors`), 8 steps, cfg 1.0, `res_multistep`, 1024 px. About 14 to 40 s per image on the dev machine.
- License: Apache 2.0 per the model card. Read the official LICENSE file before a release that ships the images.
- Tested and rejected: FLUX.2 klein 4B (felt props also became felt, which Jake did not like) and Qwen-Image 2512 (130 to 690 s per image and it hangs).

## Traps

- **Negative prompts do nothing.** Z-Image Turbo runs at cfg 1.0, so say what you want. "Not knitted" alone did not remove the crochet look. A positive description of a wet-felted toy did.
- **Do not write "halo".** "Peach-fuzz halo" gave orange fringes on black and pink avatars.
- **A glow on every avatar looked busy.** Jake kept it for the team lead only. Do not add a glow to other characters.
- **Saturated colors look knitted first.** Check teal, violet and red avatars first when you change the template.
- **ComfyUI may stop between turns.** A process that an agent shell starts can exit when the session ends. If `generate.py` says "connection refused", start ComfyUI again with the same arguments.
- **ComfyUI hangs at "Model Initializing" after a Qwen run.** Restart it. Kill only the PID you saved at start. Never kill by name or path.
- **Start ComfyUI with quoted paths.** The model-paths file sits in a folder with a space (`Comfy Desktop`). An unquoted path splits and the start fails.
