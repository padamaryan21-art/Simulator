import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ImageError, MAX_UPLOAD_BYTES, detectImage, processImage } from "@/server/images/process";
import { eligibleImages, imagePosition, imageStatus, shouldAddImage } from "@/server/images/pick";

const img = (over: Partial<Parameters<typeof eligibleImages>[0][number]> = {}) => ({
  id: "i1",
  topicId: "t1",
  personaId: "p1",
  enabled: true,
  usedAt: null as Date | null,
  reserved: false,
  ...over,
});

describe("imageStatus", () => {
  it("reports disabled before used before reserved", () => {
    expect(imageStatus({ enabled: false, usedAt: new Date(), reserved: true })).toBe("DISABLED");
    expect(imageStatus({ enabled: true, usedAt: new Date(), reserved: true })).toBe("USED");
    expect(imageStatus({ enabled: true, usedAt: null, reserved: true })).toBe("RESERVED");
    expect(imageStatus({ enabled: true, usedAt: null, reserved: false })).toBe("AVAILABLE");
  });
});

describe("eligibleImages: an image can only be picked once, for the right topic and sender", () => {
  const all = [
    img({ id: "ok" }),
    img({ id: "used", usedAt: new Date() }),
    img({ id: "reserved", reserved: true }),
    img({ id: "disabled", enabled: false }),
    img({ id: "other-topic", topicId: "t2" }),
    img({ id: "no-topic", topicId: null }),
    img({ id: "no-persona", personaId: null }),
    img({ id: "absent-persona", personaId: "p9" }),
  ];
  it("keeps only unused, unattached, enabled images for this topic whose sender takes part", () => {
    expect(eligibleImages(all, "t1", ["p1", "p2"]).map((i) => i.id)).toEqual(["ok"]);
  });
  it("offers nothing when the conversation has no topic", () => {
    expect(eligibleImages(all, null, ["p1"])).toEqual([]);
  });
  it("never offers an image twice once it is marked used or reserved", () => {
    const first = eligibleImages(all, "t1", ["p1"])[0];
    expect(
      eligibleImages(
        all.map((i) => (i.id === first.id ? { ...i, reserved: true } : i)),
        "t1",
        ["p1"],
      ),
    ).toEqual([]);
    expect(
      eligibleImages(
        all.map((i) => (i.id === first.id ? { ...i, usedAt: new Date() } : i)),
        "t1",
        ["p1"],
      ),
    ).toEqual([]);
  });
});

describe("shouldAddImage / imagePosition", () => {
  it("respects the on/off switch and the chance", () => {
    expect(shouldAddImage({ enabled: false, chancePercent: 100 }, () => 0)).toBe(false);
    expect(shouldAddImage({ enabled: true, chancePercent: 0 }, () => 0)).toBe(false);
    expect(shouldAddImage({ enabled: true, chancePercent: 100 }, () => 0.999)).toBe(true);
    expect(shouldAddImage({ enabled: true, chancePercent: 60 }, () => 0.59)).toBe(true);
    expect(shouldAddImage({ enabled: true, chancePercent: 60 }, () => 0.61)).toBe(false);
  });
  it("never puts the image first and never past the end", () => {
    for (let n = 0; n <= 40; n++) {
      for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) {
        const p = imagePosition(n, () => r);
        expect(p).toBeLessThanOrEqual(n);
        if (n >= 2) expect(p).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

const jpegWithGps = () =>
  sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#3366cc" } })
    .withExif({
      IFD0: { Copyright: "SECRET-OWNER" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "14/1 35/1 0/1" },
    })
    .jpeg()
    .toBuffer();

describe("processImage", () => {
  it("recognises pictures by their bytes", () => {
    expect(detectImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(detectImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    expect(detectImage(Buffer.from("GIF89a"))).toBeNull();
    expect(detectImage(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
  });

  it("removes hidden metadata such as the GPS location, and shrinks big pictures", async () => {
    const input = await jpegWithGps();
    expect((await sharp(input).metadata()).exif).toBeDefined(); // the upload really carries metadata
    const out = await processImage(input);
    const meta = await sharp(out.data).metadata();
    expect(meta.exif).toBeUndefined();
    expect(out.data.includes(Buffer.from("SECRET-OWNER"))).toBe(false);
    expect(meta.format).toBe("jpeg");
    expect(Math.max(out.width, out.height)).toBe(2048); // 3000 px longest side shrunk, aspect kept
    expect(out.width / out.height).toBeCloseTo(1.5, 1);
  });

  it("converts PNG (with transparency) to a white-backed JPEG", async () => {
    const png = await sharp({
      create: { width: 40, height: 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const out = await processImage(png);
    expect((await sharp(out.data).metadata()).format).toBe("jpeg");
    const { data } = await sharp(out.data).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(240); // transparent became white, not black
  });

  it("gives the same picture the same hash (so duplicates can be refused)", async () => {
    const input = await sharp({
      create: { width: 64, height: 64, channels: 3, background: "#aa5500" },
    })
      .jpeg()
      .toBuffer();
    expect((await processImage(input)).sha256).toBe((await processImage(input)).sha256);
    const other = await sharp({
      create: { width: 64, height: 64, channels: 3, background: "#00aa55" },
    })
      .jpeg()
      .toBuffer();
    expect((await processImage(other)).sha256).not.toBe((await processImage(input)).sha256);
  });

  it("rejects empty, oversized, disguised and corrupted files", async () => {
    await expect(processImage(Buffer.alloc(0))).rejects.toBeInstanceOf(ImageError);
    await expect(
      processImage(
        Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(MAX_UPLOAD_BYTES)]),
      ),
    ).rejects.toThrow(/4 MB/);
    await expect(
      processImage(Buffer.from("just some text pretending to be a jpg")),
    ).rejects.toThrow(/JPG or PNG/);
    await expect(
      processImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")),
    ).rejects.toThrow(/JPG or PNG/);
    await expect(
      processImage(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("garbage")])),
    ).rejects.toThrow(/could not be read/);
  });
});
