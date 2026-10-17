import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import QRCode from "qrcode";
import { apiGet, apiPatch, apiPost } from "../api";
import { Alert, PageHeader } from "../components/Common";
import { useFeedback } from "../feedback";

const PHASES = [
  { value: "PHASE4", slug: "phase-4", label: "Phase 4" },
  { value: "PHASE11", slug: "phase-11", label: "Phase 11" },
];
const phaseName = (value) => PHASES.find((p) => p.value === value)?.label || value;
const qrUrl = (phase, tokens) => `${window.location.origin}/cloth-rolls/scan/${encodeURIComponent(tokens?.[phase.value] || "")}`;

function Qty({ value }) {
  return <strong style={{ fontSize: 28, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>{Number(value || 0).toLocaleString("th-TH")}</strong>;
}

export default function ClothRolls() {
  const { token: qrToken } = useParams();
  const isQr = Boolean(qrToken);
  const feedback = useFeedback();
  const [data, setData] = useState({ stocks: [], transactions: [], employees: [], line_configured: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("PHASE4");
  const [type, setType] = useState("OUT");
  const [quantity, setQuantity] = useState("1");
  const [borrowerId, setBorrowerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [thresholds, setThresholds] = useState({ PHASE4: "0", PHASE11: "0" });
  const [savingThreshold, setSavingThreshold] = useState("");
  const [qrImages, setQrImages] = useState({});
  const [showQr, setShowQr] = useState(false);
  const lockedPhase = data.qr_phase ? PHASES.find((p) => p.value === data.qr_phase) : null;

  const load = useCallback(async () => {
    setError("");
    try {
      const result = await apiGet(`/cloth-rolls/${qrToken ? `?qr_token=${encodeURIComponent(qrToken)}` : ""}`, { cache: false, forceRefresh: true });
      setData(result);
      setThresholds({
        PHASE4: String(result.stocks.find((s) => s.phase === "PHASE4")?.low_stock_threshold ?? 0),
        PHASE11: String(result.stocks.find((s) => s.phase === "PHASE11")?.low_stock_threshold ?? 0),
      });
    } catch (err) {
      setError(err.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [qrToken]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (lockedPhase) setPhase(lockedPhase.value);
  }, [lockedPhase]);

  useEffect(() => {
    let active = true;
    if (!data.qr_tokens) return () => { active = false; };
    Promise.all(PHASES.map(async (p) => [p.value, await QRCode.toDataURL(qrUrl(p, data.qr_tokens), { width: 240, margin: 1 })]))
      .then((entries) => { if (active) setQrImages(Object.fromEntries(entries)); })
      .catch(() => {});
    return () => { active = false; };
  }, [data.qr_tokens]);

  const currentStock = data.stocks.find((s) => s.phase === phase);
  const transactions = useMemo(() => data.transactions || [], [data.transactions]);

  async function saveTransaction(event) {
    event.preventDefault();
    if (isQr && !loading && !lockedPhase) {
      setError("QR Code ไม่ถูกต้อง กรุณาสแกน QR Code ของ Phase 4 หรือ Phase 11");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiPost("/cloth-rolls/transactions/", {
        phase,
        transaction_type: type,
        quantity,
        borrower_employee_id: !isQr && type === "OUT" ? borrowerId : "",
        source: isQr ? "QR" : "WEB",
        qr_token: isQr ? qrToken : "",
      });
      setQuantity("1");
      setBorrowerId("");
      await load();
      feedback.showToast("บันทึกรายการสำเร็จ", "success");
    } catch (err) {
      setError(err.message || "บันทึกรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function saveThreshold(p) {
    setSavingThreshold(p.value);
    setError("");
    try {
      await apiPatch(`/cloth-rolls/settings/${p.value}/`, {
        low_stock_threshold: thresholds[p.value],
      });
      await load();
      feedback.showToast(`บันทึกจุดแจ้งเตือน ${p.label} แล้ว`, "success");
    } catch (err) {
      setError(err.message || "บันทึกจุดแจ้งเตือนไม่สำเร็จ");
    } finally {
      setSavingThreshold("");
    }
  }

  function printQr(p) {
    const win = window.open("", "_blank", "width=420,height=560");
    if (!win || !qrImages[p.value]) return;
    win.document.write(`<!doctype html><html><head><title>QR ${p.label}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:24px}img{width:260px;height:260px}h2{margin:12px 0 4px}p{color:#555;font-size:12px;overflow-wrap:anywhere}</style></head><body><img src="${qrImages[p.value]}" alt="QR Code"/><h2>เบิกจ่ายเศษผ้า - ${p.label}</h2><p>${qrUrl(p, data.qr_tokens)}</p><script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
  }

  if (isQr && !lockedPhase) {
    return <div className="page"><Alert>QR Code ไม่ถูกต้อง กรุณาใช้ QR Code ของ Phase 4 หรือ Phase 11</Alert></div>;
  }

  return (
    <div className="page cloth-rolls-page" style={{ maxWidth: 1180, margin: "0 auto" }}>
      <div style={{ padding: "18px 20px", marginBottom: 16, borderRadius: 18, background: "linear-gradient(120deg,#312e81 0%,#6d28d9 58%,#8b5cf6 100%)", color: "#fff", boxShadow: "0 12px 28px rgba(109,40,217,.18)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", right: -24, top: -42, width: 180, height: 180, borderRadius: "50%", background: "rgba(255,255,255,.08)" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div><div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".10em", opacity: .78, marginBottom: 7 }}>STOCK MANAGEMENT · CLOTH ROLLS</div><h1 style={{ margin: 0, fontSize: 25, lineHeight: 1.3, fontWeight: 700 }}>เบิกจ่ายเศษผ้า</h1><p style={{ margin: "7px 0 0", color: "rgba(255,255,255,.82)", fontSize: 15 }}>{isQr ? "สแกน QR เพื่อบันทึกการเบิกเศษผ้า" : "จัดการยอดคงเหลือ บันทึกการเบิก และรับเข้าในที่เดียว"}</p></div>
          <div style={{ padding: "9px 13px", borderRadius: 12, background: "rgba(255,255,255,.13)", border: "1px solid rgba(255,255,255,.22)", fontSize: 13, whiteSpace: "nowrap" }}><span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 99, background: "#86efac", marginRight: 8 }} />หน่วยนับ: ม้วน</div>
        </div>
      </div>
      <style>{`
        .cloth-rolls-page { color: var(--text, #172033); }
        .cloth-rolls-page > div:first-child {
          background: #fff !important; color: #172033 !important;
          padding: 16px 18px !important; margin-bottom: 14px !important;
          border: 1px solid var(--border, #e5e7eb); border-radius: 12px !important;
          box-shadow: none !important;
        }
        .cloth-rolls-page > div:first-child > div:first-child { display: none; }
        .cloth-rolls-page > div:first-child h1 { color: #172033 !important; font-size: 23px !important; }
        .cloth-rolls-page > div:first-child p { color: var(--muted, #64748b) !important; font-size: 14px !important; }
        .cloth-rolls-page > div:first-child > div > div:last-child {
          color: #475569 !important; background: #f8fafc !important;
          border: 1px solid #e2e8f0 !important; border-radius: 8px !important;
        }
        .cloth-rolls-page .card { border-radius: 12px !important; box-shadow: none !important; border-color: var(--border, #e2e8f0) !important; }
        .cloth-rolls-page section.card > div:first-child { background: #f8fafc !important; border-bottom-color: var(--border, #e2e8f0) !important; }
        .cloth-rolls-page section.card h2 { color: var(--text, #172033) !important; font-size: 17px !important; }
        .cloth-rolls-page section.card button.btn.primary { background: var(--primary, #2563eb); }
        .cloth-rolls-page section.card button.btn.ghost { border-color: #dbeafe; color: #1d4ed8; }
        .cloth-rolls-page #cloth-roll-form { border-color: var(--border, #e2e8f0) !important; }
        .cloth-rolls-page #cloth-roll-form > div:first-child { background: #f8fafc !important; border-bottom-color: var(--border, #e2e8f0) !important; }
        .cloth-rolls-page #cloth-roll-form > div:first-child h2 { color: #172033 !important; }
        .cloth-rolls-page #cloth-roll-form > div:first-child span { background: #eff6ff !important; color: #1d4ed8 !important; }
        .cloth-rolls-page #cloth-roll-form form { max-width: 680px; margin: 0 auto; }
        .cloth-rolls-page #cloth-roll-form form > label { margin-bottom: 12px !important; }
        .cloth-rolls-page #cloth-roll-form form > div { margin-bottom: 12px !important; }
        .cloth-rolls-page input, .cloth-rolls-page select { border-radius: 8px; }
        .cloth-rolls-page .data-table th { white-space: nowrap; }
        @media (max-width: 640px) {
          .cloth-rolls-page > div:first-child { padding: 14px !important; border-radius: 10px !important; }
          .cloth-rolls-page > div:first-child h1 { font-size: 21px !important; }
          .cloth-rolls-page > div:first-child > div { gap: 10px !important; }
          .cloth-rolls-page section.card > div:first-child { padding: 12px 14px !important; }
          .cloth-rolls-page section.card > div:last-child { padding: 12px !important; }
          .cloth-rolls-page #cloth-roll-form form > div:nth-of-type(1) { gap: 8px !important; }
          .cloth-rolls-page #cloth-roll-form form button { min-height: 42px; }
        }
      `}</style>
      {error && <Alert>{error}</Alert>}
      {loading ? <div className="empty">กำลังโหลดข้อมูล...</div> : <>
        {!isQr && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12, marginBottom: 16 }}>
          {PHASES.filter((p) => !isQr || p.value === lockedPhase?.value).map((p) => {
            const stock = data.stocks.find((s) => s.phase === p.value) || { quantity: 0, low_stock_threshold: 0, is_low: false };
            return <section key={p.value} className="card" style={{ padding: 0, border: phase === p.value && !isQr ? "2px solid #7c3aed" : "1px solid var(--border,#e5e7eb)", borderRadius: 14, overflow: "hidden", boxShadow: phase === p.value && !isQr ? "0 8px 22px rgba(124,58,237,.10)" : "0 3px 12px rgba(15,23,42,.035)" }}><div style={{ height: 5, background: stock.is_low ? "linear-gradient(90deg,#e11d48,#fb7185)" : phase === p.value ? "linear-gradient(90deg,#6d28d9,#a78bfa)" : "#e2e8f0" }} /><div style={{ padding: 15 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <strong style={{ fontSize: 18 }}>{p.label}</strong>
                {stock.is_low && <span className="badge danger">เหลือน้อย</span>}
              </div>
              <div style={{ margin: "10px 0 3px" }}><Qty value={stock.quantity} /></div>
              <div style={{ color: "var(--muted,#64748b)", fontSize: 14 }}>ม้วนคงเหลือ</div>
              {!isQr && <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
                <label style={{ fontSize: 13, flex: 1 }}>แจ้งเตือนเมื่อเหลือไม่เกิน (ม้วน)
                  <input type="number" min="0" step="1" value={thresholds[p.value]} onChange={(e) => setThresholds((old) => ({ ...old, [p.value]: e.target.value }))} style={{ display: "block", width: "100%", marginTop: 5 }} />
                </label>
                <button className="btn secondary" type="button" disabled={savingThreshold === p.value} onClick={() => saveThreshold(p)}>{savingThreshold === p.value ? "กำลังบันทึก" : "บันทึกเกณฑ์"}</button>
              </div>}
              {!isQr && <button className={phase === p.value ? "btn primary full" : "btn ghost full"} type="button" style={{ marginTop: 12 }} onClick={() => { setPhase(p.value); setType("OUT"); setBorrowerId(""); document.getElementById("cloth-roll-form")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{phase === p.value ? "✓ เลือก Phase นี้แล้ว" : "เลือก " + p.label + " เพื่อทำรายการ"}</button>}
              </div></section>;
          })}
        </div>}

        {isQr && <div className="card" style={{ padding: 14, marginBottom: 14, borderRadius: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden="true">🔒</span><div><strong>Phase จาก QR Code: {lockedPhase.label}</strong><div style={{ color: "var(--muted,#64748b)", fontSize: 13 }}>Phase นี้ถูกล็อก ไม่สามารถเปลี่ยนจากแบบฟอร์มได้</div></div>
        </div>}

        <section id="cloth-roll-form" className="card" style={{ padding: 0, borderRadius: 16, marginBottom: 22, overflow: "hidden", border: "1px solid #e9d5ff", boxShadow: "0 5px 18px rgba(109,40,217,.05)" }}><div style={{ padding: "14px 18px", background: "linear-gradient(90deg,#faf5ff,#fff)", borderBottom: "1px solid #f3e8ff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><div><h2 style={{ margin: 0, fontSize: 18, color: "#4c1d95" }}>{isQr ? "ฟอร์มเบิกเศษผ้า" : "บันทึกรายการเบิก / รับเข้า"}</h2><div style={{ marginTop: 3, color: "var(--muted,#64748b)", fontSize: 13 }}>{isQr ? "รายการสำหรับ " + (lockedPhase?.label || "Phase ที่ระบุใน QR") : "กำลังทำรายการสำหรับ " + phaseName(phase)}</div></div><span style={{ background: "#ede9fe", color: "#6d28d9", borderRadius: 999, padding: "5px 10px", fontSize: 12, fontWeight: 700 }}>หน่วย: ม้วน</span></div><div style={{ padding: 16 }}>
          <form onSubmit={saveTransaction}>
            {!isQr && <label className="field" style={{ display: "block", marginBottom: 14 }}><span>Phase</span>
              <select value={phase} onChange={(e) => { setPhase(e.target.value); setBorrowerId(""); }} style={{ width: "100%" }}>
                {PHASES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>}
            {!isQr && <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button type="button" className={type === "OUT" ? "btn primary" : "btn secondary"} style={{ flex: 1 }} onClick={() => setType("OUT")}>เบิก</button>
              <button type="button" className={type === "IN" ? "btn primary" : "btn secondary"} style={{ flex: 1 }} onClick={() => { setType("IN"); setBorrowerId(""); }}>รับเข้า</button>
            </div>}
            <label className="field" style={{ display: "block", marginBottom: 14 }}><span>จำนวน (ม้วน) *</span>
              <input required type="number" min="1" step="1" inputMode="numeric" pattern="[0-9]*" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </label>
            {!isQr && type === "OUT" && <label className="field" style={{ display: "block", marginBottom: 14 }}><span>ชื่อผู้เบิก *</span>
              <select required value={borrowerId} onChange={(e) => setBorrowerId(e.target.value)} style={{ width: "100%" }}>
                <option value="">เลือกชื่อผู้เบิก</option>
                {data.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_code} · {employee.name}{employee.department ? ` · ${employee.department}` : ""}</option>)}
              </select>
            </label>}
            <div style={{ color: "var(--muted,#64748b)", fontSize: 13, marginBottom: 14 }}>
              {type === "OUT" ? `คงเหลือปัจจุบัน ${currentStock?.quantity ?? 0} ม้วน` : `ยอดคงเหลือหลังรับเข้า ${(currentStock?.quantity ?? 0) + (Number(quantity) || 0)} ม้วน`}
            </div>
            <button className="btn primary full" disabled={busy || !quantity || !Number.isInteger(Number(quantity)) || Number(quantity) < 1 || (!isQr && type === "OUT" && !borrowerId)}>{busy ? "กำลังบันทึก..." : "บันทึกรายการ"}</button>
          </form>
          </div></section>

        {!isQr && <section className="card" style={{ padding: 0, borderRadius: 16, marginBottom: 22, overflow: "hidden" }}><div style={{ padding: "16px 20px", background: "#fafafa", borderBottom: "1px solid var(--border-soft)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}><div><h2 style={{ margin: 0, fontSize: 18 }}>QR Code สำหรับแต่ละ Phase</h2><p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--muted,#64748b)" }}>ใช้พิมพ์ติดจุดจัดเก็บ เพื่อเปิดฟอร์มเบิกที่ล็อก Phase ไว้</p></div><button className="btn secondary" type="button" onClick={() => setShowQr((v) => !v)}>{showQr ? "ซ่อน QR Code" : "แสดง QR Code"}</button></div></div>
          {showQr && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16, padding: 20 }}>
            {PHASES.map((p) => <div key={p.value} style={{ border: "1px solid var(--border,#e5e7eb)", borderRadius: 12, padding: 14, textAlign: "center" }}>
              <strong>{p.label}</strong>
              {qrImages[p.value] ? <img src={qrImages[p.value]} alt={`QR Code ${p.label}`} style={{ width: 180, maxWidth: "100%", display: "block", margin: "10px auto" }} /> : <div className="empty">กำลังสร้าง QR...</div>}
              <div style={{ fontSize: 11, color: "var(--muted,#64748b)", overflowWrap: "anywhere" }}>{qrUrl(p, data.qr_tokens)}</div>
              <button className="btn secondary" type="button" style={{ marginTop: 10 }} onClick={() => printQr(p)}>พิมพ์ QR</button>
            </div>)}
          </div>}
        </section>}

        {!isQr && <section className="card" style={{ padding: 0, borderRadius: 16, overflow: "hidden" }}><div style={{ padding: "16px 20px", background: "#fafafa", borderBottom: "1px solid var(--border-soft)" }}><h2 style={{ margin: 0, fontSize: 18 }}>ประวัติการเบิกจ่าย</h2><p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--muted,#64748b)" }}>รายการล่าสุดที่บันทึกผ่านหน้าเว็บหรือ QR Code</p></div><div style={{ padding: 14 }}>
          {transactions.length === 0 ? <div className="empty">ยังไม่มีประวัติการเบิกหรือรับเข้า</div> : <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%", minWidth: 760 }}>
              <thead><tr><th>วันเวลา</th><th>Phase</th><th>รายการ</th><th>จำนวน</th><th>คงเหลือหลังทำรายการ</th><th>ผู้เบิก</th><th>ผู้บันทึก</th><th>ช่องทาง</th></tr></thead>
              <tbody>{transactions.map((row) => <tr key={row.id}>
                <td>{row.created_at ? new Date(row.created_at).toLocaleString("th-TH") : "—"}</td>
                <td>{row.phase_label || phaseName(row.phase)}</td>
                <td>{row.type_label}</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{row.quantity} ม้วน</td>
                <td>{row.balance_after} ม้วน</td>
                <td>{row.borrower_name || "—"}</td>
                <td>{row.recorded_by_name || "—"}</td>
                <td>{row.source === "QR" ? "QR Code" : "หน้าเว็บ"}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          </div>
        </section>}
        {!isQr && !data.line_configured && <p style={{ marginTop: 12, color: "var(--muted,#64748b)", fontSize: 12 }}>หมายเหตุ: ต้องตั้งค่า LINE_CHANNEL_ACCESS_TOKEN และ LINE_USER_ID ใน Environment ของ Backend ก่อน ระบบจึงจะส่งแจ้งเตือน LINE ได้</p>}
      </>}
    </div>
  );
}
