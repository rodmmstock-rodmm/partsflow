import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Modal } from "./Common";

const ZXING_VERSION = "0.2.1";
const ZXING_SOURCES = [
  `https://unpkg.com/@zxing/browser@${ZXING_VERSION}/umd/zxing-browser.min.js`,
  `https://cdn.jsdelivr.net/npm/@zxing/browser@${ZXING_VERSION}/umd/zxing-browser.min.js`,
];
let zxingLoadPromise = null;

function loadZxingBrowser() {
  if (window.ZXingBrowser?.BrowserMultiFormatReader) return Promise.resolve(window.ZXingBrowser);
  if (zxingLoadPromise) return zxingLoadPromise;

  zxingLoadPromise = (async () => {
    const staleScript = document.querySelector('script[data-partsflow-zxing="0.2.1"]');
    if (staleScript && !window.ZXingBrowser?.BrowserMultiFormatReader) staleScript.remove();

    let lastError;
    for (const src of ZXING_SOURCES) {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = src;
          script.async = true;
          script.crossOrigin = "anonymous";
          script.dataset.partsflowZxing = ZXING_VERSION;
          script.onload = () => {
            if (window.ZXingBrowser?.BrowserMultiFormatReader) resolve();
            else reject(new Error("Barcode/QR scanner พร้อมใช้งานไม่สมบูรณ์"));
          };
          script.onerror = () => {
            script.remove();
            reject(new Error("โหลด Barcode/QR scanner ไม่สำเร็จ"));
          };
          document.head.appendChild(script);
        });
        return window.ZXingBrowser;
      } catch (err) {
        lastError = err;
        document.querySelector('script[data-partsflow-zxing="0.2.1"]')?.remove();
      }
    }
    throw lastError || new Error("โหลด Barcode/QR scanner ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
  })().catch((err) => {
    zxingLoadPromise = null;
    throw err;
  });

  return zxingLoadPromise;
}

function friendlyCameraError(err) {
  const n = err?.name || "";
  if (n === "NotAllowedError" || n === "PermissionDeniedError") {
    return "ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตสิทธิ์ Camera ให้เว็บไซต์ PartsFlow แล้วลองใหม่";
  }
  if (n === "NotFoundError" || n === "DevicesNotFoundError") return "ไม่พบกล้องบนอุปกรณ์นี้";
  if (n === "NotReadableError" || n === "TrackStartError") {
    return "กล้องกำลังถูกใช้งานโดยแอปอื่น กรุณาปิดแอปที่ใช้กล้องแล้วลองใหม่";
  }
  if (n === "OverconstrainedError") return "กล้องไม่รองรับการตั้งค่าที่ร้องขอ กรุณาลองเปิดกล้องใหม่";
  return err?.message || "เปิดกล้องไม่สำเร็จ";
}

export function normalizeScannedValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const obj = JSON.parse(raw);
    for (const key of ["sku", "item_id", "itemId", "code", "part", "value"]) {
      if (obj?.[key] != null && String(obj[key]).trim()) return String(obj[key]).trim();
    }
  } catch (_) {}
  try {
    const url = new URL(raw);
    for (const key of ["sku", "item_id", "item", "code", "part"]) {
      const v = url.searchParams.get(key);
      if (v?.trim()) return v.trim();
    }
    const last = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "").trim();
    if (last) return last;
  } catch (_) {}
  return raw;
}

