"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { HW_CONTROLS, useCamera } from "../hooks/useCamera";
import {
  FrameConfig, Photo, SHEET_H, SHEET_W, composeSheet, composeStrip, defaultFrame, download, makeGif,
} from "../lib/compose";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RESOLUTIONS = ["640x480", "1280x720", "1920x1080", "3840x2160"];

export default function Page() {
  const cam = useCamera();
  const [cfg, setCfg] = useState<FrameConfig>(defaultFrame);
  const [photos, setPhotos] = useState<Photo[]>([null, null, null, null]);
  const [overlay, setOverlay] = useState<HTMLImageElement | null>(null);
  const [mirror, setMirror] = useState(true);
  const [delay, setDelay] = useState(3);
  const [soft, setSoft] = useState({ brightness: 100, contrast: 100, saturation: 100 });
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const [flash, setFlash] = useState(false);
  const [gifUrl, setGifUrl] = useState("");
  const [printSrc, setPrintSrc] = useState("");
  const sheetRef = useRef<HTMLCanvasElement>(null);

  const filter = `brightness(${soft.brightness}%) contrast(${soft.contrast}%) saturate(${soft.saturation}%)`;
  const used = useMemo(() => photos.slice(0, cfg.slots), [photos, cfg.slots]);
  const complete = used.every(Boolean);
  const set = <K extends keyof FrameConfig>(k: K, v: FrameConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));

  // Pratinjau langsung kertas 4R (2 strip)
  useEffect(() => {
    const ctx = sheetRef.current?.getContext("2d");
    if (ctx) ctx.drawImage(composeSheet(used, cfg, overlay), 0, 0);
  }, [used, cfg, overlay]);

  // GIF otomatis dibuat setelah semua foto terisi, dan diperbarui saat frame diubah
  useEffect(() => {
    if (!complete || busy) return;
    const t = setTimeout(() => {
      const url = URL.createObjectURL(makeGif(used, cfg, overlay));
      setGifUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
    }, 500);
    return () => clearTimeout(t);
  }, [used, cfg, overlay, complete, busy]);

  const capture = (): HTMLCanvasElement | null => {
    const v = cam.videoRef.current;
    if (!v || !v.videoWidth) return null;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d")!;
    ctx.filter = filter;
    if (mirror) {
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0);
    return c;
  };

  const shoot = async (indices: number[]) => {
    if (busy || !cam.active) return;
    setBusy(true);
    for (const i of indices) {
      for (let t = delay; t > 0; t--) {
        setCount(t);
        await sleep(1000);
      }
      setCount(0);
      setFlash(true);
      const shot = capture();
      setTimeout(() => setFlash(false), 150);
      if (shot) setPhotos((p) => p.map((x, j) => (j === i ? shot : x)));
      await sleep(500);
    }
    setBusy(false);
  };

  const reset = () => {
    setPhotos([null, null, null, null]);
    if (gifUrl) URL.revokeObjectURL(gifUrl);
    setGifUrl("");
  };

  const onOverlay = (f?: File) => {
    if (!f) return setOverlay(null);
    const img = new Image();
    img.onload = () => setOverlay(img);
    img.src = URL.createObjectURL(f);
  };

  const print = () => {
    setPrintSrc(composeSheet(used, cfg, overlay).toDataURL("image/png"));
    setTimeout(() => window.print(), 200);
  };

  return (
    <>
      <main className="app">
        <header className="top">
          <h1>Photobooth</h1>
          <p>Kertas 4R dibagi 2 strip &middot; langsung cetak</p>
        </header>

        <div className="grid">
          {/* ===== KAMERA ===== */}
          <section className="panel">
            <h2>Kamera</h2>
            <div className="stage">
              <video
                ref={cam.videoRef}
                muted
                playsInline
                style={{ filter, transform: mirror ? "scaleX(-1)" : "none" }}
              />
              {!cam.active && <div className="empty">Kamera belum menyala</div>}
              {count > 0 && <div className="count">{count}</div>}
              {flash && <div className="flash" />}
            </div>
            {cam.error && <p className="error">{cam.error}</p>}

            <div className="row">
              <button onClick={() => cam.start(cam.deviceId || undefined)}>
                {cam.active ? "Mulai ulang kamera" : "Nyalakan kamera"}
              </button>
              {cam.active && <button className="ghost" onClick={cam.stop}>Matikan</button>}
            </div>

            <label>Pilih kamera
              <select
                value={cam.deviceId}
                onChange={(e) => { cam.setDeviceId(e.target.value); cam.start(e.target.value); }}
              >
                {cam.devices.length === 0 && <option value="">Nyalakan kamera dulu</option>}
                {cam.devices.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || `Kamera ${i + 1}`}</option>
                ))}
              </select>
            </label>

            <label>Resolusi
              <select
                value={cam.resolution}
                onChange={(e) => { cam.setResolution(e.target.value); if (cam.active) cam.start(cam.deviceId, e.target.value); }}
              >
                {RESOLUTIONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </label>

            <label className="check">
              <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> Mode cermin
            </label>

            <h3>Pengaturan kamera</h3>
            {HW_CONTROLS.filter((c) => cam.caps[c.key]).map((c) => (
              <Slider key={c.key} label={c.label} min={cam.caps[c.key].min} max={cam.caps[c.key].max}
                step={cam.caps[c.key].step} value={cam.values[c.key]} onChange={(v) => cam.setHw(c.key, v)} />
            ))}
            {cam.active && Object.keys(cam.caps).length === 0 && (
              <p className="hint">Kamera ini tidak mengizinkan kontrol hardware lewat browser. Pakai penyesuaian software di bawah.</p>
            )}
            <Slider label="Brightness" min={50} max={150} step={1} value={soft.brightness} onChange={(v) => setSoft({ ...soft, brightness: v })} />
            <Slider label="Contrast" min={50} max={150} step={1} value={soft.contrast} onChange={(v) => setSoft({ ...soft, contrast: v })} />
            <Slider label="Saturation" min={0} max={200} step={1} value={soft.saturation} onChange={(v) => setSoft({ ...soft, saturation: v })} />
            <Slider label="Hitung mundur (detik)" min={1} max={10} step={1} value={delay} onChange={setDelay} />

            <div className="row">
              <button className="primary" disabled={!cam.active || busy}
                onClick={() => shoot(Array.from({ length: cfg.slots }, (_, i) => i))}>
                {busy ? "Sedang memotret…" : `Mulai foto (${cfg.slots}x)`}
              </button>
              <button className="ghost" onClick={reset} disabled={busy}>Hapus foto</button>
            </div>

            <div className="thumbs">
              {used.map((p, i) => (
                <button key={i} className="thumb" disabled={!cam.active || busy} onClick={() => shoot([i])}
                  title="Klik untuk foto ulang slot ini">
                  {p ? <img src={p.toDataURL("image/jpeg", 0.6)} alt={`Foto ${i + 1}`} /> : <span>{i + 1}</span>}
                </button>
              ))}
            </div>
          </section>

          {/* ===== FRAME ===== */}
          <section className="panel">
            <h2>Frame</h2>
            <label>Jumlah foto per strip
              <select value={cfg.slots} onChange={(e) => set("slots", Number(e.target.value) as 3 | 4)}>
                <option value={3}>3 foto</option>
                <option value={4}>4 foto</option>
              </select>
            </label>
            <div className="colors">
              <label>Warna frame <input type="color" value={cfg.bg} onChange={(e) => set("bg", e.target.value)} /></label>
              <label>Warna teks <input type="color" value={cfg.textColor} onChange={(e) => set("textColor", e.target.value)} /></label>
            </div>
            <label>Judul <input type="text" value={cfg.title} onChange={(e) => set("title", e.target.value)} /></label>
            <label>Teks bawah <input type="text" value={cfg.footer} onChange={(e) => set("footer", e.target.value)} /></label>
            <label className="check">
              <input type="checkbox" checked={cfg.showDate} onChange={(e) => set("showDate", e.target.checked)} /> Tampilkan tanggal
            </label>
            <Slider label="Jarak tepi" min={10} max={90} step={1} value={cfg.padding} onChange={(v) => set("padding", v)} />
            <Slider label="Jarak antar foto" min={0} max={60} step={1} value={cfg.gap} onChange={(v) => set("gap", v)} />
            <Slider label="Sudut membulat" min={0} max={60} step={1} value={cfg.radius} onChange={(v) => set("radius", v)} />
            <label>Frame PNG sendiri (600x1800, transparan)
              <input type="file" accept="image/png" onChange={(e) => onOverlay(e.target.files?.[0])} />
            </label>
            {overlay && <button className="ghost" onClick={() => setOverlay(null)}>Hapus frame PNG</button>}
          </section>

          {/* ===== HASIL ===== */}
          <section className="panel">
            <h2>Hasil</h2>
            <p className="hint">Kertas 4R berisi 2 strip. Potong di tengah.</p>
            <canvas ref={sheetRef} width={SHEET_W} height={SHEET_H} className="sheet" />

            <div className="row">
              <button className="primary" onClick={print}>Cetak 4R</button>
              <button onClick={() => download(composeSheet(used, cfg, overlay).toDataURL("image/png"), "photobooth-4R.png")}>
                Unduh 4R
              </button>
              <button onClick={() => download(composeStrip(used, cfg, overlay).toDataURL("image/png"), "photobooth-strip.png")}>
                Unduh strip
              </button>
            </div>

            <h3>Animasi GIF</h3>
            {gifUrl ? (
              <>
                <img src={gifUrl} alt="GIF hasil foto" className="gif" />
                <button onClick={() => download(gifUrl, "photobooth.gif")}>Unduh GIF</button>
              </>
            ) : (
              <p className="hint">GIF dibuat otomatis setelah semua foto terisi.</p>
            )}
          </section>
        </div>
      </main>

      {/* Hanya muncul saat mencetak */}
      {printSrc && <img src={printSrc} alt="" className="print-only" />}
    </>
  );
}

function Slider(p: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="slider">
      <span>{p.label}<b>{Number(p.value ?? p.min).toFixed(p.step < 1 ? 1 : 0)}</b></span>
      <input type="range" min={p.min} max={p.max} step={p.step} value={p.value ?? p.min}
        onChange={(e) => p.onChange(Number(e.target.value))} />
    </label>
  );
}
