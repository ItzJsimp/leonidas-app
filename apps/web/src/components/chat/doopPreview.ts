const ID = /^[A-Za-z0-9_-]{1,128}$/;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function readDoopPreview(value: unknown) {
  if (!record(value) || !record(value.canvas) || !Array.isArray(value.frames)) return null;
  const canvas = value.canvas;
  if (typeof canvas.id !== "string" || !ID.test(canvas.id)) return null;
  const url = `https://doop.design/c/${canvas.id}`;
  const frames = value.frames.slice(0, 3).flatMap((frame: unknown) => {
    if (!record(frame) || typeof frame.id !== "string" || !ID.test(frame.id)) return [];
    let imageUrl: string | null = null;
    if (typeof frame.image_url === "string") {
      try {
        const image = new URL(frame.image_url);
        if (
          image.origin === "https://doop.design" &&
          image.pathname === `/i/${frame.id}.png` &&
          !image.username &&
          !image.password
        )
          imageUrl = image.href;
      } catch {
        /* Invalid previews retain a link to the canvas. */
      }
    }
    return [
      {
        id: frame.id,
        name: typeof frame.name === "string" ? frame.name.slice(0, 300) : "Untitled design",
        width: typeof frame.width === "number" && Number.isFinite(frame.width) ? frame.width : 0,
        height:
          typeof frame.height === "number" && Number.isFinite(frame.height) ? frame.height : 0,
        empty: frame.empty === true,
        imageUrl,
        url: `${url}?frame=${frame.id}`,
      },
    ];
  });
  return {
    name: typeof canvas.name === "string" ? canvas.name.slice(0, 300) : "Doop canvas",
    url,
    frames,
    frameCount: value.frames.length,
  };
}

export type DoopPreview = NonNullable<ReturnType<typeof readDoopPreview>>;