export default function BarcodeScannerModal({ onClose, onDetected }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const readerRef = useRef(null);
  const detectedRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomRange, setZoomRange] = useState(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const retry = useCallback(() => {
    setError("");
    setTorchOn(false);
    setTorchAvailable(false);
    setZoomRange(null);
    setZoom(1);
    setRetryKey((key) => key + 1);
  }, []);

  const changeZoom = useCallback(async (nextZoom) => {
    const controls = controlsRef.current;
    if (!controls) return;
    setZoom(nextZoom);
    try {
      await controls.streamVideoConstraintsApply({ advanced: [{ zoom: nextZoom }] });
    } catch (_) {
      // Some iOS/browser camera implementations expose zoom but do not allow applying it.
      setError("อุปกรณ์นี้ไม่สามารถปรับซูมกล้องผ่านเว็บได้ สามารถขยับกล้องเข้าใกล้แทนได้");
    }
  }, []);

  const toggleTorch = useCallback(async () => {
    const controls = controlsRef.current;
    if (!controls?.switchTorch) return;
    try {
      await controls.switchTorch(!torchOn);
      setTorchOn((value) => !value);
      setError("");
    } catch (_) {
      setError("เปิดไฟฉายผ่านเว็บไม่ได้บนอุปกรณ์นี้");
    }
  }, [torchOn]);

  useEffect(() => {
    let cancelled = false;
    setStarting(true);
    setError("");
    detectedRef.current = false;

    (async () => {
      try {
        const Z = await loadZxingBrowser();
        if (cancelled || !videoRef.current) return;

        const reader = new Z.BrowserMultiFormatReader();
        readerRef.current = reader;
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 30, max: 30 },
            },
          },
          videoRef.current,
          (result, _decodeError, callbackControls) => {
            if (callbackControls && !controlsRef.current) controlsRef.current = callbackControls;
            if (!result || detectedRef.current) return;
            const value = normalizeScannedValue(result.getText?.() ?? result.text ?? "");
            if (!value) return;
            detectedRef.current = true;
            try { navigator.vibrate?.(80); } catch (_) {}
            callbackControls?.stop?.();
            onDetectedRef.current?.(value);
          }
        );

        if (cancelled) {
          controls?.stop?.();
          return;
        }
        controlsRef.current = controls;

        // Enable continuous focus when the camera and browser expose that capability.
        try {
          const caps = controls.streamVideoCapabilitiesGet((track) => track.kind === "video");
          const focusModes = caps?.focusMode;
          if (Array.isArray(focusModes) && focusModes.includes("continuous")) {
            await controls.streamVideoConstraintsApply({ advanced: [{ focusMode: "continuous" }] });
          }
          const zoomCap = caps?.zoom;
          if (zoomCap && Number.isFinite(zoomCap.min) && Number.isFinite(zoomCap.max) && zoomCap.max > zoomCap.min) {
            const initialZoom = Number.isFinite(zoomCap.min) ? zoomCap.min : 1;
            setZoomRange({ min: zoomCap.min, max: zoomCap.max, step: Math.max((zoomCap.max - zoomCap.min) / 20, 0.1) });
            setZoom(initialZoom);
          }
        } catch (_) {
          // Camera capabilities vary; scanning should continue even if optional tuning is unsupported.
        }
        setTorchAvailable(typeof controls.switchTorch === "function");
      } catch (err) {
        if (!cancelled) setError(friendlyCameraError(err));
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      try { controlsRef.current?.stop?.(); } catch (_) {}
      controlsRef.current = null;
      try { readerRef.current?.reset?.(); } catch (_) {}
      readerRef.current = null;
      const stream = videoRef.current?.srcObject;
      if (stream?.getTracks) stream.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [retryKey]);

  return (
    <Modal title="สแกน Barcode / QR Code" onClose={onClose}>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", background: "#0f172a", minHeight: 280 }}>
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            aria-label="ภาพจากกล้องสำหรับสแกนรหัส"
            style={{ display: "block", width: "100%", minHeight: 280, maxHeight: "58vh", objectFit: "contain" }}
          />
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "7%",
              right: "7%",
              top: "30%",
              height: "40%",
              border: "2px solid rgba(255,255,255,.96)",
              borderRadius: 12,
              boxShadow: "0 0 0 999px rgba(15,23,42,.25)",
              pointerEvents: "none",
            }}
          />
          {starting && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", fontSize: 13 }}>
              กำลังเปิดกล้อง…
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {torchAvailable && (
            <button type="button" className="btn ghost" onClick={toggleTorch}>
              {torchOn ? "ปิดไฟฉาย" : "เปิดไฟฉาย"}
            </button>
          )}
          {zoomRange && (
            <label style={{ display: "flex", flex: "1 1 180px", gap: 8, alignItems: "center", fontSize: 12, color: "#64748b" }}>
              ซูม
              <input
                aria-label="ปรับซูมกล้อง"
                type="range"
                min={zoomRange.min}
                max={zoomRange.max}
                step={zoomRange.step}
                value={Math.min(zoomRange.max, Math.max(zoomRange.min, zoom))}
                onChange={(event) => changeZoom(Number(event.target.value))}
                style={{ flex: 1, minWidth: 100 }}
              />
            </label>
          )}
        </div>

        <small style={{ color: "#64748b", lineHeight: 1.6 }}>
          เล็ง Barcode หรือ QR Code ให้อยู่ในกรอบ ถือกล้องให้นิ่งและให้ฉลากมีแสงเพียงพอ ระบบจะอ่านและค้นหาให้อัตโนมัติ
          {zoomRange ? " · อุปกรณ์นี้รองรับการซูมผ่านเว็บ" : ""}
        </small>
        <Alert>{error}</Alert>
        <div className="modal-actions">
          {error && !starting && (
            <button type="button" className="btn ghost" onClick={retry}>ลองเปิดกล้องใหม่</button>
          )}
          <button type="button" className="btn ghost" onClick={onClose}>ปิดกล้อง</button>
        </div>
      </div>
    </Modal>
  );
}
