import { GIFEncoder, quantize, applyPalette } from "gifenc";

/** 4R = 4x6 inch. Dibagi 2 => 2 strip berukuran 2x6 inch (300 dpi). */
export const STRIP_W = 600;
export const STRIP_H = 1800;
export const SHEET_W = 1200;
export const SHEET_H = 1800;

export type FrameConfig = {
  slots: 3 | 4;
  bg: string;
  textColor: string;
  padding: number;
  gap: number;
  radius: number;
  title: string;
  footer: string;
  showDate: boolean;
};

export const defaultFrame: FrameConfig = {
  slots: 4,
  bg: "#f4d9c6",
  textColor: "#3b1d12",
  padding: 40,
  gap: 20,
  radius: 16,
  title: "PHOTOBOOTH",
  footer: "Terima kasih sudah datang!",
  showDate: true,
};

export type Photo = HTMLCanvasElement | null;

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawCover(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, x: number, y: number, w: number, h: number, r: number) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.clip();
  const scale = Math.max(w / src.width, h / src.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
}

/** Menggambar satu strip ke ctx dengan ukuran (w x h). */
export function drawStrip(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  photos: Photo[],
  cfg: FrameConfig,
  overlay?: HTMLImageElement | null
) {
  const s = w / STRIP_W;
  const pad = cfg.padding * s;
  const gap = cfg.gap * s;
  const headerH = cfg.title ? 110 * s : 0;
  const footerH = 170 * s;

  ctx.fillStyle = cfg.bg;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = cfg.textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (cfg.title) {
    ctx.font = `700 ${46 * s}px system-ui, sans-serif`;
    ctx.fillText(cfg.title, w / 2, pad + headerH / 2 - 8 * s, w - pad * 2);
  }

  const top = pad + headerH;
  const availH = h - top - footerH - pad / 2;
  const n = cfg.slots;
  const slotH = (availH - gap * (n - 1)) / n;
  const slotW = w - pad * 2;

  for (let i = 0; i < n; i++) {
    const y = top + i * (slotH + gap);
    const p = photos[i];
    if (p) {
      drawCover(ctx, p, pad, y, slotW, slotH, cfg.radius * s);
    } else {
      ctx.save();
      roundRectPath(ctx, pad, y, slotW, slotH, cfg.radius * s);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = cfg.textColor;
      ctx.globalAlpha = 0.5;
      ctx.font = `600 ${56 * s}px system-ui, sans-serif`;
      ctx.fillText(String(i + 1), w / 2, y + slotH / 2);
      ctx.globalAlpha = 1;
    }
  }

  ctx.fillStyle = cfg.textColor;
  ctx.font = `500 ${30 * s}px system-ui, sans-serif`;
  const fy = h - footerH / 2 - pad / 4;
  if (cfg.footer) ctx.fillText(cfg.footer, w / 2, fy - (cfg.showDate ? 18 * s : 0), w - pad * 2);
  if (cfg.showDate) {
    ctx.globalAlpha = 0.7;
    ctx.font = `400 ${26 * s}px system-ui, sans-serif`;
    ctx.fillText(new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }), w / 2, fy + (cfg.footer ? 24 * s : 0));
    ctx.globalAlpha = 1;
  }

  if (overlay) ctx.drawImage(overlay, 0, 0, w, h);
}

export function composeStrip(photos: Photo[], cfg: FrameConfig, overlay?: HTMLImageElement | null, w = STRIP_W) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = w * (STRIP_H / STRIP_W);
  drawStrip(c.getContext("2d")!, c.width, c.height, photos, cfg, overlay);
  return c;
}

/** Kertas 4R berisi 2 strip identik, siap cetak. */
export function composeSheet(photos: Photo[], cfg: FrameConfig, overlay?: HTMLImageElement | null) {
  const strip = composeStrip(photos, cfg, overlay);
  const c = document.createElement("canvas");
  c.width = SHEET_W;
  c.height = SHEET_H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, SHEET_W, SHEET_H);
  ctx.drawImage(strip, 0, 0);
  ctx.drawImage(strip, STRIP_W, 0);
  return c;
}

/** GIF animasi: foto muncul satu per satu di dalam frame. */
export function makeGif(photos: Photo[], cfg: FrameConfig, overlay?: HTMLImageElement | null): Blob {
  const w = 300;
  const h = 900;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const gif = GIFEncoder();
  const n = cfg.slots;
  for (let i = 0; i < n; i++) {
    drawStrip(ctx, w, h, photos.map((p, j) => (j <= i ? p : null)), cfg, overlay);
    const { data } = ctx.getImageData(0, 0, w, h);
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay: i === n - 1 ? 2000 : 700 });
  }
  gif.finish();
  return new Blob([gif.bytes() as BlobPart], { type: "image/gif" });
}

export function download(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
}
