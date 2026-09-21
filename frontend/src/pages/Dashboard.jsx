import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from "../api";
import { useAuth } from "../auth";
import { Alert, Modal, PageHeader, PartImage, SearchableSelect, fmt, stockDisplay, isNoCountSku } from "../components/Common";
import { useOptions } from "../optionsContext";
import BarcodeScannerModal from "../components/BarcodeScannerModal";
import PartDetailModal from "../components/PartDetailModal";

const blankPart = {
  sku: "",
  name: "",
  description: "",
  maker_name: "",
  unit_code: "",
  supplier_id: "",
  location_id: "",
  location_code: "",
  image_path: "",
  min_stock: 0,
  reorder_qty: 0,
  vendor_lead_time_days: 0,
  last_purchase_price: 0,
  critical: false,
  active: true,
  remark: "",
};

export function PartModal({ part, options, onClose, onSaved }) {
  const [form, setForm] = useState(part ? { ...blankPart, ...part } : blankPart);
  const [partId, setPartId] = useState(part?.id || "");
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const edit = !!partId;
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  function chooseImage(event) {
    const file = event.target.files?.[0] || null;
    setError("");
    if (!file) {
      setImageFile(null);
      return;
    }
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      event.target.value = "";
      setImageFile(null);
      setError("รองรับเฉพาะ JPG, PNG, WEBP และ GIF");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      event.target.value = "";
      setImageFile(null);
      setError("รูปภาพต้องมีขนาดไม่เกิน 10 MB");
      return;
    }
    setImageFile(file);
  }

  function clearSavedImage() {
    setImageFile(null);
    setForm((current) => ({
      ...current,
      image_path: "",
      image_url: "",
      image_fallback_url: "",
    }));
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    let savedPart = null;
    try {
      savedPart = partId
        ? await apiPatch(`/parts/${partId}/`, form)
        : await apiPost("/parts/", form);

      if (!partId) setPartId(savedPart.id);
      setForm((current) => ({ ...current, ...savedPart }));

      if (imageFile) {
        const uploadData = new FormData();
        uploadData.append("image", imageFile);
        savedPart = await apiUpload(`/parts/${savedPart.id}/image/`, uploadData);
        setImageFile(null);
        setForm((current) => ({ ...current, ...savedPart }));
      }
      onSaved(savedPart);
    } catch (err) {
      if (savedPart?.id) {
        setError(
          `ข้อมูลอะไหล่ถูกบันทึกแล้ว แต่รูปภาพยังไม่สำเร็จ: ${err.message || "Upload failed"} กดบันทึกอีกครั้งเพื่อ Retry ได้`
        );
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  const savedPreview = form.image_url || form.image_path || "";

  return (
    <Modal title={edit ? "แก้ไขข้อมูลอะไหล่" : "เพิ่มรายการอะไหล่"} onClose={onClose} wide>
      <form onSubmit={save}>
        <div className="part-preview">
          <div className="part-thumb">
            <PartImage
              src={previewUrl || savedPreview}
              fallbackSrc={previewUrl ? "" : form.image_fallback_url}
              alt={form.name || "รูปอะไหล่"}
            />
          </div>
          <div>
            <strong>{form.sku || "New Part"}</strong>
            <h3>{imageFile ? "ตัวอย่างรูปใหม่" : savedPreview ? "รูปปัจจุบัน" : "ยังไม่มีรูป"}</h3>
            <small>รูปใหม่จะอัปโหลดไป Supabase Storage ตอนกดบันทึก</small>
          </div>
        </div>

        <div className="form-grid three">
          <label className="field">
            <span>Part ID *</span>
            <input value={form.sku} onChange={(e) => set("sku", e.target.value)} required />
          </label>
          <label className="field span2">
            <span>Part Name *</span>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </label>
          <label className="field span3">
            <span>Part Detail</span>
            <textarea rows="2" value={form.description} onChange={(e) => set("description", e.target.value)} />
          </label>
          <label className="field">
            <span>Maker</span>
            <input value={form.maker_name} onChange={(e) => set("maker_name", e.target.value)} />
          </label>
          <label className="field">
            <span>Unit</span>
            <input list="unit-list" value={form.unit_code} onChange={(e) => set("unit_code", e.target.value)} />
            <datalist id="unit-list">
              {(options.units || []).map((item) => <option key={item.id} value={item.code} />)}
            </datalist>
          </label>
          <label className="field">
            <span>Vendor</span>
            <SearchableSelect
              value={form.supplier_id || ""}
              options={options.vendors || []}
              onChange={(value) => set("supplier_id", value)}
              getLabel={(item) => `${item.code} · ${item.name}`}
              getSearchText={(item) => `${item.code || ""} ${item.name || ""} ${item.email || ""} ${item.contact_person || ""}`}
              placeholder="พิมพ์ชื่อหรือรหัส Vendor"
            />
          </label>
          <label className="field">
            <span>Location</span>
            <input
              list="location-list"
              value={form.location_code || ""}
              onChange={(e) => {
                set("location_code", e.target.value);
                set("location_id", "");
              }}
              placeholder="พิมพ์ Location ได้"
            />
            <datalist id="location-list">
              {(options.locations || []).map((item) => <option key={item.id} value={item.code} />)}
            </datalist>
          </label>
          <label className="field">
            <span>Min</span>
            <input type="number" step="any" value={form.min_stock} onChange={(e) => set("min_stock", e.target.value)} />
          </label>
          <label className="field">
            <span>จำนวนที่ Order</span>
            <input type="number" step="any" value={form.reorder_qty} onChange={(e) => set("reorder_qty", e.target.value)} />
          </label>
          <label className="field">
            <span>Last Purchase Price</span>
            <div className="input-suffix">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.last_purchase_price}
                onChange={(e) => set("last_purchase_price", e.target.value)}
              />
              <b>฿</b>
            </div>
          </label>
          <label className="field span3">
            <span>เลือกรูปจากเครื่อง / โทรศัพท์</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={chooseImage} />
            <small className="field-help">
              JPG / PNG / WEBP / GIF ไม่เกิน 10 MB · เมื่อเลือกรูปใหม่ รูปปัจจุบันจะถูกแทนที่หลังบันทึก
            </small>
          </label>
          <div className="field span3">
            <span>จัดการรูป</span>
            <div className="row-actions">
              {imageFile && (
                <button type="button" className="mini" onClick={() => setImageFile(null)}>ยกเลิกรูปใหม่</button>
              )}
              {!imageFile && savedPreview && (
                <button type="button" className="mini danger" onClick={clearSavedImage}>ลบรูปออกจากรายการ</button>
              )}
            </div>
            <small className="field-help">
              “ลบรูปออกจากรายการ” จะล้างการเชื่อมรูป แต่จะไม่ลบไฟล์ต้นฉบับจาก Storage/Drive เพื่อป้องกันการลบข้อมูลโดยไม่ตั้งใจ
            </small>
          </div>
          <label className="field span3">
            <span>Remark</span>
            <textarea rows="2" value={form.remark} onChange={(e) => set("remark", e.target.value)} />
          </label>
          <label className="check">
            <input type="checkbox" checked={!!form.critical} onChange={(e) => set("critical", e.target.checked)} />
            Critical Part
          </label>
          <label className="check">
            <input type="checkbox" checked={!!form.active} onChange={(e) => set("active", e.target.checked)} />
            Active
          </label>
        </div>

        <Alert>{error}</Alert>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn primary" disabled={busy}>
            {busy ? (imageFile ? "กำลังบันทึกและอัปโหลด..." : "กำลังบันทึก...") : "บันทึก"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function StockModal({ mode, part, options, employee, onClose, onSaved }) {
  const [qty, setQty] = useState("");
  const [requesterId, setRequesterId] = useState("");
  const [machineId, setMachineId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const issue = mode === "issue";

  async function save(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payload = { part_id: part.id, quantity: qty, note };
      if (issue) {
        if (!requesterId) throw new Error("กรุณาเลือกผู้เบิกจากรายการ");
        if (!machineId) throw new Error("กรุณาเลือกเครื่องจักรจากรายการ");
        payload.requester_id = requesterId;
        payload.machine_id = machineId;
      }
      await apiPost(issue ? "/stock/issue/" : "/stock/receive/", payload);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={issue ? "เบิกอะไหล่" : "รับอะไหล่เข้าสต็อก"} onClose={onClose}>
      <form onSubmit={save}>
        <div className="part-preview">
          <div className="part-thumb">
            <PartImage src={part.image_url || part.image_path} fallbackSrc={part.image_fallback_url} alt={part.name} />
          </div>
          <div>
            <strong>{part.sku}</strong>
            <h3>{part.name}</h3>
            <p>{part.description || "-"}</p>
            <small>Stock {stockDisplay(part)} {part.unit_code}</small>
          </div>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>จำนวน *</span>
            <input type="number" min="0.0001" step="any" required value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
          {issue && (
            <>
              <label className="field">
                <span>ผู้เบิก *</span>
                <SearchableSelect
                  required
                  value={requesterId}
                  options={options.employees || []}
                  onChange={setRequesterId}
                  getLabel={(item) => item.name}
                  getSearchText={(item) => `${item.employee_code || ""} ${item.name || ""} ${item.department || ""}`}
                  placeholder="พิมพ์ชื่อพนักงาน"
                />
              </label>
              <label className="field span2">
                <span>เครื่องจักร *</span>
                <SearchableSelect
                  required
                  value={machineId}
                  options={options.machines || []}
                  onChange={setMachineId}
                  getLabel={(item) => item.code}
                  getSearchText={(item) => `${item.code || ""} ${item.name || ""} ${item.location || ""}`}
                  placeholder="พิมพ์รหัส Machine"
                />
              </label>
            </>
          )}
          <label className="field span2">
            <span>ผู้บันทึก</span>
            <input readOnly value={employee?.name || ""} />
          </label>
          <label className="field span2">
            <span>Remark</span>
            <textarea rows="2" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <Alert>{error}</Alert>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>ยกเลิก</button>
          <button className={`btn ${issue ? "danger" : "success"}`} disabled={busy}>
            {busy ? "กำลังบันทึก..." : issue ? "ยืนยันการเบิก" : "ยืนยันการรับเข้า"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AdjustModal({ part, onClose, onSaved }) {
  const [actual, setActual] = useState(part.stock_qty);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const diff = Number(actual || 0) - Number(part.stock_qty || 0);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiPost("/stock/adjust/", { part_id: part.id, actual_quantity: actual, reason });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="ปรับยอด Stock" onClose={onClose}>
      <form onSubmit={save}>
        <div className="metric-inline">
          <div><span>ยอดในระบบ</span><strong>{stockDisplay(part)}</strong></div>
          <div><span>ยอดตรวจนับจริง</span><strong>{fmt(actual)}</strong></div>
          <div><span>ผลต่าง</span><strong>{diff > 0 ? "+" : ""}{fmt(diff)}</strong></div>
        </div>
        <label className="field">
          <span>ยอดตรวจนับจริง *</span>
          <input type="number" min="0" step="any" value={actual} onChange={(e) => setActual(e.target.value)} />
        </label>
        <label className="field">
          <span>เหตุผล *</span>
          <textarea required rows="3" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <Alert>{error}</Alert>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn primary" disabled={busy}>ยืนยันปรับยอด</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Dashboard() {
  const auth = useAuth();
  const navigate = useNavigate();
  const tableScrollRef = useRef(null);
  const topScrollRef = useRef(null);
  const searchTimerRef = useRef(null);

  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  const [kpi, setKpi] = useState({});
  const [parts, setParts] = useState([]);
  const { options } = useOptions();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [partView, setPartView] = useState("active");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({
    count: 0,
    page: 1,
    page_size: 50,
    total_pages: 1,
    has_next: false,
    has_previous: false,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const optionsLoading = false;
  const [partModal, setPartModal] = useState(null);
  const [stockModal, setStockModal] = useState(null);
  const [adjust, setAdjust] = useState(null);
  const [detail, setDetail] = useState(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setPage(1);
      setDebouncedQ(q.trim());
    }, 350);
    return () => clearTimeout(searchTimerRef.current);
  }, [q]);

  async function loadKpi(forceRefresh = false) {
    const data = await apiGet("/dashboard/", { forceRefresh });
    setKpi(data.kpi || {});
  }

  async function loadParts(forceRefresh = false) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", "50");
      if (debouncedQ) params.set("q", debouncedQ);
      if (warehouse) params.set("warehouse", warehouse);
      params.set("active", partView === "active" ? "true" : "false");

      const response = await apiGet(`/parts/?${params.toString()}`, { forceRefresh });
      setParts(response.results || []);
      setMeta({
        count: Number(response.count || 0),
        page: Number(response.page || 1),
        page_size: Number(response.page_size || 50),
        total_pages: Number(response.total_pages || 1),
        has_next: !!response.has_next,
        has_previous: !!response.has_previous,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function ensureOptions() {
    return options || {};
  }

  async function openAddPart() {
    const loaded = await ensureOptions();
    if (loaded) setPartModal({});
  }

  async function openEditPart(part) {
    const loaded = await ensureOptions();
    if (loaded) setPartModal(part);
  }

  async function openStock(mode, part) {
    if (part?.active === false || partView === "inactive") return;
    const loaded = await ensureOptions();
    if (loaded) setStockModal({ mode, part });
  }

  async function refreshAfterMutation() {
    await Promise.all([loadKpi(true), loadParts(true)]);
  }

  async function deletePart(part) {
    if (
      !window.confirm(
        `ลบอะไหล่ ${part.sku} · ${part.name} ถาวร? การลบนี้ย้อนกลับไม่ได้`
      )
    )
      return;
    setError("");
    try {
      await apiDelete(`/parts/${part.id}/`);
      await refreshAfterMutation();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleDetected(value) {
    const scanned = String(value || "").trim();
    setScannerOpen(false);
    if (!scanned) return;
    setQ(scanned);
    setDebouncedQ(scanned);
    setPage(1);
  }

  useEffect(() => {
    loadKpi().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    loadParts();
  }, [page, debouncedQ, warehouse, partView]);

  useEffect(() => {
    const wrap = tableScrollRef.current;
    if (!wrap) return undefined;
    const update = () => setTableScrollWidth(wrap.scrollWidth);
    update();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(wrap);
    if (wrap.firstElementChild) observer?.observe(wrap.firstElementChild);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [parts.length, loading]);

  const syncTop = (event) => {
    if (tableScrollRef.current) tableScrollRef.current.scrollLeft = event.currentTarget.scrollLeft;
  };
  const syncTable = (event) => {
    if (topScrollRef.current) topScrollRef.current.scrollLeft = event.currentTarget.scrollLeft;
  };

  const firstRow = meta.count ? (meta.page - 1) * meta.page_size + 1 : 0;
  const lastRow = Math.min(meta.page * meta.page_size, meta.count);

  return (
    <>
      <PageHeader
        title="Dashboard Stock"
        subtitle="Part & Stock ในหน้าเดียว"
        actions={
          <>
            <button className="btn ghost" onClick={() => navigate("/spare-sets")}>⚙ ชุดอะไหล่เครื่องจักร</button>
            {auth.can("can_edit_parts") && (
              <button className="btn primary" onClick={openAddPart} disabled={optionsLoading}>
                {optionsLoading ? "กำลังโหลด..." : "+ เพิ่มรายการอะไหล่"}
              </button>
            )}
          </>
        }
      />

      <Alert>{error}</Alert>

      <div className="kpi-grid three">
        <div className="kpi-card">
          <span>จำนวนรายการอะไหล่</span>
          <strong>{fmt(kpi.parts)}</strong>
        </div>
        <button
          type="button"
          className="kpi-card danger kpi-card-link"
          onClick={() => navigate("/safety-stock")}
          aria-label="เปิดหน้า Safety Stock"
        >
          <span>Safety Stock</span>
          <strong>{fmt(kpi.safety_stock)}</strong>
          <small>ต่ำกว่า Min และยังไม่ได้สั่ง</small>
        </button>
        <button
          type="button"
          className="kpi-card warning kpi-card-link"
          onClick={() => navigate("/orders")}
          aria-label="เปิดหน้า Order สำหรับ Safety Stock ที่กำลังสั่ง"
        >
          <span>Safety Stock currently Order</span>
          <strong>{fmt(kpi.safety_stock_ordered)}</strong>
          <small>ต่ำกว่า Min แต่มี Order อยู่</small>
        </button>
      </div>

      <div className="tab-row page-tabs">
        <button className={`tab ${partView === "active" ? "active" : ""}`} onClick={() => { setPartView("active"); setPage(1); }}>
          Active Parts
        </button>
        <button className={`tab ${partView === "inactive" ? "active" : ""}`} onClick={() => { setPartView("inactive"); setPage(1); }}>
          Inactive Parts
        </button>
      </div>

      <section className="panel">
        <div className="toolbar">
          <input
            className="search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหา Location / Part ID / Part Name / Detail / Maker..."
          />
          <button
            type="button"
            className="btn ghost"
            title="สแกน Barcode / QR Code"
            aria-label="สแกน Barcode หรือ QR Code"
            onClick={() => setScannerOpen(true)}
          >
            ⌗ สแกน Barcode / QR
          </button>
          <select value={warehouse} onChange={(e) => { setWarehouse(e.target.value); setPage(1); }}>
            <option value="">คลังทั้งหมด</option>
            <option value="MM-4">Phase4</option>
            <option value="MM-11">Phase11</option>
          </select>
          <button className="btn ghost" onClick={() => Promise.all([loadKpi(true), loadParts(true)])}>รีเฟรช</button>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", margin: "4px 0 12px" }}>
          <small>{meta.count ? `แสดง ${firstRow}-${lastRow} จาก ${meta.count} รายการ` : "ไม่พบรายการ"}</small>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button className="btn ghost" disabled={loading || !meta.has_previous} onClick={() => setPage((current) => Math.max(1, current - 1))}>
              ← ก่อนหน้า
            </button>
            <span>หน้า {meta.page} / {meta.total_pages}</span>
            <button className="btn ghost" disabled={loading || !meta.has_next} onClick={() => setPage((current) => current + 1)}>
              ถัดไป →
            </button>
          </div>
        </div>

        {loading ? (
          <div className="empty">กำลังโหลด...</div>
        ) : (
          <>
            <div ref={topScrollRef} className="table-scroll-top" onScroll={syncTop}>
              <div style={{ width: tableScrollWidth }} />
            </div>
            <div ref={tableScrollRef} className="table-wrap dashboard-stock-wrap" onScroll={syncTable}>
              <table className="dashboard-stock-table">
                <thead>
                  <tr>
                    <th>รูป</th>
                    <th>Warehouse</th>
                    <th>Location</th>
                    <th>Part ID</th>
                    <th>Part Name</th>
                    <th>Part Detail</th>
                    <th>Maker</th>
                    <th>Stock</th>
                    <th>Unit</th>
                    <th>สถานะ</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((part) => {
                    const inactive = part.active === false || partView === "inactive";
                    return (
                      <tr
                        key={part.id}
                        onClick={() => setDetail(part)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setDetail(part);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        title="คลิกเพื่อดูรายละเอียด"
                        style={{ cursor: "pointer" }}
                      >
                        <td>
                          <div className="table-thumb">
                            <PartImage src={part.image_url || part.image_path} fallbackSrc={part.image_fallback_url} alt={part.name} />
                          </div>
                        </td>
                        <td>{part.warehouse_label}</td>
                        <td>{part.location_code || "-"}</td>
                        <td className="mono-cell"><b>{part.sku}</b></td>
                        <td className="part-name-cell">{part.name}</td>
                        <td className="detail-cell">{part.description || "-"}</td>
                        <td>{part.maker_name || "-"}</td>
                        <td className={`mono-cell ${!inactive && !isNoCountSku(part.sku) && Number(part.stock_qty) < Number(part.min_stock) ? "text-danger" : ""}`}>
                          <b>{stockDisplay(part)}</b>
                        </td>
                        <td>{part.unit_code}</td>
                        <td>
                          {inactive ? (
                            <span className="status muted">Inactive</span>
                          ) : (
                            <span className={`stock-state ${part.stock_status || "normal"}`}>{part.stock_status_label || "normal"}</span>
                          )}
                        </td>
                        <td onClick={(event) => event.stopPropagation()}>
                          <div className="row-actions">
                            <button className="mini primary" onClick={() => setDetail(part)}>รายละเอียด</button>
                            {auth.can("can_edit_parts") && (
                              <button className="mini" onClick={() => openEditPart(part)}>แก้ไข</button>
                            )}
                            {!inactive && auth.can("can_adjust_stock") && (
                              <button className="mini" onClick={() => setAdjust(part)}>ปรับยอด</button>
                            )}
                            {!inactive && auth.can("can_issue_stock") && (
                              <button className="mini danger" onClick={() => openStock("issue", part)}>เบิก</button>
                            )}
                            {!inactive && auth.can("can_receive_stock") && (
                              <button className="mini success" onClick={() => openStock("receive", part)}>รับเข้า</button>
                            )}
                            {inactive && auth.can("can_delete_parts") && (
                              <button className="mini danger" onClick={() => deletePart(part)}>ลบ</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {scannerOpen && (
        <BarcodeScannerModal onClose={() => setScannerOpen(false)} onDetected={handleDetected} />
      )}

      {detail && <PartDetailModal part={detail} onClose={() => setDetail(null)} />}

      {partModal !== null && (
        <PartModal
          part={partModal.id ? partModal : null}
          options={options || {}}
          onClose={() => setPartModal(null)}
          onSaved={async () => {
            setPartModal(null);
            await refreshAfterMutation();
          }}
        />
      )}

      {stockModal && (
        <StockModal
          {...stockModal}
          options={options || {}}
          employee={auth.employee}
          onClose={() => setStockModal(null)}
          onSaved={async () => {
            setStockModal(null);
            await refreshAfterMutation();
          }}
        />
      )}

      {adjust && (
        <AdjustModal
          part={adjust}
          onClose={() => setAdjust(null)}
          onSaved={async () => {
            setAdjust(null);
            await refreshAfterMutation();
          }}
        />
      )}
    </>
  );
}
