import { useEffect, useRef, useState } from "react";
import { apiUpload } from "../api";
import { useAuth } from "../auth";
import { Alert, Modal } from "./Common";

export default function EmployeeProfileAvatar() {
  const auth = useAuth();
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const employee = auth.employee;
  const image = preview || employee?.image_url || "";

  // Employee photos are stored centrally. Refresh the signed-in employee
  // metadata periodically and when this device/tab becomes active again so
  // another device's photo change is reflected without logging in again.
  useEffect(() => {
    if (!employee?.id) return undefined;
    const refreshProfile = () => {
      if (document.visibilityState === "visible") {
        void auth.refresh().catch(() => {});
      }
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

  function chooseFile(event) {
    const next = event.target.files?.[0] || null;
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : "");
    setError("");
  }

  async function upload() {
    if (!file || !employee?.id) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("image", file);
      await apiUpload(`/employees/${employee.id}/image/`, body);
      await auth.refresh();
      if (preview) URL.revokeObjectURL(preview);
      setFile(null);
      setPreview("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (preview) URL.revokeObjectURL(preview);
    setOpen(false);
    setFile(null);
    setPreview("");
    if (inputRef.current) inputRef.current.value = "";
    setError("");
  }

  return (
    <>
      <button type="button" className="modernize-profile-avatar-button" onClick={() => setOpen(true)} aria-label="ดูรูปโปรไฟล์">
        {employee?.image_url ? <img className="modernize-profile-avatar-image" src={employee.image_url} alt={employee.name || "รูปพนักงาน"} /> : <span className="modernize-profile-avatar">{(employee?.name || "PF").trim().slice(0, 1).toUpperCase()}</span>}
      </button>
      {open && (
        <Modal title="รูปโปรไฟล์พนักงาน" onClose={close} className="employee-photo-modal">
          <div className="employee-photo-modal-content" style={{display:"grid",justifyItems:"center",gap:14}}>
            <button type="button" className="btn ghost employee-photo-mobile-close" onClick={close} aria-label="ปิดหน้าต่างรูปโปรไฟล์">ปิด ×</button>
            {image ? <img src={image} alt="รูปโปรไฟล์" style={{width:"min(100%,320px)",aspectRatio:"1",objectFit:"cover",borderRadius:16,border:"1px solid #dbe3ec"}}/> : <div className="modernize-profile-avatar" style={{width:120,height:120,fontSize:42}}>{(employee?.name||"PF").trim().slice(0,1).toUpperCase()}</div>}
            <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
              <button type="button" className="btn ghost" onClick={() => inputRef.current?.click()}>{employee?.image_url ? "เปลี่ยนรูปภาพ" : "เพิ่มรูปภาพ"}</button>
              {file && <button type="button" className="btn primary" disabled={busy} onClick={upload}>{busy ? "กำลังอัปโหลด..." : "บันทึกรูปภาพ"}</button>}
            </div>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={chooseFile} style={{display:"none"}}/>
            <small style={{color:"#718096"}}>รองรับ JPG, PNG, WEBP และ GIF · ไม่เกิน 10 MB</small>
            <Alert>{error}</Alert>
          </div>
        </Modal>
      )}
    </>
  );
}
