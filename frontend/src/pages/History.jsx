import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPatch } from "../api";
import { useAuth } from "../auth";
import { Alert, Modal, PageHeader, SearchableSelect, fmt } from "../components/Common";
import { useFeedback } from "../feedback";
import { useOptions } from "../optionsContext";

const MONTHS_TH = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

const pad = (value) => String(value).padStart(2, "0");

function monthRange(year, month) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    from: `${year}-${pad(month + 1)}-01`,
    to: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
  };
}

const EMPTY_META = {
  count: 0,
  page: 1,
  page_size: 100,
  total_pages: 1,
  has_next: false,
  has_previous: false,
};

export function EditHistory({ row, options, onClose, onSaved }) {
  const [quantity, setQuantity] = useState(row.quantity);
  const [machineId, setMachineId] = useState(
    row.machine ? (options.machines || []).find((x) => x.code === row.machine)?.id || "" : "",
  );
  const [requesterId, setRequesterId] = useState(row.requester_id || "");
  const [recorderId, setRecorderId] = useState(row.recorder_id || "");
  const [remark, setRemark] = useState(row.remark || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiPatch(`/history/${row.id}/`, {
        quantity,
        machine_id: machineId,
        requester_id: requesterId,
        recorder_id: recorderId,
        remark,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="แก้ไขข้อมูล History" onClose={onClose}>
      <form onSubmit={save}>
        <div className="form-grid">
          <label className="field">
            <span>จำนวน *</span>
            <input type="number" min="0.0001" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
          </label>
          <label className="field">
            <span>เครื่องจักร</span>
            <SearchableSelect value={machineId} options={options.machines || []} onChange={setMachineId} getLabel={(x) => x.code} getSearchText={(x) => `${x.code || ""} ${x.name || ""} ${x.location || ""}`} placeholder="พิมพ์รหัส Machine" />
          </label>
          <label className="field">
            <span>ผู้เบิก</span>
            <SearchableSelect value={requesterId} options={options.employees || []} onChange={setRequesterId} getLabel={(x) => x.name} getSearchText={(x) => `${x.employee_code || ""} ${x.name || ""} ${x.department || ""}`} placeholder="พิมพ์ชื่อพนักงาน" />
          </label>
          <label className="field">
            <span>ผู้บันทึก</span>
            <SearchableSelect value={recorderId} options={options.employees || []} onChange={setRecorderId} getLabel={(x) => x.name} getSearchText={(x) => `${x.employee_code || ""} ${x.name || ""} ${x.department || ""}`} placeholder="พิมพ์ชื่อพนักงาน" />
          </label>
          <label className="field span2">
            <span>Remark</span>
            <textarea rows="3" value={remark} onChange={(e) => setRemark(e.target.value)} />
          </label>
        </div>
        <Alert>{error}</Alert>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn primary" disabled={busy}>บันทึก</button>
        </div>
      </form>
    </Modal>
  );
}

function HistoryTable({ rows, auth, onEdit, onDelete }) {
  const canAction = auth.can("can_edit_history") || auth.can("can_delete_history");
  const head = { position: "sticky", right: 0, zIndex: 4, background: "#f8fafc", boxShadow: "-8px 0 12px rgba(15,23,42,.04)" };
  const cell = { position: "sticky", right: 0, zIndex: 3, background: "#fff", boxShadow: "-8px 0 12px rgba(15,23,42,.04)" };
  return (
    <div className="history-table-wrap" style={{ overflowX: "auto", width: "100%" }}>
      <table className="history-table">
        <thead><tr><th>วัน / เวลา</th><th>ประเภท</th><th>Part ID</th><th>Part Name</th><th>Part Detail</th><th>Maker</th><th>Location</th><th>เครื่องจักร</th><th>ผู้เบิก</th><th>ผู้บันทึก</th><th>จำนวน</th><th>Unit</th><th>Remark</th>{canAction && <th style={head}>Action</th>}</tr></thead>
        <tbody>{rows.map((row) => (
          <tr key={row.id}>
            <td><b>{row.date}</b><small>{row.time}</small></td>
            <td><span className={`status ${row.type === "IN" ? "success" : row.type === "OUT" ? "danger" : "warning"}`}>{row.type === "IN" ? "รับเข้า" : row.type === "OUT" ? "เบิกออก" : "ปรับยอด"}</span></td>
            <td><b>{row.item_id}</b></td><td>{row.part_name}</td><td>{row.part_detail || "-"}</td><td>{row.maker || "-"}</td><td>{row.location || "-"}</td>
            <td>{row.type === "OUT" ? row.machine || "-" : "-"}</td><td>{row.type === "OUT" ? row.requester || "-" : "-"}</td><td>{row.recorder || "-"}</td>
            <td><b>{fmt(row.quantity)}</b></td><td>{row.unit}</td><td>{row.remark || "-"}</td>
            {canAction && <td style={cell}><div className="history-actions" style={{ display: "flex", gap: 5, flexWrap: "nowrap" }}>{auth.can("can_edit_history") && <button className="mini" onClick={() => onEdit(row)}>แก้ไข</button>}{auth.can("can_delete_history") && <button className="mini danger" onClick={() => onDelete(row)}>ลบ</button>}</div></td>}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export default function History() {
  const auth = useAuth();
  const { confirm } = useFeedback();
  const { options } = useOptions();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(EMPTY_META);
  const [monthlyCounts, setMonthlyCounts] = useState(null);
  const [type, setType] = useState("ALL");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [requester, setRequester] = useState("");
  const [recorder, setRecorder] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState(null);
  const [loading, setLoading] = useState(true);
  const range = useMemo(() => monthRange(year, month), [year, month]);

  async function load(forceRefresh = false) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        type,
        q: search,
        requester_id: requester,
        recorder_id: recorder,
        page: String(page),
        page_size: "100",
        date_from: range.from,
        date_to: range.to,
        summary_year: String(year),
      });
      const response = await apiGet(`/history/?${params}`, { forceRefresh });
      setRows(response.results || []);
      setMeta({ ...EMPTY_META, ...response });
      setMonthlyCounts(
        Array.isArray(response.monthly_counts) ? response.monthly_counts : null,
      );
    } catch (err) {
      setError(err.message);
      setRows([]);
      setMeta(EMPTY_META);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [type, requester, recorder, page, search, range.from, range.to]);

  function applySearch() {
    const next = q.trim();
    if (page === 1 && search === next) load(true);
    else {
      setPage(1);
      setSearch(next);
    }
  }

  async function remove(row) {
    const ok = await confirm(`ยืนยันลบ/ยกเลิกรายการ ${row.item_id} ?`, {
      title: "ยืนยันการลบ",
      confirmLabel: "ลบ",
      danger: true,
    });
    if (!ok) return;
    try {
      await apiDelete(`/history/${row.id}/delete/`);
      if (page !== 1) setPage(1);
      else load(true);
    } catch (err) {
      setError(err.message);
    }
  }

  const firstRow = meta.count ? (meta.page - 1) * meta.page_size + 1 : 0;
  const lastRow = Math.min(meta.page * meta.page_size, meta.count);

  return <>
    <PageHeader title="ประวัติการเบิก / รับเข้า (History)" subtitle={`${MONTHS_TH[month]} ${year} · โหลดครั้งละไม่เกิน 100 รายการ`} />
    <Alert>{error}</Alert>

    <div className="order-nav-v9">
      <div className="order-month-head-v9">
        <button onClick={() => { setMonthlyCounts(null); setPage(1); setYear((value) => value - 1); }}>‹</button>
        <b>{year}</b>
        <button onClick={() => { setMonthlyCounts(null); setPage(1); setYear((value) => value + 1); }}>›</button>
        <span>เลือกเดือนเพื่อโหลด History</span>
      </div>
      <div className="order-month-tabs-v9">
        {MONTHS_TH.map((label, index) => (
          <button key={label} className={month === index ? "active" : ""} onClick={() => { setMonth(index); setPage(1); }}>
            <span>{label}{Array.isArray(monthlyCounts) ? ` (${fmt(monthlyCounts[index] || 0)})` : ""}</span>
            {year === now.getFullYear() && index === now.getMonth() && <small>ปัจจุบัน</small>}
          </button>
        ))}
      </div>
    </div>

    <section className="panel">
      <div className="tab-row history-tabs">{[["ALL", "ทั้งหมด"], ["IN", "รับเข้า"], ["OUT", "เบิกออก"], ["ADJUSTMENT", "ปรับยอด"]].map(([value, label]) => <button key={value} className={`tab ${type === value ? "active" : ""}`} onClick={() => { setType(value); setPage(1); }}>{label}</button>)}</div>
      <div className="toolbar wrap">
        <input className="search-input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applySearch(); }} placeholder="ค้นหา Part ID / Part / Machine..." />
        <select value={requester} onChange={(e) => { setRequester(e.target.value); setPage(1); }}><option value="">ผู้เบิกทั้งหมด</option>{(options.employees || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select value={recorder} onChange={(e) => { setRecorder(e.target.value); setPage(1); }}><option value="">ผู้บันทึกทั้งหมด</option>{(options.employees || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <button className="btn ghost" onClick={applySearch}>ค้นหา</button>
      </div>
      {loading ? (
        <div className="empty">กำลังโหลด {MONTHS_TH[month]} {year}...</div>
      ) : rows.length === 0 ? (
        <div className="empty">ไม่พบ History ในเดือนนี้</div>
      ) : (
        <HistoryTable rows={rows} auth={auth} onEdit={setEdit} onDelete={remove} />
      )}

      {!loading && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 14 }}>
          <small>{meta.count ? `แสดง ${firstRow}-${lastRow} จาก ${meta.count} รายการในเดือนนี้` : "ไม่พบรายการ"}</small>
          {meta.total_pages > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button className="btn ghost" disabled={!meta.has_previous} onClick={() => setPage((current) => Math.max(1, current - 1))}>← ก่อนหน้า</button>
              <span>หน้า {meta.page} / {meta.total_pages}</span>
              <button className="btn ghost" disabled={!meta.has_next} onClick={() => setPage((current) => current + 1)}>หน้าถัดไป →</button>
            </div>
          )}
        </div>
      )}
    </section>
    {edit && <EditHistory row={edit} options={options} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(true); }} />}
  </>;
}
