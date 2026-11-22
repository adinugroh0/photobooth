"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type Cap = { min: number; max: number; step: number };

/** Pengaturan hardware yang ditampilkan jika didukung kamera/browser. */
export const HW_CONTROLS = [
  { key: "zoom", label: "Zoom" },
  { key: "exposureCompensation", label: "Exposure" },
  { key: "brightness", label: "Brightness (kamera)" },
  { key: "contrast", label: "Contrast (kamera)" },
  { key: "saturation", label: "Saturation (kamera)" },
  { key: "sharpness", label: "Sharpness" },
  { key: "colorTemperature", label: "White balance (K)" },
  { key: "focusDistance", label: "Fokus" },
] as const;

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [resolution, setResolution] = useState("1280x720");
  const [caps, setCaps] = useState<Record<string, Cap>>({});
  const [values, setValues] = useState<Record<string, number>>({});
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");

  const stop = useCallback(() => {
    (videoRef.current?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    trackRef.current = null;
    setActive(false);
  }, []);

  const start = useCallback(
    async (id?: string, res?: string) => {
      try {
        setError("");
        stop();
        const [w, h] = (res ?? resolution).split("x").map(Number);
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { deviceId: id ? { exact: id } : undefined, width: { ideal: w }, height: { ideal: h } },
        });
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const track = stream.getVideoTracks()[0];
        trackRef.current = track;
        const c = (track.getCapabilities?.() ?? {}) as Record<string, any>;
        const s = (track.getSettings?.() ?? {}) as Record<string, any>;
        const nextCaps: Record<string, Cap> = {};
        const nextVals: Record<string, number> = {};
        for (const { key } of HW_CONTROLS) {
          const cap = c[key];
          if (cap && typeof cap.min === "number" && typeof cap.max === "number") {
            nextCaps[key] = { min: cap.min, max: cap.max, step: cap.step || (cap.max - cap.min) / 100 };
            nextVals[key] = s[key] ?? cap.min;
          }
        }
        setCaps(nextCaps);
        setValues(nextVals);
        setDeviceId(s.deviceId ?? id ?? "");
        setActive(true);

        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter((d) => d.kind === "videoinput"));
      } catch (e) {
        setError(
          e instanceof Error
            ? `${e.name}: ${e.message}. Pastikan izin kamera diberikan dan situs dibuka lewat HTTPS atau localhost.`
            : "Kamera tidak bisa dibuka."
        );
        setActive(false);
      }
    },
    [resolution, stop]
  );

  const setHw = useCallback(async (key: string, value: number) => {
    setValues((v) => ({ ...v, [key]: value }));
    try {
      await trackRef.current?.applyConstraints({ advanced: [{ [key]: value }] } as unknown as MediaTrackConstraints);
    } catch {
      /* kamera menolak nilai ini */
    }
  }, []);

  useEffect(() => stop, [stop]);

  return { videoRef, devices, deviceId, setDeviceId, resolution, setResolution, caps, values, active, error, start, stop, setHw };
}
