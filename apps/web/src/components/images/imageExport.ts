export type ImageExportFormat = "png" | "ico" | "icns" | "icon-set";
interface IconEntry {
  readonly size: number;
  readonly png: Uint8Array;
}
const MAX_BYTES = 32 * 1024 ** 2;
const ICON_SIZES = [16, 32, 64, 128, 256, 512, 1024] as const;
const ICNS_TYPES: Readonly<Record<number, string>> = {
  16: "icp4",
  32: "icp5",
  64: "icp6",
  128: "ic07",
  256: "ic08",
  512: "ic09",
  1024: "ic10",
};
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function pngDimensions(bytes: Uint8Array) {
  if (bytes.length < 33 || PNG_SIGNATURE.some((value, index) => bytes[index] !== value))
    throw new Error("The file must contain PNG data.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452)
    throw new Error("The PNG header is invalid.");
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function validate(entries: readonly IconEntry[], max: number) {
  if (!entries.length || entries.length > 8) throw new Error("An icon needs one to eight sizes.");
  let bytes = 0;
  for (const entry of entries) {
    const dimensions = pngDimensions(entry.png);
    if (
      !Number.isInteger(entry.size) ||
      entry.size < 1 ||
      entry.size > max ||
      dimensions.width !== entry.size ||
      dimensions.height !== entry.size
    )
      throw new Error("The PNG size does not match the icon size.");
    bytes += entry.png.length;
  }
  if (bytes > MAX_BYTES) throw new Error("The icon files are too large to export.");
}

/** ICO permits PNG payloads, with 256 represented by a zero width byte. */
export function encodeIco(entries: readonly IconEntry[]) {
  validate(entries, 256);
  const header = 6 + entries.length * 16;
  const bytes = new Uint8Array(header + entries.reduce((sum, entry) => sum + entry.png.length, 0));
  const view = new DataView(bytes.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, entries.length, true);
  let offset = header;
  entries.forEach((entry, index) => {
    const row = 6 + index * 16;
    bytes[row] = entry.size === 256 ? 0 : entry.size;
    bytes[row + 1] = bytes[row]!;
    view.setUint16(row + 4, 1, true);
    view.setUint16(row + 6, 32, true);
    view.setUint32(row + 8, entry.png.length, true);
    view.setUint32(row + 12, offset, true);
    bytes.set(entry.png, offset);
    offset += entry.png.length;
  });
  return bytes;
}

/** ICNS PNG chunks use big-endian sizes, including each eight-byte chunk header. */
export function encodeIcns(entries: readonly IconEntry[]) {
  validate(entries, 1024);
  const bytes = new Uint8Array(8 + entries.reduce((sum, entry) => sum + 8 + entry.png.length, 0));
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("icns"));
  view.setUint32(4, bytes.length);
  let offset = 8;
  for (const entry of entries) {
    const type = ICNS_TYPES[entry.size];
    if (!type) throw new Error("This icon size is not supported by ICNS.");
    bytes.set(new TextEncoder().encode(type), offset);
    view.setUint32(offset + 4, 8 + entry.png.length);
    bytes.set(entry.png, offset + 8);
    offset += 8 + entry.png.length;
  }
  return bytes;
}

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array) {
  crcTable ??= Uint32Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (-(value & 1) & 0xedb88320);
    return value >>> 0;
  });
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255]!;
  return (crc ^ 0xffffffff) >>> 0;
}

