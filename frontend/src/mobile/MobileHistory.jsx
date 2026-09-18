import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet } from "../api";
import { useAuth } from "../auth";
import { Alert, fmt } from "../components/Common";
import { EditHistory } from "../pages/History";
import { MobileEmpty, MobileLoading, MobilePage, MobileSearch } from "./MobileCommon";

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const pad = (value) => String(value).padStart(2, "0");

function monthRange(year, month) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    from: `${year}-${pad(month + 1)}-01`,
    to: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
  };
}

export default function MobileHistory() {
  const auth = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [rows, setRows] = useState([]);
  const [options, setOptions] = useState({});
  const [meta, setMeta] = useState({ page: 1, total_pages: 1 });
  const [monthlyCounts, setMonthlyCounts] = useState(null);
  const [type, setType] = useState("ALL");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState(null);
  const range = useMemo(() => monthRange(year, month), [year, month]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setSearch(q.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [q]);

  async function load(forceRefresh = false) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        type,
        q: search,
        requester_id: "",
        recorder_id: "",
        page: String(page),
        page_size: "100",
        date_from: range.from,
        date_to: range.to,
        summary_year: String(year),
      });
      const [history, optionRows] = await Promise.all([
        apiGet(`/history/?${params}`, { forceRefresh }),
        apiGet("/options/", { forceRefresh }),
      ]);
      setRows(history.results || []);
      setMeta(history || {});
      setMonthlyCounts(
        Array.isArray(history.monthly_counts) ? history.monthly_counts : null,
      );
      setOptions(optionRows || {});
    } catch (err) {
      setError(err.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [type, page, search, range.from, range.to]);

  async function remove(row) {
    if (!confirm(`ยืนยันลบ/ยกเลิกรายการ ${row.item_id}?`)) return;
    try {
      await apiDelete(`/history/${row.id}/delete/`);
      if (page !== 1) setPage(1);
      else await load(true);
    } catch (err) {
      setError(err.message);
    }
  }

  return <MobilePage title="History" subtitle={`${MONTHS[month]} ${year} · ครั้งละไม่เกิน 100 รายการ`} actions={<button className="m-icon-action" onClick={() => load(true)}>↻</button>}>
    <Alert>{error}</Alert>
    <div className="m-segment wide">{[["ALL", "ทั้งหมด"], ["IN", "รับเข้า"], ["OUT", "เบิกออก"], ["ADJUSTMENT", "ปรับยอด"]].map(([key, label]) => <button key={key} className={type === key ? "active" : ""} onClick={() => { setType(key); setPage(1); }}>{label}</button>)}</div>

    <div className="m-month-nav-v9">
      <div>
        <button onClick={() => { setMonthlyCounts(null); setPage(1); setYear((value) => value - 1); }}>‹</button>
        <b>{year}</b>
        <button onClick={() => { setMonthlyCounts(null); setPage(1); setYear((value) => value + 1); }}>›</button>
      </div>
      <div className="m-month-tabs-v9">
        {MONTHS.map((label, index) => (
          <button key={label} className={month === index ? "active" : ""} onClick={() => { setMonth(index); setPage(1); }}>
            {label}{Array.isArray(monthlyCounts) && ` (${fmt(monthlyCounts[index] || 0)})`}
            {year === now.getFullYear() && index === now.getMonth() && <small>ปัจจุบัน</small>}
          </button>
        ))}
      </div>
    </div>

    <MobileSearch value={q} onChange={setQ} placeholder="Item / Part / Machine / Employee..." />
    {loading ? <MobileLoading text={`กำลังโหลด ${MONTHS[month]} ${year}...`} /> : rows.length === 0 ? <MobileEmpty text="ไม่พบ History ในเดือนนี้" /> : <div className="m-card-list">{rows.map((row) => <article className="m-history-card" key={row.id}>
      <div className="m-row-between"><div><b>{row.item_id}</b><small>{row.date} {row.time}</small></div><span className={`m-tx ${row.type === "IN" ? "receive" : row.type === "OUT" ? "issue" : "adjust"}`}>{row.type === "IN" ? "รับเข้า" : row.type === "OUT" ? "เบิกออก" : "ปรับยอด"}</span></div>
      <h3>{row.part_name}</h3><p>{row.part_detail || "-"}</p>
      <div className="m-history-qty"><span>จำนวน</span><strong>{fmt(row.quantity)} {row.unit}</strong></div>
      <div className="m-info-grid"><span>Machine<b>{row.machine || "-"}</b></span><span>ผู้เบิก<b>{row.requester || "-"}</b></span><span>ผู้บันทึก<b>{row.recorder || "-"}</b></span><span>Location<b>{row.location || "-"}</b></span></div>
      {row.remark && <div className="m-note">{row.remark}</div>}
      {(auth.can("can_edit_history") || auth.can("can_delete_history")) && <div className="m-card-actions">{auth.can("can_edit_history") && <button onClick={() => setEdit(row)}>แก้ไข</button>}{auth.can("can_delete_history") && <button className="danger" onClick={() => remove(row)}>ลบ</button>}</div>}
    </article>)}</div>}
    {!loading && <div className="m-pagination">
      {meta.total_pages > 1 && <button disabled={!meta.has_previous} onClick={() => setPage((current) => Math.max(1, current - 1))}>← ก่อนหน้า</button>}
      <span>{meta.total_pages > 1 ? `${meta.page || 1} / ${meta.total_pages || 1} · ${meta.count || 0} รายการ` : `ทั้งหมด ${meta.count || 0} รายการ`}</span>
      {meta.total_pages > 1 && <button disabled={!meta.has_next} onClick={() => setPage((current) => current + 1)}>หน้าถัดไป →</button>}
    </div>}
    {edit && <EditHistory row={edit} options={options} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(true); }} />}
  </MobilePage>;
}
