# Images on Apple Silicon: Beta checks

Mac remains Beta. No Mac hardware test has passed yet.
Windows measurements do not guarantee Mac performance.

Use an isolated development profile. Never use your installed app's live data.

## Setup

- [ ] Record the chip, unified memory, macOS version, app build, runtime version, and model versions.
- [ ] Start with an empty test profile on an Apple Silicon Mac with at least 8 GB of unified memory.
- [ ] Use the app to choose a folder and download the engine and a model.
- [ ] Confirm that the runtime is `v0.42.1-env1` for `mac-mps` and that each download passes SHA-256 verification.
- [ ] Test insufficient disk space. Confirm that setup stops before a download starts.
- [ ] Interrupt a download. Resume it, cancel it, and retry it.
- [ ] Select existing model files. Confirm that setup verifies them and does not move or overwrite them.
- [ ] Make the first image without a terminal. Repeat with five isolated profiles.

## Image work

- [ ] After setup, disconnect the test computer from the internet.
- [ ] Generate an image, apply a word edit, and apply a brush edit.
- [ ] Import a PNG reference with no side longer than 2048 pixels.
- [ ] Remove its background with BiRefNet. Confirm that the result has transparency.
- [ ] Enlarge the result 2x. Confirm that transparency remains.
- [ ] Export PNG, ICO, ICNS, and a ZIP of PNG icon sizes.
- [ ] Open the ICNS file in a Mac application. Record the application and result.
- [ ] Check the exported files for unwanted prompt or workflow metadata.

## Recovery and shared work

- [ ] Start image work from chat. Confirm that the same job appears in Images.
- [ ] Cancel waiting work and active work. Confirm that another app's work continues.
- [ ] Close only the isolated image engine. Confirm that the app keeps the prompt and permits retry.
- [ ] Measure the first image and five warm images. Include engine startup in the first image time.
- [ ] Record peak memory and memory use 60 seconds after the queue finishes.
- [ ] Test memory pressure. Confirm that the error gives a clear next action and keeps the prompt.

## Evidence

Record pass, fail, or not tested for each check.

```text
Tester and date:
Chip and unified memory:
macOS and app build:
Runtime and model versions:
Free disk space and installation volume:
First image time:
Five warm image times:
Peak memory and idle memory:
Export opening application and result:
Failures and exact reproduction steps:
Isolated logs and screenshots:
```
