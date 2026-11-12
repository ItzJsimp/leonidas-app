"""Make felt avatars with a local ComfyUI. Usage:
python -I generate.py <out-dir> [--only id,id] [--base http://127.0.0.1:8188]
Reads ../felt.json. Writes <out-dir>/<id>.png (1024 px). Skips files that exist."""
import json, pathlib, sys, time, urllib.parse, urllib.request

HERE = pathlib.Path(__file__).resolve().parent.parent
CFG = json.loads((HERE / "felt.json").read_text(encoding="utf-8"))
args = sys.argv[1:]
BASE = args[args.index("--base") + 1] if "--base" in args else "http://127.0.0.1:8188"
ONLY = set(args[args.index("--only") + 1].split(",")) if "--only" in args else None
OUT = pathlib.Path(args[0]); OUT.mkdir(parents=True, exist_ok=True)
M, S = CFG["model"], CFG["settings"]


def workflow(prompt, seed):
    w = S["size"]
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": M["checkpoint"], "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": M["text_encoder"], "type": "lumina2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": M["vae"]}},
        "4": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": S["shift"]}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": prompt}},
        "6": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["5", 0]}},
        "7": {"class_type": "EmptySD3LatentImage", "inputs": {"width": w, "height": w, "batch_size": 1}},
        "8": {"class_type": "KSampler", "inputs": {"model": ["4", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["7", 0], "seed": seed, "steps": S["steps"], "cfg": S["cfg"], "sampler_name": S["sampler"], "scheduler": S["scheduler"], "denoise": 1.0}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "PreviewImage", "inputs": {"images": ["9", 0]}},
    }


def call(path, body=None):
    req = urllib.request.Request(BASE + path, data=None if body is None else json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


for a in CFG["roster"]:
    dest = OUT / f"{a['id']}.png"
    if dest.exists() or (ONLY and a["id"] not in ONLY):
        continue
    bg = a.get("background") or CFG["background_default"]
    prompt = CFG["template"].format(color=a["color"], species=a["species"], prop=a["prop"], background=bg)
    pid = json.loads(call("/prompt", {"prompt": workflow(prompt, a["seed"])}))["prompt_id"]
    t0 = time.time()
    while True:
        hist = json.loads(call(f"/history/{pid}")).get(pid)
        st = (hist or {}).get("status", {})
        if st.get("status_str") == "error":
            sys.exit(f"FAILED {a['id']}: {json.dumps(st)[:300]}")
        if hist and st.get("completed"):
            break
        if time.time() - t0 > 300:
            sys.exit(f"TIMEOUT {a['id']}: restart ComfyUI (see SKILL.md, Traps)")
        time.sleep(2)
    img = hist["outputs"]["10"]["images"][0]
    q = urllib.parse.urlencode({"filename": img["filename"], "subfolder": img.get("subfolder", ""), "type": img.get("type", "temp")})
    dest.write_bytes(call(f"/view?{q}"))
    print(f"OK {a['id']} {time.time() - t0:.0f}s", flush=True)
print("DONE")
