# Images

The Images page makes pictures with models on your own computer. It is free: nothing leaves your computer and nothing costs money.

## Set up

Images uses ComfyUI, a free program that runs the models. Install and start ComfyUI yourself. Leonidas does not install it. The page connects to `http://127.0.0.1:8188` by default. To use another address, change it in the ComfyUI connection box and press Save.

## Make images

1. Open `Images` in the sidebar and choose a project.
2. Write a prompt and tick one or more models.
3. Set Variations (1 to 12). Leave Seed empty for a random seed. Variation `i` uses seed + `i`.
4. Press Generate.

Images run one at a time. Pictures appear in the grid as they finish. Press a picture to enlarge it. Cancel waiting removes the images that have not started. Stop all also stops the image that runs now.

Each model shows its size, its typical time and a licence badge. "Check licence" means the licence is not verified yet. Read it before you sell the pictures. "Commercial use: no" means you may not sell them.

## Where files go

Pictures save in the `images` folder of the project. Each picture has a Recipe file next to it with the same name and a `.json` ending. The Recipe holds the prompt, seed, model, sampler settings, the time and the seconds it took.

Keep copies the picture and its Recipe into `images/kept`. Press Kept again to remove the copy. The original stays.

When you reopen a project, the page loads the newest 60 pictures from the Recipe files.
