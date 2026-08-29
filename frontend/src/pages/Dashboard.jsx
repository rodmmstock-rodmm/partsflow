import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPatch, apiPost, apiUpload } from "../api";
import { useAuth } from "../auth";
import { Alert, Modal, PageHeader, PartImage, fmt, money } from "../components/Common";
import PartDetailModal from "../components/PartDetailModal";

const blankPart = {
  sku: "", name: "", description: "", maker_name: "", unit_code: "",
  supplier_id: "", location_id: "", location_code: "", image_path: "", min_stock: 0,
  reorder_qty: 0, vendor_lead_time_days: 0,
  last_purchase_price: 0, critical: false,
  active: true, remark: "",
};

function PartModal({ part, options, onClose, onSaved }) {
  const [form, setForm] = useState(
    part ? { ...blankPart, ...part } : blankPart
  );
  const [partId, setPartId] = useState(part?.id || "");
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const edit = !!partId;
  const set = (k, v) =>
    setForm((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl("");
      return;
    }

    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  function chooseImage(e) {
    const file = e.target.files?.[0] || null;
    setError("");

    if (!file) {
      setImageFile(null);
      return;
    }

    const allowed = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
    ];

    if (!allowed.includes(file.type)) {
      e.target.value = "";
      setImageFile(null);
      setError("รองรับเฉพาะ JPG, PNG, WEBP และ GIF");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      e.target.value = "";
      setImageFile(null);
      setError("รูปภาพต้องมีขนาดไม่เกิน 10 MB");
      return;
    }

    setImageFile(file);
  }

  function cancelNewImage() {
    setImageFile(null);
  }

  function clearSavedImage() {
    setImageFile(null);
    setForm((x) => ({
      ...x,
      image_path: "",
      image_url: "",
      image_fallback_url: "",
    }));
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");

    let savedPart = null;

    try {
      savedPart = partId
        ? await apiPatch(`/parts/${partId}/`, form)
        : await apiPost("/parts/", form);

      if (!partId) {
        setPartId(savedPart.id);
      }

      setForm((x) => ({ ...x, ...savedPart }));

      if (imageFile) {
        const uploadData = new FormData();
        uploadData.append("image", imageFile);

        savedPart = await apiUpload(
          `/parts/${savedPart.id}/image/`,
          uploadData
        );

        setImageFile(null);
        setForm((x) => ({ ...x, ...savedPart }));
      }

      onSaved(savedPart);
    } catch (err) {
      if (savedPart?.id) {
        setError(
          `ข้อมูลอะไหล่ถูกบันทึกแล้ว แต่รูปภาพยังไม่สำเร็จ: ${
            err.message || "Upload failed"
          } กดบันทึกอีกครั้งเพื่อ Retry ได้`
        );
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  const savedPreview =
    form.image_url || form.image_path || "";

  return (
    <Modal
      title={edit ? "แก้ไขข้อมูลอะไหล่" : "เพิ่มรายการอะไหล่"}
      onClose={onClose}
      wide
    >
      <form onSubmit={save}>
        <div className="part-preview">
          <div className="part-thumb">
            <PartImage
              src={previewUrl || savedPreview}
              fallbackSrc={
                previewUrl ? "" : form.image_fallback_url
              }
              alt={form.name || "รูปอะไหล่"}
            />
          </div>

          <div>
            <strong>
              {form.sku || "New Part"}
            </strong>
            <h3>
              {imageFile
                ? "ตัวอย่างรูปใหม่"
                : savedPreview
                  ? "รูปปัจจุบัน"
                  : "ยังไม่มีรูป"}
            </h3>
            <small>
              รูปใหม่จะอัปโหลดไป Supabase Storage
              ตอนกดบันทึก
            </small>
          </div>
        </div>

        <div className="form-grid three">
          <label className="field">
            <span>Item ID *</span>
            <input
              value={form.sku}
              onChange={(e) => set("sku", e.target.value)}
              required
            />
          </label>

          <label className="field span2">
            <span>Part Name *</span>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
            />
          </label>

          <label className="field span3">
            <span>Part Detail</span>
            <textarea
              rows="2"
              value={form.description}
              onChange={(e) =>
                set("description", e.target.value)
              }
            />
          </label>

          <label className="field">
            <span>Maker</span>
            <input
              value={form.maker_name}
              onChange={(e) =>
                set("maker_name", e.target.value)
              }
            />
          </label>

          <label className="field">
            <span>Unit</span>
            <input
              list="unit-list"
              value={form.unit_code}
              onChange={(e) =>
                set("unit_code", e.target.value)
              }
            />
            <datalist id="unit-list">
              {(options.units || []).map((x) => (
                <option key={x.id} value={x.code} />
              ))}
            </datalist>
          </label>

          <label className="field">
            <span>Vendor</span>
            <select
              value={form.supplier_id || ""}
              onChange={(e) =>
                set("supplier_id", e.target.value)
              }
            >
              <option value="">-</option>
              {(options.vendors || []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.code} · {x.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field"><span>Location</span><input list="location-list" value={form.location_code||""} onChange={e=>{set("location_code",e.target.value);set("location_id","")}} placeholder="พิมพ์ Location ได้"/><datalist id="location-list">{(options.locations||[]).map(x=><option key={x.id} value={x.code}/>)}</datalist></label>

          <label className="field">
            <span>Min</span>
            <input
              type="number"
              step="any"
              value={form.min_stock}
              onChange={(e) =>
                set("min_stock", e.target.value)
              }
            />
          </label>

          <label className="field">
            <span>จำนวนที่ Order</span>
            <input
              type="number"
              step="any"
              value={form.reorder_qty}
              onChange={(e) =>
                set("reorder_qty", e.target.value)
              }
            />
          </label>

          <label className="field">
            <span>Vendor Lead Time</span>
            <div className="input-suffix">
              <input
                type="number"
                min="0"
                value={form.vendor_lead_time_days}
                onChange={(e) =>
                  set(
                    "vendor_lead_time_days",
                    e.target.value
                  )
                }
              />
              <b>DAY</b>
            </div>
          </label>

          <label className="field">
            <span>Last Purchase Price</span>
            <div className="input-suffix">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.last_purchase_price}
                onChange={(e) =>
                  set(
                    "last_purchase_price",
                    e.target.value
                  )
                }
              />
              <b>฿</b>
            </div>
          </label>

          <label className="field span3">
            <span>เลือกรูปจากเครื่อง / โทรศัพท์</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={chooseImage}
            />
            <small className="field-help">
              JPG / PNG / WEBP / GIF ไม่เกิน 10 MB
              · เมื่อเลือกรูปใหม่ รูปใหม่จะมีสิทธิ์เหนือ
              Image Path ด้านล่าง
            </small>
          </label>

          <label className="field span3">
            <span>
              Image URL / Google Drive Path (ทางเลือก)
            </span>
            <input
              value={form.image_path || ""}
              onChange={(e) =>
                set("image_path", e.target.value)
              }
              placeholder="เช่น DATA1_Images/filename.jpg หรือ URL รูป"
            />
            <small className="field-help">
              ใช้สำหรับรูปเดิมหรือกรณีต้องการระบุ Path เอง
              · การ Upload จากฟอร์มจะเก็บรูปใน
              Supabase Storage
            </small>
          </label>

          <div className="field span3">
            <span>จัดการรูป</span>
            <div className="row-actions">
              {imageFile && (
                <button
                  type="button"
                  className="mini"
                  onClick={cancelNewImage}
                >
                  ยกเลิกรูปใหม่
                </button>
              )}

              {!imageFile && savedPreview && (
                <button
                  type="button"
                  className="mini danger"
                  onClick={clearSavedImage}
                >
                  ลบรูปออกจากรายการ
                </button>
              )}
            </div>
            <small className="field-help">
              “ลบรูปออกจากรายการ” จะล้างการเชื่อมรูป
              แต่จะไม่ลบไฟล์ต้นฉบับจาก Storage/Drive
              เพื่อป้องกันการลบข้อมูลโดยไม่ตั้งใจ
            </small>
          </div>

          <label className="field span3">
            <span>Remark</span>
            <textarea
              rows="2"
              value={form.remark}
              onChange={(e) =>
                set("remark", e.target.value)
              }
            />
          </label>

          <label className="check">
            <input
              type="checkbox"
              checked={!!form.critical}
              onChange={(e) =>
                set("critical", e.target.checked)
              }
            />
            Critical Part
          </label>

          <label className="check">
            <input
              type="checkbox"
              checked={!!form.active}
              onChange={(e) =>
                set("active", e.target.checked)
              }
            />
            Active
          </label>
        </div>

        <Alert>{error}</Alert>

        <div className="modal-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={onClose}
          >
            ยกเลิก
          </button>

          <button
            className="btn primary"
            disabled={busy}
          >
            {busy
              ? imageFile
                ? "กำลังบันทึกและอัปโหลด..."
                : "กำลังบันทึก..."
              : "บันทึก"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function StockModal({ mode, part, options, employee, onClose, onSaved }) {
  const [qty, setQty] = useState("");
  const [requester, setRequester] = useState("");
  const [machine, setMachine] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const issue = mode === "issue";

  function findByLabel(list, label, kind) {
    const t = label.trim().toLowerCase();
    return list.find(x => {
      const s = kind === "employee" ? `${x.name}` : kind === "machine" ? `${x.name}` : `${x.code} · ${x.name}`;
      return s.toLowerCase() === t || String(kind === "employee" ? x.employee_code : x.code).toLowerCase() === t;
    });
  }

  async function save(e) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const payload = { part_id: part.id, quantity: qty, note };
      if (issue) {
        const emp = findByLabel(options.employees||[], requester, "employee");
        const mc = findByLabel(options.machines||[], machine, "machine");
        if (!emp) throw new Error("กรุณาเลือกผู้เบิกจากรายการ");
        if (!mc) throw new Error("กรุณาเลือกเครื่องจักรจากรายการ");
        payload.requester_id = emp.id; payload.machine_id = mc.id;
      }
      await apiPost(issue ? "/stock/issue/" : "/stock/receive/", payload);
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <Modal title={issue?"เบิกอะไหล่":"รับอะไหล่เข้าสต็อก"} onClose={onClose}>
    <form onSubmit={save}>
      <div className="part-preview"><div className="part-thumb"><PartImage src={part.image_url||part.image_path} fallbackSrc={part.image_fallback_url} alt={part.name}/></div><div><strong>{part.sku}</strong><h3>{part.name}</h3><p>{part.description||"-"}</p><small>Stock {fmt(part.stock_qty)} {part.unit_code}</small></div></div>
      <div className="form-grid">
        <label className="field"><span>จำนวน *</span><input type="number" min="0.0001" step="any" required value={qty} onChange={e=>setQty(e.target.value)} /></label>
        {issue && <>
          <label className="field"><span>ผู้เบิก *</span><input list="emp-stock" value={requester} onChange={e=>setRequester(e.target.value)} placeholder="พิมพ์ค้นหา..."/><datalist id="emp-stock">{(options.employees||[]).map(x=><option key={x.id} value={`${x.name}`}/>)}</datalist></label>
          <label className="field span2"><span>เครื่องจักร *</span><input list="mc-stock" value={machine} onChange={e=>setMachine(e.target.value)} placeholder="พิมพ์ค้นหา..."/><datalist id="mc-stock">{(options.machines||[]).map(x=><option key={x.id} value={x.name}/>)}</datalist></label>
        </>}
        <label className="field span2"><span>ผู้บันทึก</span><input readOnly value={employee?.name||""} /></label>
        <label className="field span2"><span>Remark</span><textarea rows="2" value={note} onChange={e=>setNote(e.target.value)} /></label>
      </div>
      <Alert>{error}</Alert><div className="modal-actions"><button type="button" className="btn ghost" onClick={onClose}>ยกเลิก</button><button className={`btn ${issue?"danger":"success"}`} disabled={busy}>{busy?"กำลังบันทึก...":issue?"ยืนยันการเบิก":"ยืนยันการรับเข้า"}</button></div>
    </form>
  </Modal>;
}

function AdjustModal({ part, onClose, onSaved }) {
  const [actual, setActual] = useState(part.stock_qty);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const diff = Number(actual||0) - Number(part.stock_qty||0);
  async function save(e){e.preventDefault();setBusy(true);setError("");try{await apiPost("/stock/adjust/",{part_id:part.id,actual_quantity:actual,reason});onSaved();}catch(err){setError(err.message)}finally{setBusy(false)}}
  return <Modal title="ปรับยอด Stock" onClose={onClose}><form onSubmit={save}><div className="metric-inline"><div><span>ยอดในระบบ</span><strong>{fmt(part.stock_qty)}</strong></div><div><span>ยอดตรวจนับจริง</span><strong>{fmt(actual)}</strong></div><div><span>ผลต่าง</span><strong>{diff>0?"+":""}{fmt(diff)}</strong></div></div><label className="field"><span>ยอดตรวจนับจริง *</span><input type="number" min="0" step="any" value={actual} onChange={e=>setActual(e.target.value)} /></label><label className="field"><span>เหตุผล *</span><textarea required rows="3" value={reason} onChange={e=>setReason(e.target.value)} /></label><Alert>{error}</Alert><div className="modal-actions"><button type="button" className="btn ghost" onClick={onClose}>ยกเลิก</button><button className="btn primary" disabled={busy}>ยืนยันปรับยอด</button></div></form></Modal>
}

export default function Dashboard(){
  const auth=useAuth();
  const navigate=useNavigate();
  const tableScrollRef=useRef(null);
  const topScrollRef=useRef(null);
  const searchTimerRef=useRef(null);

  const [tableScrollWidth,setTableScrollWidth]=useState(0);
  const [kpi,setKpi]=useState({});
  const [parts,setParts]=useState([]);
  const [options,setOptions]=useState(null);

  const [q,setQ]=useState("");
  const [debouncedQ,setDebouncedQ]=useState("");
  const [warehouse,setWarehouse]=useState("");
  const [partView,setPartView]=useState("active");
  const [page,setPage]=useState(1);
  const [meta,setMeta]=useState({count:0,page:1,page_size:50,total_pages:1,has_next:false,has_previous:false});

  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [optionsLoading,setOptionsLoading]=useState(false);

  const [partModal,setPartModal]=useState(null);
  const [stockModal,setStockModal]=useState(null);
  const [adjust,setAdjust]=useState(null);
  const [detail,setDetail]=useState(null);

  useEffect(()=>{
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current=setTimeout(()=>{
      setPage(1);
      setDebouncedQ(q.trim());
    },350);
    return()=>clearTimeout(searchTimerRef.current);
  },[q]);

  async function loadKpi(forceRefresh=false){
    const d=await apiGet("/dashboard/",{forceRefresh});
    setKpi(d.kpi||{});
  }

  async function loadParts(forceRefresh=false){
    setLoading(true);
    setError("");
    try{
      const params=new URLSearchParams();
      params.set("page",String(page));
      params.set("page_size","50");
      if(debouncedQ)params.set("q",debouncedQ);
      if(warehouse)params.set("warehouse",warehouse);
      params.set("active",partView==="active"?"true":"false");

      const p=await apiGet(`/parts/?${params.toString()}`,{forceRefresh});
      setParts(p.results||[]);
      setMeta({
        count:Number(p.count||0),
        page:Number(p.page||1),
        page_size:Number(p.page_size||50),
        total_pages:Number(p.total_pages||1),
        has_next:!!p.has_next,
        has_previous:!!p.has_previous,
      });
    }catch(err){
      setError(err.message);
    }finally{
      setLoading(false);
    }
  }

  async function ensureOptions(){
    if(options)return options;
    setOptionsLoading(true);
    try{
      const o=await apiGet("/options/");
      setOptions(o||{});
      return o||{};
    }catch(err){
      setError(err.message);
      return null;
    }finally{
      setOptionsLoading(false);
    }
  }

  async function openAddPart(){
    const o=await ensureOptions();
    if(o)setPartModal({});
  }

  async function openEditPart(part){
    const o=await ensureOptions();
    if(o)setPartModal(part);
  }

  async function openStock(mode,part){
    const o=await ensureOptions();
    if(o)setStockModal({mode,part});
  }

  async function refreshAfterMutation(){
    await Promise.all([
      loadKpi(true),
      loadParts(true),
    ]);
  }

  useEffect(()=>{
    loadKpi().catch(err=>setError(err.message));
  },[]);

  useEffect(()=>{
    loadParts();
  },[page,debouncedQ,warehouse,partView]);

  useEffect(()=>{
    const wrap=tableScrollRef.current;
    if(!wrap)return;
    const update=()=>setTableScrollWidth(wrap.scrollWidth);
    update();
    const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(update):null;
    observer?.observe(wrap);
    if(wrap.firstElementChild)observer?.observe(wrap.firstElementChild);
    window.addEventListener("resize",update);
    return()=>{observer?.disconnect();window.removeEventListener("resize",update)};
  },[parts.length,loading]);

  const syncTop=(e)=>{
    if(tableScrollRef.current)tableScrollRef.current.scrollLeft=e.currentTarget.scrollLeft;
  };
  const syncTable=(e)=>{
    if(topScrollRef.current)topScrollRef.current.scrollLeft=e.currentTarget.scrollLeft;
  };

  const firstRow=meta.count?((meta.page-1)*meta.page_size)+1:0;
  const lastRow=Math.min(meta.page*meta.page_size,meta.count);

  return <>
    <PageHeader
      title="Dashboard Stock"
      subtitle="Part & Stock ในหน้าเดียว"
      actions={<>
        <button className="btn ghost" onClick={()=>navigate("/spare-sets")}>⚙ ชุดอะไหล่เครื่องจักร</button>
        {auth.can("can_edit_parts")&&
          <button className="btn primary" onClick={openAddPart} disabled={optionsLoading}>
            {optionsLoading?"กำลังโหลด...":"+ เพิ่มรายการอะไหล่"}
          </button>
        }
      </>}
    />

    <Alert>{error}</Alert>

    <div className="kpi-grid three">
      <div className="kpi-card">
        <span>จำนวนรายการอะไหล่</span>
        <strong>{fmt(kpi.parts)}</strong>
      </div>
      <div className="kpi-card danger">
        <span>Safety Stock</span>
        <strong>{fmt(kpi.safety_stock)}</strong>
        <small>ต่ำกว่า Min และยังไม่ได้สั่ง</small>
      </div>
      <div className="kpi-card warning">
        <span>Safety Stock currently Order</span>
        <strong>{fmt(kpi.safety_stock_ordered)}</strong>
        <small>ต่ำกว่า Min แต่มี Order อยู่</small>
      </div>
    </div>

    <div className="tab-row page-tabs"><button className={`tab ${partView==="active"?"active":""}`} onClick={()=>{setPartView("active");setPage(1)}}>Active Parts</button><button className={`tab ${partView==="inactive"?"active":""}`} onClick={()=>{setPartView("inactive");setPage(1)}}>Inactive Parts</button></div>
    <section className="panel">
      <div className="toolbar">
        <input
          className="search-input"
          value={q}
          onChange={e=>setQ(e.target.value)}
          placeholder="ค้นหา Location / Item ID / Part Name / Detail / Maker..."
        />
        <select
          value={warehouse}
          onChange={e=>{setWarehouse(e.target.value);setPage(1)}}
        >
          <option value="">คลังทั้งหมด</option>
          <option value="MM-4">Phase4</option>
          <option value="MM-11">Phase11</option>
        </select>
        <button
          className="btn ghost"
          onClick={()=>Promise.all([loadKpi(true),loadParts(true)])}
        >
          รีเฟรช
        </button>
      </div>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:"12px",flexWrap:"wrap",margin:"4px 0 12px"}}>
        <small>
          {meta.count
            ? `แสดง ${firstRow}-${lastRow} จาก ${meta.count} รายการ`
            : "ไม่พบรายการ"}
        </small>
        <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
          <button
            className="btn ghost"
            disabled={loading||!meta.has_previous}
            onClick={()=>setPage(p=>Math.max(1,p-1))}
          >
            ← ก่อนหน้า
          </button>
          <span>หน้า {meta.page} / {meta.total_pages}</span>
          <button
            className="btn ghost"
            disabled={loading||!meta.has_next}
            onClick={()=>setPage(p=>p+1)}
          >
            ถัดไป →
          </button>
        </div>
      </div>

      {loading
        ? <div className="empty">กำลังโหลด...</div>
        : <>
            <div
              ref={topScrollRef}
              className="table-scroll-top"
              onScroll={syncTop}
            >
              <div style={{width:tableScrollWidth}} />
            </div>

            <div
              ref={tableScrollRef}
              className="table-wrap dashboard-stock-wrap"
              onScroll={syncTable}
            >
              <table className="dashboard-stock-table">
                <thead>
                  <tr>
                    <th>รูป</th>
                    <th>Warehouse</th>
                    <th>Location</th>
                    <th>Item ID</th>
                    <th>Part Name</th>
                    <th>Part Detail</th>
                    <th>Maker</th>
                    <th>Stock</th>
                    <th>Unit</th>
                    <th>Min</th>
                    <th>Vendor</th>
                    <th>สถานะ</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map(p=>
                    <tr key={p.id}>
                      <td>
                        <div className="table-thumb">
                          <PartImage src={p.image_url||p.image_path} fallbackSrc={p.image_fallback_url} alt={p.name}/>
                        </div>
                      </td>
                      <td>{p.warehouse_label}</td>
                      <td>{p.location_code||"-"}</td>
                      <td><b>{p.sku}</b></td>
                      <td className="part-name-cell">{p.name}</td>
                      <td className="detail-cell">{p.description||"-"}</td>
                      <td>{p.maker_name||"-"}</td>
                      <td className={Number(p.stock_qty)<Number(p.min_stock)?"text-danger":""}>
                        <b>{fmt(p.stock_qty)}</b>
                      </td>
                      <td>{p.unit_code}</td>
                      <td>{fmt(p.min_stock)}</td>
                      <td>{p.supplier_name||"-"}</td>
                      <td><span className={`stock-state ${p.stock_status||"normal"}`}>{p.stock_status_label||"normal"}</span></td>
                      <td>
                        <div className="row-actions">
                          <button className="mini primary" onClick={()=>setDetail(p)}>รายละเอียด</button>
                          {auth.can("can_edit_parts")&&
                            <button className="mini" onClick={()=>openEditPart(p)}>แก้ไข</button>}
                          {auth.can("can_adjust_stock")&&
                            <button className="mini" onClick={()=>setAdjust(p)}>ปรับยอด</button>}
                          {auth.can("can_issue_stock")&&
                            <button className="mini danger" onClick={()=>openStock("issue",p)}>เบิก</button>}
                          {auth.can("can_receive_stock")&&
                            <button className="mini success" onClick={()=>openStock("receive",p)}>รับเข้า</button>}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
      }
    </section>



    {detail&&
      <PartDetailModal
        part={detail}
        onClose={()=>setDetail(null)}
      />
    }

    {partModal!==null&&
      <PartModal
        part={partModal.id?partModal:null}
        options={options||{}}
        onClose={()=>setPartModal(null)}
        onSaved={async()=>{
          setPartModal(null);
          await refreshAfterMutation();
        }}
      />
    }

    {stockModal&&
      <StockModal
        {...stockModal}
        options={options||{}}
        employee={auth.employee}
        onClose={()=>setStockModal(null)}
        onSaved={async()=>{
          setStockModal(null);
          await refreshAfterMutation();
        }}
      />
    }

    {adjust&&
      <AdjustModal
        part={adjust}
        onClose={()=>setAdjust(null)}
        onSaved={async()=>{
          setAdjust(null);
          await refreshAfterMutation();
        }}
      />
    }
  </>;
}
