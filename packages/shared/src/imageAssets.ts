/** Pinned public model assets shared by setup quotes and verified downloads. */
const FLUX =
  "https://huggingface.co/Comfy-Org/flux2-klein-4B/resolve/5b3abca5c0dc1ecd4eaf3340868d09063fc1c965/split_files";
const ZIMAGE =
  "https://huggingface.co/Comfy-Org/z_image_turbo/resolve/6fc90a3b1b653e935a0d175e260736de25b84df5/split_files";
const QWEN =
  "https://huggingface.co/Comfy-Org/Qwen-Image/resolve/1f12b17be14c89b026c51a91d67c32f84bb047bc/split_files";

interface ModelAsset {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
  readonly origin: string;
}

export const IMAGE_MODEL_ASSETS: Readonly<Record<string, readonly ModelAsset[]>> = {
  hidream: [
    {
      path: "checkpoints/hidream_o1_image_dev_fp8_scaled.safetensors",
      size: 8067535296,
      sha256: "7cbf53a475e0a13f92f2ec08bcffdb9b9de4305ef3b6f35cdd784d09dcd8d0cc",
      origin:
        "https://huggingface.co/Comfy-Org/HiDream-O1-Image/resolve/7b75f4cd7e757d55d9bd1d30fb40375fb446f38c",
    },
  ],
  birefnet: [
    {
      path: "background_removal/birefnet.safetensors",
      size: 444473596,
      sha256: "9ab37426bf4de0567af6b5d21b16151357149139362e6e8992021b8ce356a154",
      origin:
        "https://huggingface.co/Comfy-Org/BiRefNet/resolve/884af709e9b795d89dafbf97f29c8d6a2386f5c6",
    },
  ],
  qwen: [
    {
      path: "diffusion_models/qwen_image_2512_fp8_e4m3fn.safetensors",
      size: 20430679144,
      sha256: "5dc80554d5d83390046a2f4a94ece06afb7700bf7b0aaf8bde9769793875876b",
      origin: QWEN,
    },
    {
      path: "text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors",
      size: 9384670680,
      sha256: "cb5636d852a0ea6a9075ab1bef496c0db7aef13c02350571e388aea959c5c0b4",
      origin: QWEN,
    },
    {
      path: "vae/qwen_image_vae.safetensors",
      size: 253806246,
      sha256: "a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f",
      origin: QWEN,
    },
  ],
  flux2klein: [
    {
      path: "diffusion_models/flux-2-klein-4b.safetensors",
      size: 7751105712,
      sha256: "ec3d4e733a771f61c052fb4856c48b336c55eaf2c65487c2a1faeb9bbda7a343",
      origin: FLUX,
    },
    {
      path: "text_encoders/qwen_3_4b_fp4_flux2.safetensors",
      size: 3848213998,
      sha256: "3eab03a77adb0ee5304a4e677d5c10ac22f9049c1d7c894adca4f8bb39206ca8",
      origin: FLUX,
    },
    {
      path: "vae/flux2-vae.safetensors",
      size: 336211292,
      sha256: "868fe7b343cc8f3a19dbcfcafbc3d5f888802be3f89bd81b65b3621a066ce8f3",
      origin: FLUX,
    },
  ],
  zimage: [
    {
      path: "diffusion_models/z_image_turbo_bf16.safetensors",
      size: 12309866400,
      sha256: "2407613050b809ffdff18a4ac99af83ea6b95443ecebdf80e064a79c825574a6",
      origin: ZIMAGE,
    },
    {
      path: "text_encoders/qwen_3_4b_fp8_mixed.safetensors",
      size: 5631994051,
      sha256: "72450b19758172c5a7273cf7de729d1c17e7f434a104a00167624cba94f68f15",
      origin: ZIMAGE,
    },
    {
      path: "vae/ae.safetensors",
      size: 335304388,
      sha256: "afc8e28272cd15db3919bacdb6918ce9c1ed22e96cb12c4d5ed0fba823529e38",
      origin: ZIMAGE,
    },
  ],
};

export const modelDownloadBytes = (modelId: string) =>
  IMAGE_MODEL_ASSETS[modelId]?.reduce((sum, asset) => sum + asset.size, 0) ?? 0;
