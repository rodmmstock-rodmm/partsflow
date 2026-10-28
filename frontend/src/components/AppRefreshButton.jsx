import { useEffect, useRef, useState } from "react";

export default function AppRefreshButton() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!confirmOpen) return undefined;
    cancelRef.current?.focus();
    function onKeyDown(event) {
      if (event.key === "Escape") setConfirmOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmOpen]);

  function refreshApp() {
    setConfirmOpen(true);
  }

  return (
    <>
      <button
        type="button"
        className="app-refresh-button"
        onClick={refreshApp}
        aria-label="โหลด PartsFlow เวอร์ชันล่าสุด"
        title="โหลดแอปใหม่หลัง Deploy"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 40, height: 40, flex: "0 0 auto", border: "1px solid #d7e5f2",
          borderRadius: 13, background: "linear-gradient(180deg,#fff 0%,#f4f9ff 100%)",
          color: "#3475ad", cursor: "pointer", boxShadow: "0 2px 6px rgba(39,91,139,.08)",
          transition: "transform .18s ease, box-shadow .18s ease, border-color .18s ease"
        }}
      >
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 7v5h-5" />
          <path d="M4.6 11a7.5 7.5 0 0 1 13-5L20 8" />
          <path d="M4 17v-5h5" />
          <path d="M19.4 13a7.5 7.5 0 0 1-13 5L4 16" />
        </svg>
      </button>

      {confirmOpen && (
        <div
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmOpen(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 10000, display: "grid", placeItems: "center",
            padding: 20, background: "rgba(15, 32, 51, .42)", backdropFilter: "blur(5px)"
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="refresh-dialog-title"
            style={{
              width: "min(100%, 420px)", boxSizing: "border-box", borderRadius: 20,
              padding: 24, background: "#fff", border: "1px solid #e0eaf3",
              boxShadow: "0 24px 70px rgba(15,45,75,.24)", color: "#18344f"
            }}>
            <div style={{
              width: 48, height: 48, borderRadius: 15, display: "grid", placeItems: "center",
              background: "#edf6ff", color: "#3475ad", marginBottom: 16
            }}>
              <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 7v5h-5M4.6 11a7.5 7.5 0 0 1 13-5L20 8M4 17v-5h5M19.4 13a7.5 7.5 0 0 1-13 5L4 16" />
              </svg>
            </div>
            <h2 id="refresh-dialog-title" style={{ margin: "0 0 9px", fontSize: 20, fontWeight: 750 }}>
              โหลด PartsFlow ใหม่?
            </h2>
            <p style={{ margin: "0 0 22px", color: "#647b91", fontSize: 14, lineHeight: 1.7 }}>
              ระบบจะโหลดหน้าเว็บใหม่เพื่อรับเวอร์ชันล่าสุด หากกำลังกรอกข้อมูลที่ยังไม่ได้บันทึก ข้อมูลนั้นอาจสูญหาย
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
              <button ref={cancelRef} type="button" onClick={() => setConfirmOpen(false)}
                style={{ minHeight: 42, padding: "0 16px", borderRadius: 11, border: "1px solid #d9e4ee", background: "#fff", color: "#526b82", fontWeight: 650, cursor: "pointer" }}>
                ยกเลิก
              </button>
              <button type="button" onClick={() => window.location.reload()}
                style={{ minHeight: 42, padding: "0 18px", borderRadius: 11, border: "1px solid #347bb8", background: "linear-gradient(135deg,#438bc9,#2e6fa8)", color: "#fff", fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 10px rgba(52,117,173,.2)" }}>
                โหลดใหม่
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
