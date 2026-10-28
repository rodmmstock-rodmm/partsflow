import React from "react";

export default function AppRefreshButton() {
  function refreshApp() {
    const confirmed = window.confirm(
      "โหลด PartsFlow ใหม่ทั้งหมดเพื่อรับเวอร์ชันล่าสุดหรือไม่? หากมีข้อมูลที่ยังไม่ได้บันทึก ข้อมูลนั้นอาจสูญหาย"
    );
    if (!confirmed) return;
    window.location.reload();
  }

  return (
    <button
      type="button"
      className="app-refresh-button"
      onClick={refreshApp}
      aria-label="โหลด PartsFlow เวอร์ชันล่าสุด"
      title="โหลดแอปใหม่หลัง Deploy"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 38,
        height: 38,
        flex: "0 0 auto",
        border: "1px solid #dce5ef",
        borderRadius: 11,
        background: "#fff",
        color: "#426581",
        cursor: "pointer",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width="19"
        height="19"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 7v5h-5" />
        <path d="M4.5 11a7.5 7.5 0 0 1 13-5L20 8" />
        <path d="M4 17v-5h5" />
        <path d="M19.5 13a7.5 7.5 0 0 1-13 5L4 16" />
      </svg>
    </button>
  );
}
