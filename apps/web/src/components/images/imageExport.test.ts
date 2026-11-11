import { describe, expect, it } from "vite-plus/test";
import { encodeIco, encodeIcns, encodeIconZip } from "./imageExport";

const png16 = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVR4nGNgaGD4TxEeNWDUgFED/g8TAwDrCH8Qy9YD6gAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);
const png32 = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAALElEQVR4nO3OoQEAAAjAoJ3u53qGhUCnpn0lICAgICAgICAgICAgICDQc+AAqbP8TP40Ns8AAAAASUVORK5CYII=",
  ),
  (c) => c.charCodeAt(0),
);
const entries = [
  { size: 16, png: png16 },
  { size: 32, png: png32 },
];

describe("image export containers", () => {
  it("writes an ICO directory with PNG payload offsets", () => {
    const bytes = encodeIco(entries);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(Array.from(bytes.slice(0, 6))).toEqual([0, 0, 1, 0, 2, 0]);
    expect(Array.from(bytes.slice(6, 8))).toEqual([16, 16]);
    expect(view.getUint32(14, true)).toBe(82);
    expect(view.getUint32(18, true)).toBe(38);
    expect(view.getUint32(34, true)).toBe(120);
    expect(bytes.slice(38, 120)).toEqual(png16);
    expect(bytes.slice(120)).toEqual(png32);
  });

  it("writes an ICNS family with big-endian chunk sizes", () => {
    const bytes = encodeIcns(entries);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("icns");
    expect(view.getUint32(4)).toBe(207);
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe("icp4");
    expect(view.getUint32(12)).toBe(90);
    expect(new TextDecoder().decode(bytes.slice(98, 102))).toBe("icp5");
    expect(bytes.slice(16, 98)).toEqual(png16);
    expect(bytes.slice(106)).toEqual(png32);
  });

  it("writes a stored ZIP with a valid CRC and central directory", () => {
    const bytes = encodeIconZip([entries[0]!]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(8, true)).toBe(0);
    expect(view.getUint32(14, true)).toBe(0x5ea0d138);
    expect(view.getUint32(18, true)).toBe(82);
    expect(new TextDecoder().decode(bytes.slice(30, 41))).toBe("icon-16.png");
    expect(bytes.slice(41, 123)).toEqual(png16);
    expect(view.getUint32(123, true)).toBe(0x02014b50);
    expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(bytes.length - 12, true)).toBe(1);
    expect(view.getUint32(bytes.length - 6, true)).toBe(123);
  });

  it("rejects a mismatched PNG size and unsupported icon formats", () => {
    expect(() => encodeIco([{ size: 32, png: png16 }])).toThrow(/size/);
    expect(() => encodeIcns([{ size: 17, png: png16 }])).toThrow();
    expect(() => encodeIco([])).toThrow();
  });
});