/** PNGs are already compressed. A stored ZIP avoids another compression dependency. */
export function encodeIconZip(entries: readonly IconEntry[]) {
  validate(entries, 1024);
  const files = entries.map((entry) => ({
    ...entry,
    name: new TextEncoder().encode(`icon-${entry.size}.png`),
    crc: crc32(entry.png),
  }));
  const dataSize = files.reduce((sum, file) => sum + 30 + file.name.length + file.png.length, 0);
  const directorySize = files.reduce((sum, file) => sum + 46 + file.name.length, 0);
  const bytes = new Uint8Array(dataSize + directorySize + 22);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  let directory = dataSize;
  for (const file of files) {
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 12, 33, true);
    view.setUint32(offset + 14, file.crc, true);
    view.setUint32(offset + 18, file.png.length, true);
    view.setUint32(offset + 22, file.png.length, true);
    view.setUint16(offset + 26, file.name.length, true);
    bytes.set(file.name, offset + 30);
    bytes.set(file.png, offset + 30 + file.name.length);
    view.setUint32(directory, 0x02014b50, true);
    view.setUint16(directory + 4, 20, true);
    view.setUint16(directory + 6, 20, true);
    view.setUint16(directory + 14, 33, true);
    view.setUint32(directory + 16, file.crc, true);
    view.setUint32(directory + 20, file.png.length, true);
    view.setUint32(directory + 24, file.png.length, true);
    view.setUint16(directory + 28, file.name.length, true);
    view.setUint32(directory + 42, offset, true);
    bytes.set(file.name, directory + 46);
    offset += 30 + file.name.length + file.png.length;
    directory += 46 + file.name.length;
  }
  view.setUint32(directory, 0x06054b50, true);
  view.setUint16(directory + 8, files.length, true);
  view.setUint16(directory + 10, files.length, true);
  view.setUint32(directory + 12, directorySize, true);
  view.setUint32(directory + 16, dataSize, true);
  return bytes;
}

async function pngBytes(bitmap: ImageBitmap, size?: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size ?? bitmap.width;
  canvas.height = size ?? bitmap.height;
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot export images.");
    const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.drawImage(
      bitmap,
      (canvas.width - width) / 2,
      (canvas.height - height) / 2,
      width,
      height,
    );
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("The image could not be exported."))),
        "image/png",
      ),
    );
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** Export clean pixels. Original prompts and workflow metadata stay in the Recipe sidecar. */
export async function exportImage(
  url: string,
  format: ImageExportFormat,
  filename = "leonidas-image",
) {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok || !response.body)
    throw new Error("The picture could not be downloaded. Try again.");
  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) throw new Error("The picture is too large to export.");
      chunks.push(value.slice());
    }
  } finally {
    await reader.cancel();
  }
  const input = new Blob(chunks);
  const dimensions = pngDimensions(new Uint8Array(await input.slice(0, 33).arrayBuffer()));
  if (
    !dimensions.width ||
    !dimensions.height ||
    dimensions.width > 8192 ||
    dimensions.height > 8192 ||
    dimensions.width * dimensions.height > 16 * 1024 ** 2
  )
    throw new Error("The picture dimensions are too large to export.");
  const bitmap = await createImageBitmap(input);
  try {
    const entries: IconEntry[] = [];
    if (format !== "png") {
      for (const size of ICON_SIZES) {
        if (format === "ico" && size > 256) continue;
        entries.push({ size, png: await pngBytes(bitmap, size) });
      }
    }
    const bytes =
      format === "ico"
        ? encodeIco(entries)
        : format === "icns"
          ? encodeIcns(entries)
          : format === "icon-set"
            ? encodeIconZip(entries)
            : await pngBytes(bitmap);
    const extension = format === "icon-set" ? "zip" : format;
    const blob = new Blob([bytes.slice().buffer], {
      type:
        format === "png"
          ? "image/png"
          : format === "ico"
            ? "image/x-icon"
            : format === "icns"
              ? "image/icns"
              : "application/zip",
    });
    const downloadUrl = URL.createObjectURL(blob);
    try {
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${filename.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100) || "image"}.${extension}`;
      link.click();
      await new Promise<void>((resolve) => window.setTimeout(resolve, 1000));
    } finally {
      URL.revokeObjectURL(downloadUrl);
    }
  } finally {
    bitmap.close();
  }
}
