import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost } from "../api";
import { useAuth } from "../auth";
import { Alert, fmt, money } from "../components/Common";
import {
  OrderInfoModal,
  ProjectModal,
  PurchaseModal,
  QuotationConversionModal,
} from "../pages/Orders";
import RFQComposeModal from "../components/RFQComposeModal";
import {
  MobileEmpty,
  MobileLoading,
  MobilePage,
  MobileSearch,
} from "./MobileCommon";

const QUOTATION_STAGE = {
  DRAFT: "ยังไม่ขอราคา",
  WAIT_QUOTATION: "รอใบเสนอราคา",
  QUOTATION_RECEIVED: "ได้รับราคาแล้ว",
  READY_TO_CREATE_ORDER: "พร้อมสร้าง Order",
  PARTIALLY_CREATED: "สร้างบางส่วนแล้ว",
  CREATED_TO_ORDER_STEP: "สร้าง Order ครบแล้ว",
};

export default function MobileOrderSteps() {
  const auth = useAuth();
  const [dept, setDept] = useState("MODIFY");
  const [phase, setPhase] = useState("quotation");
  const [projects, setProjects] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [options, setOptions] = useState({});
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [projectModal, setProjectModal] = useState(false);
  const [editor, setEditor] = useState(null);
  const [purchase, setPurchase] = useState(null);
  const [rfqOrders, setRfqOrders] = useState(null);
  const [checked, setChecked] = useState(() => new Set());
  const [conversionRows, setConversionRows] = useState(null);

  async function load(force = false) {
    setLoading(true);
    setError("");
    try {
      const [projectsData, optionsData] = await Promise.all([
        apiGet(`/order-projects/?department=${dept}`, { forceRefresh: force }),
        apiGet("/options/", { forceRefresh: force }),
      ]);
      setProjects(projectsData.results || []);
      setOptions(optionsData || {});
      if (selected) {
        const still = (projectsData.results || []).find(
          (project) => project.id === selected.id
        );
        if (still) {
          setSelected(still);
          setDetail(
            await apiGet(`/order-projects/${still.id}/`, {
              forceRefresh: force,
            })
          );
        } else {
          setSelected(null);
          setDetail(null);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSelected(null);
    setDetail(null);
    setChecked(new Set());
    load();
  }, [dept]);

  useEffect(() => setChecked(new Set()), [phase]);

  async function open(project) {
    setSelected(project);
    setLoading(true);
    try {
      setDetail(
        await apiGet(`/order-projects/${project.id}/`, { forceRefresh: true })
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const shown = useMemo(
    () => projects.filter((project) =>
      !q || `${project.name} ${project.owner_name || ""}`
        .toLowerCase()
        .includes(q.toLowerCase())
    ),
    [projects, q]
  );

  const visibleRows = useMemo(() => {
    const key = phase === "quotation" ? "quotation_orders" : "orders";
    return (detail?.steps || []).flatMap((step) => step[key] || []);
  }, [detail, phase]);

  const checkedRows = visibleRows.filter((row) => checked.has(row.id));

  function toggle(id, value) {
    setChecked((current) => {
      const next = new Set(current);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function addStep() {
    if (!selected) return;
    try {
      await apiPost(`/order-projects/${selected.id}/steps/`, {});
      await load(true);
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteStep(step) {
    if (!window.confirm(`ยืนยันลบ Step ${step.step_no}?`)) return;
    try {
      await apiDelete(`/order-projects/${selected.id}/steps/${step.id}/`);
      await load(true);
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteProject() {
    if (!selected || !window.confirm(`ยืนยันลบ Project ${selected.name}?`)) {
      return;
    }
    try {
      await apiDelete(`/order-projects/${selected.id}/`);
      setSelected(null);
      setDetail(null);
      await load(true);
    } catch (err) {
      setError(err.message);
    }
  }

  if (selected && detail) {
    return (
      <MobilePage
        title={selected.name}
        subtitle={`${selected.owner_name || "ไม่ระบุ Owner"} · ${dept}`}
        actions={(
          <div className="m-page-actions">
            <button
              className="m-back-btn"
              onClick={() => {
                setSelected(null);
                setDetail(null);
                setChecked(new Set());
              }}
            >
              ←
            </button>
            <button className="m-icon-action" onClick={() => load(true)}>↻</button>
          </div>
        )}
      >
        <Alert>{error}</Alert>
        <div className="m-segment wide">
          <button
            className={phase === "quotation" ? "active" : ""}
            onClick={() => setPhase("quotation")}
          >
            ขอราคา ({fmt(detail.project?.quotation_items)})
          </button>
          <button
            className={phase === "purchase" ? "active" : ""}
            onClick={() => setPhase("purchase")}
          >
            Order จริง ({fmt(detail.project?.total_items)})
          </button>
        </div>

        {phase === "quotation" ? (
          <div className="m-project-summary">
            <div><span>รอราคา</span><b>{fmt(detail.project?.quotation_waiting)}</b></div>
            <div><span>สร้าง Order ครบ</span><b>{fmt(detail.project?.quotation_converted)}</b></div>
          </div>
        ) : (
          <div className="m-project-summary">
            <div>
              <span>ราคาอะไหล่ทั้งหมด</span>
              <b>฿ {money(detail.project?.total_order_value || 0)}</b>
            </div>
            <div>
              <span>ราคาอะไหล่ที่ใช้</span>
              <b>฿ {money(detail.project?.used_value || 0)}</b>
            </div>
          </div>
        )}

        {auth.can("can_manage_order_projects") && (
          <div className="m-project-actions">
            <button onClick={addStep}>＋ เพิ่ม Step</button>
            <button className="danger" onClick={deleteProject}>ลบ Project</button>
          </div>
        )}

        {phase === "quotation" && checkedRows.length > 0 && (
          <div className="m-project-actions">
            {auth.can("can_edit_purchase_info") && (
              <button onClick={() => setRfqOrders(checkedRows)}>
                บันทึกขอราคา ({checkedRows.length})
              </button>
            )}
            {auth.can("can_create_order_from_quotation") && (
              <button onClick={() => setConversionRows(checkedRows)}>
                สร้างไปยัง Order Step
              </button>
            )}
          </div>
        )}

        <div className="m-step-list">
          {(detail.steps || []).map((step) => {
            const stepRows = phase === "quotation"
              ? (step.quotation_orders || [])
              : (step.orders || []);
            return (
              <section className="m-step" key={step.id}>
                <header>
                  <b>Step {step.step_no}</b>
                  <div className="m-step-head-actions">
                    <span>{stepRows.length} รายการ</span>
                    {auth.can("can_add_order") && (
                      <button onClick={() => setEditor({ order: null, step })}>
                        {phase === "quotation" ? "＋ ขอราคา" : "＋ Order"}
                      </button>
                    )}
                    {auth.can("can_manage_order_projects") && (
                      <button className="danger" onClick={() => deleteStep(step)}>
                        ลบ
                      </button>
                    )}
                  </div>
                </header>
                {stepRows.map((order) => (
                  <article className="m-step-order" key={order.id}>
                    {phase === "quotation" && (
                      <label className="m-rfq-check">
                        <input
                          type="checkbox"
                          checked={checked.has(order.id)}
                          onChange={(event) => toggle(order.id, event.target.checked)}
                        />
                        เลือกรายการ
                      </label>
                    )}
                    <div className="m-row-between">
                      <b>{order.order_number}</b>
                      <span>
                        {phase === "quotation"
                          ? QUOTATION_STAGE[order.quotation_stage_status] || order.quotation_stage_status
                          : order.display_status || order.lifecycle_status || order.status}
                      </span>
                    </div>
                    <h3>{order.item_id || "-"} · {order.part_name || "-"}</h3>
                    <p>{order.part_detail || order.detail || "-"}</p>
                    <small>
                      {fmt(order.amount)} {order.unit_text || order.unit || ""}
                      {` · ${order.machine_code || order.machine_name || "-"}`}
                    </small>
                    {phase === "quotation" && (
                      <small>
                        สร้าง Order แล้ว {fmt(order.converted_quantity)} · คงเหลือ {fmt(order.remaining_quantity)}
                      </small>
                    )}
                    <div className="m-card-actions">
                      {auth.can("can_edit_order_info") && (
                        <button onClick={() => setEditor({ order, step })}>
                          แก้ไข
                        </button>
                      )}
                      <button onClick={() => setPurchase(order)}>
                        {phase === "quotation" ? "Quotation" : "Purchase"}
                      </button>
                      {phase === "quotation" &&
                        auth.can("can_edit_purchase_info") &&
                        ["ACTIVE", "WAIT_CONFIRM"].includes(order.lifecycle_status) && (
                          <button onClick={() => setRfqOrders([order])}>
                            บันทึกขอราคา
                          </button>
                        )}
                    </div>
                  </article>
                ))}
              </section>
            );
          })}
        </div>

        {editor && (
          <OrderInfoModal
            order={editor.order}
            project={detail.project || selected}
            step={editor.step}
            options={options}
            employee={auth.employee}
            quotationMode={phase === "quotation"}
            onClose={() => setEditor(null)}
            onSaved={() => {
              setEditor(null);
              load(true);
            }}
          />
        )}
        {purchase && (
          <PurchaseModal
            order={purchase}
            options={options}
            quotationOnly={phase === "quotation"}
            onClose={() => setPurchase(null)}
            onChanged={(result) => {
              setPurchase(result);
              load(true);
            }}
          />
        )}
        {rfqOrders && (
          <RFQComposeModal
            orders={rfqOrders}
            options={options}
            onClose={() => setRfqOrders(null)}
            onRecorded={() => {
              setRfqOrders(null);
              setChecked(new Set());
              load(true);
            }}
          />
        )}
        {conversionRows && (
          <QuotationConversionModal
            project={selected}
            rows={conversionRows}
            onClose={() => setConversionRows(null)}
            onSaved={() => {
              setConversionRows(null);
              setChecked(new Set());
              load(true);
            }}
          />
        )}
      </MobilePage>
    );
  }

  return (
    <MobilePage
      title="Order Step"
      subtitle="Project Modify / Automation"
      actions={(
        <div className="m-page-actions">
          {auth.can("can_manage_order_projects") && (
            <button className="m-icon-action" onClick={() => setProjectModal(true)}>＋</button>
          )}
          <button className="m-icon-action" onClick={() => load(true)}>↻</button>
        </div>
      )}
    >
      <Alert>{error}</Alert>
      <div className="m-segment">
        <button className={dept === "MODIFY" ? "active" : ""} onClick={() => setDept("MODIFY")}>Modify</button>
        <button className={dept === "AUTOMATION" ? "active" : ""} onClick={() => setDept("AUTOMATION")}>Automation</button>
      </div>
      <MobileSearch value={q} onChange={setQ} placeholder="Project / Owner..." />
      {loading ? (
        <MobileLoading />
      ) : shown.length === 0 ? (
        <MobileEmpty />
      ) : (
        <div className="m-card-list">
          {shown.map((project) => (
            <button className="m-project-card" key={project.id} onClick={() => open(project)}>
              <div>
                <b>{project.name}</b>
                <span>{project.owner_name || "ไม่ระบุ Owner"}</span>
              </div>
              <div>
                <strong>{fmt(project.quotation_items)} ขอราคา · {fmt(project.total_items)} Order</strong>
                <small>{project.step_count || 0} Steps</small>
              </div>
            </button>
          ))}
        </div>
      )}
      {projectModal && (
        <ProjectModal
          department={dept}
          options={options}
          employee={auth.employee}
          onClose={() => setProjectModal(false)}
          onSaved={() => {
            setProjectModal(false);
            load(true);
          }}
        />
      )}
    </MobilePage>
  );
}
