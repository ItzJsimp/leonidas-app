import { describe, expect, it } from "vite-plus/test";

import {
  COMFY_MODEL_IDS,
  COMFY_WORKFLOWS,
  COMFY_WORKFLOW_SETTINGS,
  flux2kleinWorkflow,
  qwen21Workflow,
  qwenWorkflow,
  zimageWorkflow,
  upscaleWorkflow,
} from "./comfyWorkflows.ts";

const input = {
  prompt: "a ghost slime",
  seed: 42,
  width: 1024,
  height: 1024,
  referenceImageName: "reference.png",
};

describe("flux2kleinWorkflow", () => {
  const graph = flux2kleinWorkflow(input);

  it("loads the FLUX.2 klein files", () => {
    expect(graph["1"]?.inputs.unet_name).toBe("flux-2-klein-4b.safetensors");
    expect(graph["2"]?.inputs).toMatchObject({
      clip_name: "qwen_3_4b_fp4_flux2.safetensors",
      type: "flux2",
    });
    expect(graph["3"]?.inputs.vae_name).toBe("flux2-vae.safetensors");
  });

  it("samples with 4 steps, cfg 1 and euler", () => {
    expect(graph["10"]).toEqual({
      class_type: "Flux2Scheduler",
      inputs: { steps: 4, width: 1024, height: 1024 },
    });
    expect(graph["8"]?.inputs.cfg).toBe(1.0);
    expect(graph["9"]?.inputs.sampler_name).toBe("euler");
  });

  it("puts the prompt and seed in the right nodes", () => {
    expect(graph["5"]?.inputs.text).toBe("a ghost slime");
    expect(graph["11"]?.inputs.noise_seed).toBe(42);
  });

  it("ends in a preview node that reads the decoded image", () => {
    expect(graph["14"]).toEqual({ class_type: "PreviewImage", inputs: { images: ["13", 0] } });
  });
});

describe("qwenWorkflow", () => {
  const graph = qwenWorkflow(input);

  it("loads the Qwen-Image 2512 fp8 files", () => {
    expect(graph["1"]?.inputs.unet_name).toBe("qwen_image_2512_fp8_e4m3fn.safetensors");
    expect(graph["2"]?.inputs.clip_name).toBe("qwen_2.5_vl_7b_fp8_scaled.safetensors");
    expect(graph["3"]?.inputs.vae_name).toBe("qwen_image_vae.safetensors");
  });

  it("samples with 30 steps, cfg 4 and euler", () => {
    expect(graph["8"]?.inputs).toMatchObject({
      seed: 42,
      steps: 30,
      cfg: 4.0,
      sampler_name: "euler",
      scheduler: "simple",
      denoise: 1.0,
    });
    expect(graph["4"]?.inputs.shift).toBe(3.1);
  });

  it("uses a blank negative prompt", () => {
    expect(graph["6"]?.inputs.text).toBe(" ");
  });
});

describe("qwen21Workflow", () => {
  const graph = qwen21Workflow(input);

  it("loads the Qwen-Image 2.1 bf16 files", () => {
    expect(graph["1"]?.inputs.unet_name).toBe("qwen_image_2.1_bf16.safetensors");
    expect(graph["2"]?.inputs.clip_name).toBe("qwen3vl_8b_bf16.safetensors");
    expect(graph["3"]?.inputs.vae_name).toBe("qwen_image_2.1_vae_bf16.safetensors");
  });

  it("samples with 25 steps, cfg 1 and euler, using both encoder outputs", () => {
    expect(graph["8"]?.inputs).toMatchObject({
      positive: ["5", 0],
      negative: ["5", 1],
      steps: 25,
      cfg: 1.0,
      sampler_name: "euler",
    });
    expect(graph["5"]?.inputs.prompt).toBe("a ghost slime");
  });
});

describe("zimageWorkflow", () => {
  const graph = zimageWorkflow(input);

  it("loads the Z-Image Turbo files", () => {
    expect(graph["1"]?.inputs.unet_name).toBe("z_image_turbo_bf16.safetensors");
    expect(graph["2"]?.inputs).toMatchObject({
      clip_name: "qwen_3_4b_fp8_mixed.safetensors",
      type: "lumina2",
    });
    expect(graph["3"]?.inputs.vae_name).toBe("ae.safetensors");
  });

  it("samples with 8 steps, cfg 1 and res_multistep", () => {
    expect(graph["8"]?.inputs).toMatchObject({
      steps: 8,
      cfg: 1.0,
      sampler_name: "res_multistep",
      scheduler: "simple",
    });
    expect(graph["5"]?.inputs.text).toBe("a ghost slime");
  });
});

describe("workflow table", () => {
  it("restores the source alpha before resizing its pixels", () => {
    const graph = upscaleWorkflow(input);
    expect(graph["2"]).toEqual({
      class_type: "JoinImageWithAlpha",
      inputs: { image: ["1", 0], alpha: ["1", 1] },
    });
    expect(graph["3"]?.inputs.image).toEqual(["2", 0]);
    expect(graph["4"]?.inputs.images).toEqual(["3", 0]);
  });
  it("has a builder and Recipe settings for every model id", () => {
    for (const id of COMFY_MODEL_IDS) {
      expect(COMFY_WORKFLOWS[id](input)).toBeTruthy();
      expect(COMFY_WORKFLOW_SETTINGS[id]).toMatchObject({ width: 1024, height: 1024 });
    }
  });

  it("keeps the Recipe settings equal to the sampler values in the graph", () => {
    expect(COMFY_WORKFLOW_SETTINGS.flux2klein.steps).toBe(4);
    expect(COMFY_WORKFLOW_SETTINGS.qwen.steps).toBe(30);
    expect(COMFY_WORKFLOW_SETTINGS.qwen.cfg).toBe(4.0);
    expect(COMFY_WORKFLOW_SETTINGS.qwen21.steps).toBe(25);
    expect(COMFY_WORKFLOW_SETTINGS.zimage.steps).toBe(8);
  });
});
