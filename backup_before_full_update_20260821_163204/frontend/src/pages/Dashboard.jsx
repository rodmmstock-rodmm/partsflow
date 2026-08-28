import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../api";
import { useAuth } from "../auth";

const asResults = (value) => Array.isArray(value) ? value : value?.results || [];
const num = (value) => Number(value || 0);
const fmt = (value) => Number(value || 0).toLocaleString("th-TH");

function getField(obj, paths, fallback = "") {
  for (const path of paths) {
    if (obj?.[path] !== undefined && obj?.[path] !== null && obj?.[path] !== "") {
      return obj[path];
    }
  }
  return fallback;
}

function partStatus(part) {
  const qty = num(getField(part, ["quantity", "stock_quantity"], 0));
  const min = num(getField(part, ["min_stock", "minimum_stock"], 0));
  if (qty <= 0) return "out";
  if (min > 0 && qty < min) return "low";
  return "normal";
}

function statusLabel(status) {
  if (status === "out") return "Out of Stock";
  if (status === "low") return "Low Stock";
  return "Normal";
}

function statusClass(status) {
  if (status === "out") return "is-out";
  if (status === "low") return "is-low";
  return "is-normal";
}

function StockMovementModal({
  mode,
  part,
  employees,
  machines,
  currentEmployee,
  busy,
  error,
  onClose,
  onSubmit,
}) {
  const isIssue = mode === "issue";
  const [quantity, setQuantity] = useState("");
  const [requesterId, setRequesterId] = useState("");
  const [machineId, setMachineId] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    setQuantity("");
    setRequesterId("");
    setMachineId("");
    setNote("");
  }, [mode, part?.id]);

  if (!part) return null;

  const itemId = getField(part, ["sku", "item_id"], "-");
  const partName = getField(part, ["name", "part_name"], "-");
  const detail = getField(part, ["description", "part_detail"], "ไม่มีรายละเอียด");
  const maker = getField(part, ["maker_name"], part?.maker?.name || "-");
  const location = getField(part, ["location_name"], part?.location?.name || "-");
  const unit = getField(part, ["unit_name"], part?.unit?.name || "");
  const stock = num(getField(part, ["quantity", "stock_quantity"], 0));
  const image = getField(part, ["image_url", "image_path"], "");

  return (
    <div className="pfm-backdrop" onMouseDown={onClose}>
      <form
        className="pfm-modal"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            part_id: part.id,
            quantity,
            requester_id: isIssue ? requesterId : undefined,
            machine_id: isIssue ? machineId : undefined,
            note,
          });
        }}
      >
        <div className="pfm-header">
          <div>
            <div className={`pfm-mode-chip ${isIssue ? "issue" : "receive"}`}>
              {isIssue ? "เบิกอะไหล่" : "รับอะไหล่เข้า"}
            </div>
            <h2>{isIssue ? "บันทึกรายการเบิก" : "บันทึกรายการรับเข้า"}</h2>
          </div>
          <button type="button" className="pfm-close" onClick={onClose}>×</button>
        </div>

        <div className="pfm-part">
          <div className="pfm-image">
            {image ? <img src={image} alt={partName} /> : <span>📦</span>}
          </div>

          <div className="pfm-part-info">
            <div className="pfm-itemid">{itemId}</div>
            <h3>{partName}</h3>
            <p>{detail}</p>
            <div className="pfm-meta">
              <span>Maker <b>{maker}</b></span>
              <span>Location <b>{location}</b></span>
              <span>คงเหลือ <b>{fmt(stock)} {unit}</b></span>
            </div>
          </div>
        </div>

        <div className="pfm-grid">
          <label>
            <span>จำนวน *</span>
            <input
              type="number"
              min="0.0001"
              step="any"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              autoFocus
            />
          </label>

          {isIssue && (
            <label>
              <span>ผู้เบิก *</span>
              <select required value={requesterId} onChange={(e) => setRequesterId(e.target.value)}>
                <option value="">เลือกผู้เบิก</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.employee_code} · {emp.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {isIssue && (
            <label className="full">
              <span>เครื่องจักร *</span>
              <select required value={machineId} onChange={(e) => setMachineId(e.target.value)}>
                <option value="">เลือกเครื่องจักร</option>
                {machines.map((mc) => (
                  <option key={mc.id} value={mc.id}>
                    {(mc.code || mc.machine_code || "-")} · {(mc.name || mc.machine_name || "-")}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="full">
            <span>ผู้บันทึก</span>
            <input
              readOnly
              value={`${currentEmployee?.employee_code || ""} · ${currentEmployee?.name || ""}`}
            />
          </label>

          <label className="full">
            <span>หมายเหตุ</span>
            <textarea
              rows="3"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ใส่หมายเหตุเพิ่มเติม (ถ้ามี)"
            />
          </label>
        </div>

        {error ? <div className="pfm-error">{error}</div> : null}

        <div className="pfm-footer">
          <button type="button" className="pfm-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="submit" className={`pfm-primary ${isIssue ? "issue" : "receive"}`} disabled={busy}>
            {busy ? "กำลังบันทึก..." : isIssue ? "ยืนยันการเบิก" : "ยืนยันการรับเข้า"}
          </button>
        </div>
      </form>
    </div>
  );
}

function PartCard({ part, canIssue, canReceive, onIssue, onReceive }) {
  const status = partStatus(part);
  const itemId = getField(part, ["sku", "item_id"], "-");
  const partName = getField(part, ["name", "part_name"], "-");
  const detail = getField(part, ["description", "part_detail"], "ไม่มีรายละเอียด");
  const maker = getField(part, ["maker_name"], part?.maker?.name || "-");
  const location = getField(part, ["location_name"], part?.location?.name || "-");
  const unit = getField(part, ["unit_name"], part?.unit?.name || "");
  const qty = num(getField(part, ["quantity", "stock_quantity"], 0));
  const min = num(getField(part, ["min_stock", "minimum_stock"], 0));
  const image = getField(part, ["image_url", "image_path"], "");

  return (
    <article className="pf-part-card">
      <div className="pf-part-top">
        <div className="pf-part-image">
          {image ? <img src={image} alt={partName} loading="lazy" /> : <div className="pf-part-placeholder">📦</div>}
        </div>

        <div className="pf-part-top-main">
          <div className="pf-part-row">
            <span className="pf-part-item">{itemId}</span>
            <span className={`pf-part-status ${statusClass(status)}`}>{statusLabel(status)}</span>
          </div>

          <h3 className="pf-part-title" title={partName}>{partName}</h3>
          <p className="pf-part-detail" title={detail}>{detail}</p>

          <div className="pf-part-tags">
            <span>Maker: <b>{maker}</b></span>
            <span>Location: <b>{location}</b></span>
          </div>
        </div>
      </div>

      <div className="pf-part-bottom">
        <div className="pf-stock-box">
          <small>คงเหลือปัจจุบัน</small>
          <strong>{fmt(qty)}</strong>
          <span>{unit || "หน่วย"}</span>
        </div>

        <div className="pf-min-box">
          <small>Minimum</small>
          <strong>{fmt(min)}</strong>
          <span>{unit || "หน่วย"}</span>
        </div>

        <div className="pf-part-actions">
          {canIssue ? (
            <button type="button" className="pf-btn-stock issue" onClick={() => onIssue(part)}>
              ↓ เบิก
            </button>
          ) : null}

          {canReceive ? (
            <button type="button" className="pf-btn-stock receive" onClick={() => onReceive(part)}>
              ↑ รับเข้า
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function Dashboard() {
  const auth = useAuth();

  const [dashboard, setDashboard] = useState(null);
  const [partsPayload, setPartsPayload] = useState({ results: [] });
  const [employees, setEmployees] = useState([]);
  const [machines, setMachines] = useState([]);

  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [modalMode, setModalMode] = useState("");
  const [selectedPart, setSelectedPart] = useState(null);
  const [modalError, setModalError] = useState("");
  const [saving, setSaving] = useState(false);

  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [toast, setToast] = useState("");

  const canIssue = auth.can("can_issue_stock");
  const canReceive = auth.can("can_receive_stock");

  async function loadPage() {
    setPageLoading(true);
    setPageError("");

    try {
      const requests = [
        apiGet("/dashboard/"),
        apiGet("/parts/?page_size=3000"),
      ];

      if (canIssue) {
        requests.push(apiGet("/employees/"));
        requests.push(apiGet("/machines/?page_size=1000"));
      }

      const result = await Promise.all(requests);
      setDashboard(result[0] || {});
      setPartsPayload(result[1] || { results: [] });
      if (canIssue) {
        setEmployees(asResults(result[2]));
        setMachines(asResults(result[3]));
      }
    } catch (err) {
      setPageError(err.message || "โหลดข้อมูล Dashboard ไม่สำเร็จ");
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    loadPage();
  }, []);

  const parts = useMemo(() => asResults(partsPayload), [partsPayload]);

  const locationOptions = useMemo(() => {
    const set = new Set();
    parts.forEach((part) => {
      const value = getField(part, ["location_name"], part?.location?.name || "");
      if (value) set.add(value);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [parts]);

  const filteredParts = useMemo(() => {
    const q = search.trim().toLowerCase();

    const rows = parts.filter((part) => {
      const maker = getField(part, ["maker_name"], part?.maker?.name || "");
      const location = getField(part, ["location_name"], part?.location?.name || "");
      const status = partStatus(part);

      const searchBlob = [
        getField(part, ["sku", "item_id"], ""),
        getField(part, ["name", "part_name"], ""),
        getField(part, ["description", "part_detail"], ""),
        maker,
        location,
      ].join(" ").toLowerCase();

      return (!q || searchBlob.includes(q))
        && (!locationFilter || location === locationFilter)
        && (statusFilter === "all" || status === statusFilter);
    });

    rows.sort((a, b) => {
      const order = { out: 0, low: 1, normal: 2 };
      const sa = partStatus(a);
      const sb = partStatus(b);
      if (order[sa] !== order[sb]) return order[sa] - order[sb];
      return String(getField(a, ["sku", "item_id"], "")).localeCompare(String(getField(b, ["sku", "item_id"], "")));
    });

    return rows;
  }, [parts, search, locationFilter, statusFilter]);

  function openMovement(mode, part) {
    setSelectedPart(part);
    setModalMode(mode);
    setModalError("");
  }

  function closeMovement() {
    if (saving) return;
    setSelectedPart(null);
    setModalMode("");
    setModalError("");
  }

  async function submitMovement(payload) {
    setSaving(true);
    setModalError("");

    try {
      const endpoint = modalMode === "issue" ? "/stock/issue/" : "/stock/receive/";
      const res = await apiPost(endpoint, payload);
      setToast(`${res.message} · Stock ${fmt(res.stock_before)} → ${fmt(res.stock_after)}`);
      closeMovement();
      await loadPage();
      setTimeout(() => setToast(""), 3500);
    } catch (err) {
      setModalError(err.message || "บันทึกข้อมูลไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  if (pageLoading) {
    return <div className="pf-auth-loading">กำลังโหลด Dashboard...</div>;
  }

  const kpi = dashboard?.kpi || {};
  const kpiParts = kpi.parts ?? parts.length;
  const kpiSafety = kpi.safety_stock ?? 0;
  const kpiOrdering = kpi.safety_stock_ordering ?? 0;

  return (
    <div className="pf-parts-dashboard">
      <section className="pf-section-head">
        <div>
          <div className="pf-section-kicker">PARTS OVERVIEW</div>
          <h1>Dashboard อะไหล่และสต๊อก</h1>
          <p>ดูจำนวนคงเหลือ ค้นหารายการ และบันทึกเบิก / รับเข้า ได้จากหน้าเดียว</p>
        </div>

        <button type="button" className="pf-refresh-ghost" onClick={loadPage}>รีเฟรชข้อมูล</button>
      </section>

      {pageError ? <div className="pf-login-error">{pageError}</div> : null}
      {toast ? <div className="pf-toast-success">{toast}</div> : null}

      <section className="pf-kpi-grid-v2">
        <article className="pf-kpi-block soft-blue">
          <span>จำนวนรายการทั้งหมดใน Stock</span>
          <strong>{fmt(kpiParts)}</strong>
          <small>จำนวน Item ที่มีอยู่ในระบบ</small>
        </article>

        <article className="pf-kpi-block soft-red">
          <span>Safety Stock</span>
          <strong>{fmt(kpiSafety)}</strong>
          <small>ต่ำกว่า Min Stock และยังไม่ได้สั่งซื้อ</small>
        </article>

        <article className="pf-kpi-block soft-amber">
          <span>Safety Stock ที่กำลัง Order</span>
          <strong>{fmt(kpiOrdering)}</strong>
          <small>ต่ำกว่า Min Stock และมีรายการสั่งซื้อแล้ว</small>
        </article>
      </section>

      <section className="pf-parts-shell">
        <div className="pf-parts-shell-head">
          <div>
            <h2>รายการอะไหล่ทั้งหมด</h2>
            <p>แสดงแบบการ์ดเพื่อดูรูป, รหัส, รายละเอียด, maker, ตำแหน่ง และจำนวนคงเหลือ ได้ง่ายขึ้น</p>
          </div>
          <div className="pf-total-pill">{fmt(filteredParts.length)} รายการ</div>
        </div>

        <div className="pf-filters-v2">
          <div className="pf-search-v2">
            <span>⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหา Location / Item ID / Part Name / Part Detail / Maker"
            />
          </div>

          <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
            <option value="">ทุกตำแหน่ง</option>
            {locationOptions.map((location) => (
              <option key={location} value={location}>{location}</option>
            ))}
          </select>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">ทุกสถานะ</option>
            <option value="normal">Normal</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </select>
        </div>

        <div className="pf-parts-grid-v2">
          {filteredParts.map((part) => (
            <PartCard
              key={part.id}
              part={part}
              canIssue={canIssue}
              canReceive={canReceive}
              onIssue={(selected) => openMovement("issue", selected)}
              onReceive={(selected) => openMovement("receive", selected)}
            />
          ))}
        </div>

        {!filteredParts.length ? (
          <div className="pf-empty-card-v2">
            <div>ไม่พบรายการที่ตรงกับเงื่อนไขค้นหา</div>
            <small>ลองเปลี่ยนคำค้นหา สถานะ หรือเลือกตำแหน่งใหม่</small>
          </div>
        ) : null}
      </section>

      {modalMode && selectedPart ? (
        <StockMovementModal
          mode={modalMode}
          part={selectedPart}
          employees={employees}
          machines={machines}
          currentEmployee={auth.employee}
          busy={saving}
          error={modalError}
          onClose={closeMovement}
          onSubmit={submitMovement}
        />
      ) : null}
    </div>
  );
}
