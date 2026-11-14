import { useEffect, useRef, useState } from "react";
import { apiUpload } from "../api";
import { useAuth } from "../auth";
import { Alert, Modal } from "./Common";

const CROP_SIZE = 280;
const OUTPUT_SIZE = 512;

export default function EmployeeProfileAvatar() {
  const auth = useAuth();
  const inputRef = useRef(null);
  const dragRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [sourceFile, setSourceFile] = useState(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceSize, setSourceSize] = useState(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedFile, setCroppedFile] = useState(null);
  const [croppedPreview, setCroppedPreview] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const employee = auth.employee;
  const image = croppedPreview || employee?.image_url || "";
  const baseScale = sourceSize
    ? Math.max(CROP_SIZE / sourceSize.width, CROP_SIZE / sourceSize.height)
    : 1;
  const renderedWidth = sourceSize ? sourceSize.width * baseScale * zoom : CROP_SIZE;
  const renderedHeight = sourceSize ? sourceSize.height * baseScale * zoom : CROP_SIZE;

  // Employee photos are stored centrally. Refresh the signed-in employee
  // metadata periodically and when this device/tab becomes active again.
  useEffect(() => {
    if (!employee?.id) return undefined;
    const refreshProfile = () => {
      if (document.visibilityState === "visible") void auth.refresh().catch(() => {});
    };
    const intervalId = window.setInterval(refreshProfile, 60000);
    window.addEventListener("focus", refreshProfile);
    document.addEventListener("visibilitychange", refreshProfile);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshProfile);
      document.removeEventListener("visibilitychange", refreshProfile);
    };
  }, [employee?.id]);

  useEffect(() => {
    if (!sourceUrl) return undefined;
    return () => URL.revokeObjectURL(sourceUrl);
  }, [sourceUrl]);

  useEffect(() => {
    if (!croppedPreview) return undefined;
    return () => URL.revokeObjectURL(croppedPreview);
  }, [croppedPreview]);

  function chooseFile(event) {
    const next = event.target.files?.[0] || null;
    if (!next) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(next.type)) {
      setError("กรุณาเลือกไฟล์ JPG, PNG, WEBP หรือ GIF");
      event.target.value = "";
      return;
    }
    if (next.size > 10 * 1024 * 1024) {
      setError("ขนาดรูปภาพต้องไม่เกิน 10 MB");
      event.target.value = "";
      return;
    }
    const url = URL.createObjectURL(next);
    const probe = new Image();
    probe.onload = () => {
      setSourceFile(next);
      setSourceUrl(url);
      setSourceSize({ width: probe.naturalWidth, height: probe.naturalHeight });
      setOffset({ x: 0, y: 0 });
      setZoom(1);
      setCroppedFile(null);
      setCroppedPreview("");
      setError("");
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      setError("ไม่สามารถเปิดไฟล์รูปภาพนี้ได้");
    };
    probe.src = url;
    event.target.value = "";
  }

  function boundedOffset(next, nextZoom = zoom) {
    if (!sourceSize) return next;
    const width = sourceSize.width * baseScale * nextZoom;
    const height = sourceSize.height * baseScale * nextZoom;
    return {
      x: Math.max(-(width - CROP_SIZE) / 2, Math.min((width - CROP_SIZE) / 2, next.x)),
      y: Math.max(-(height - CROP_SIZE) / 2, Math.min((height - CROP_SIZE) / 2, next.y)),
    };
  }

  function startDrag(event) {
    if (!sourceUrl || croppedFile) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, offset };
  }

  function moveDrag(event) {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    setOffset(boundedOffset({ x: dragRef.current.offset.x + dx, y: dragRef.current.offset.y + dy }));
  }

  function endDrag() {
    dragRef.current = null;
  }

  function changeZoom(value) {
    const nextZoom = Number(value);
    setZoom(nextZoom);
    setOffset((current) => boundedOffset(current, nextZoom));
  }

  async function applyCrop() {
    if (!sourceFile || !sourceUrl || !sourceSize) return;
    try {
      const source = new Image();
      source.src = sourceUrl;
      await source.decode();
      const scale = baseScale * zoom;
      const sx = (renderedWidth / 2 - CROP_SIZE / 2 - offset.x) / scale;
      const sy = (renderedHeight / 2 - CROP_SIZE / 2 - offset.y) / scale;
      const sourceCropSize = CROP_SIZE / scale;
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("เบราว์เซอร์ไม่รองรับการครอปรูปภาพ");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(source, sx, sy, sourceCropSize, sourceCropSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      if (!blob) throw new Error("สร้างรูปภาพที่ครอปไม่สำเร็จ");
      const nextFile = new File([blob], (sourceFile.name.replace(/\.[^.]+$/, "") || "profile-photo") + "-cropped.jpg", { type: "image/jpeg" });
      setCroppedFile(nextFile);
      setCroppedPreview(URL.createObjectURL(blob));
      setError("");
    } catch (err) {
      setError(err.message || "ครอปรูปภาพไม่สำเร็จ");
    }
  }

  async function upload() {
    if (!croppedFile || !employee?.id) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("image", croppedFile);
      await apiUpload(`/employees/${employee.id}/image/`, body);
      await auth.refresh();
      close();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setSourceUrl("");
    setCroppedPreview("");
    setSourceFile(null);
    setSourceSize(null);
    setOffset({ x: 0, y: 0 });
    setZoom(1);
    setCroppedFile(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <>
      <button type="button" className="modernize-profile-avatar-button" onClick={() => setOpen(true)} aria-label="ดูรูปโปรไฟล์">
        {employee?.image_url ? <img className="modernize-profile-avatar-image" src={employee.image_url} alt={employee.name || "รูปพนักงาน"} /> : <span className="modernize-profile-avatar">{(employee?.name || "PF").trim().slice(0, 1).toUpperCase()}</span>}
      </button>
      {open && (
        <Modal title="รูปโปรไฟล์พนักงาน" onClose={close} className="employee-photo-modal" portal>
          <div className="employee-photo-modal-content" style={{ display: "grid", justifyItems: "center", gap: 14 }}>
            {sourceUrl && !croppedFile ? (
              <>
                <div
                  className="employee-photo-crop-viewport"
                  style={{ width: CROP_SIZE, height: CROP_SIZE }}
                  onPointerDown={startDrag}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onLostPointerCapture={endDrag}
                  role="img"
                  aria-label="ลากรูปเพื่อจัดตำแหน่งภายในกรอบสี่เหลี่ยม"
                >
                  <img
                    src={sourceUrl}
                    alt="รูปภาพสำหรับครอป"
                    draggable="false"
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      width: renderedWidth,
                      height: renderedHeight,
                      maxWidth: "none",
                      maxHeight: "none",
                      objectFit: "fill",
                      transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
                      pointerEvents: "none",
                      userSelect: "none",
                    }}
                  />
                  <div className="employee-photo-crop-frame" />
                </div>
                <div className="employee-photo-zoom-control">
                  <span>−</span>
                  <input aria-label="ปรับขนาดรูปภาพ" type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => changeZoom(event.target.value)} />
                  <span>＋</span>
                </div>
                <small style={{ color: "#718096" }}>ลากรูปเพื่อจัดตำแหน่ง และเลื่อนแถบเพื่อซูม</small>
                <button type="button" className="btn primary" onClick={applyCrop}>ใช้รูปภาพนี้</button>
              </>
            ) : image ? (
              <img src={image} alt="ตัวอย่างรูปโปรไฟล์" style={{ width: "min(100%,320px)", aspectRatio: "1", objectFit: "cover", borderRadius: 16, border: "1px solid #dbe3ec" }} />
            ) : (
              <div className="modernize-profile-avatar" style={{ width: 120, height: 120, fontSize: 42 }}>{(employee?.name || "PF").trim().slice(0, 1).toUpperCase()}</div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <button type="button" className="btn ghost" onClick={() => inputRef.current?.click()}>{sourceUrl || employee?.image_url ? "เลือก/ปรับรูปภาพ" : "เพิ่มรูปภาพ"}</button>
              {croppedFile && <button type="button" className="btn primary" disabled={busy} onClick={upload}>{busy ? "กำลังอัปโหลด..." : "บันทึกรูปภาพ"}</button>}
            </div>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={chooseFile} style={{ display: "none" }} />
            <small style={{ color: "#718096" }}>รองรับ JPG, PNG, WEBP และ GIF · ไม่เกิน 10 MB · บันทึกเป็นภาพสี่เหลี่ยมจัตุรัส</small>
            <Alert>{error}</Alert>
          </div>
        </Modal>
      )}
    </>
  );
}
