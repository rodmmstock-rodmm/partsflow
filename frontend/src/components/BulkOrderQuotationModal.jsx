import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost } from "../api";
import { Alert, Modal, SearchableSelect } from "./Common";

function vendorLabel(vendor) {
  if (!vendor) return "";
  return `${vendor.code ? `${vendor.code} · ` : ""}${vendor.name || ""}`;
}

export default function BulkOrderQuotationModal({
  mode,
  orders,
  options,
  onClose,
  onSaved,
}) {
  const [vendorId, setVendorId] = useState("");
  const [stagedVendorIds, setStagedVendorIds] = useState([]);
  const [vendorLists, setVendorLists] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [addingQuotation, setAddingQuotation] = useState(false);
  const [quotationNotice, setQuotationNotice] = useState("");

  const allVendors = options.vendors || [];
  const selectedVendor = allVendors.find(
    (vendor) => String(vendor.id) === String(vendorId)
  );
  const stagedVendors = stagedVendorIds
    .map((id) => allVendors.find((vendor) => String(vendor.id) === String(id)))
    .filter(Boolean);

  // Show the union of vendors already quoted on any selected Order.
  // If the chosen vendor is missing from some selected Orders, offer to add it there.
  const vendorOptions = useMemo(() => {
    const allVendors = options.vendors || [];
    if (mode === "quotation") return allVendors;
    if (loading || error || !orders.length) return [];

    const existingIds = new Set();
    for (const order of orders) {
      for (const row of (vendorLists[String(order.id)] || [])) {
        existingIds.add(String(row.vendor_id));
      }
    }
    return allVendors.filter((vendor) => existingIds.has(String(vendor.id)));
  }, [mode, options.vendors, loading, error, orders, vendorLists]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all(
      orders.map(async (order) => {
        const data = await apiGet(`/orders/${order.id}/vendors/`, {
          cache: false,
          forceRefresh: true,
        });
        return [String(order.id), data.results || []];
      })
    )
      .then((entries) => {
        if (active) setVendorLists(Object.fromEntries(entries));
      })
      .catch((err) => {
        if (active) setError(`โหลด Order Quotation ไม่สำเร็จ: ${err.message}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orders]);

  const previewRows = useMemo(() => orders.map((order) => {
    const vendors = vendorLists[String(order.id)] || [];
    return {
      ...order,
      vendors,
      stagedStatus: stagedVendors.map((vendor) => ({
        vendor,
        alreadyAdded: vendors.some((row) => String(row.vendor_id) === String(vendor.id)),
      })),
      hasVendor: vendors.some((row) => String(row.vendor_id) === String(vendorId)),
      currentVendorOrder: order.vendor_id
        ? allVendors.find((vendor) => String(vendor.id) === String(order.vendor_id))
        : null,
    };
  }), [orders, vendorLists, stagedVendors, vendorId, allVendors]);

  const missingVendorOrders = previewRows.filter((row) => !row.hasVendor);
  const canSave = Boolean(
    !loading && !busy && !error &&
    (mode === "quotation"
      ? stagedVendors.length > 0
      : vendorId && previewRows.length > 0 && missingVendorOrders.length === 0)
  );

  function stageVendor() {
    if (!selectedVendor) return;
    if (stagedVendorIds.some((id) => String(id) === String(vendorId))) {
      setError("เลือก Vendor นี้ไว้แล้ว");
      return;
    }
    setStagedVendorIds((current) => [...current, vendorId]);
    setVendorId("");
    setError("");
  }

  function removeStagedVendor(id) {
    setStagedVendorIds((current) => current.filter((item) => String(item) !== String(id)));
  }

  async function addVendorToMissingQuotations() {
    const vendor = allVendors.find((item) => String(item.id) === String(vendorId));
    if (!vendor || addingQuotation || mode === "quotation") return;
    const existsInSelectedOrder = orders.some((order) =>
      (vendorLists[String(order.id)] || []).some((item) => String(item.vendor_id) === String(vendor.id))
    );
    if (!existsInSelectedOrder) {
      setQuotationNotice("เลือกได้เฉพาะ Vendor ที่มีอยู่ใน Order Quotation ของ Order ที่เลือกอย่างน้อย 1 รายการ");
      return;
    }
    const missingRows = previewRows.filter((row) =>
      !(vendorLists[String(row.id)] || []).some((item) => String(item.vendor_id) === String(vendor.id))
    );
    if (!missingRows.length) {
      setQuotationNotice("Vendor นี้อยู่ใน Order Quotation ของทุกรายการแล้ว");
      return;
    }

    setAddingQuotation(true);
    setError("");
    setQuotationNotice("");
    const failures = [];
    for (const row of missingRows) {
      try {
        await apiPost("/orders/" + row.id + "/vendors/", { vendor_id: vendor.id });
      } catch (err) {
        failures.push(row.order_number + ": " + err.message);
      }
    }

    try {
      const entries = await Promise.all(
        orders.map(async (order) => {
          const data = await apiGet("/orders/" + order.id + "/vendors/", {
            cache: false,
            forceRefresh: true,
          });
          return [String(order.id), data.results || []];
        })
      );
      setVendorLists(Object.fromEntries(entries));
      setVendorId(String(vendor.id));
      setQuotationNotice(
        failures.length
          ? "เพิ่ม Vendor แล้วบางรายการ แต่มี " + failures.length + " รายการที่ไม่สำเร็จ: " + failures.join(" · ")
          : "เพิ่ม " + vendorLabel(vendor) + " ใน Order Quotation ของรายการที่ขาดแล้ว ตรวจสอบรายการด้านล่างก่อนบันทึก Vendor Order"
      );
    } catch (err) {
      setError("เพิ่ม Vendor แล้ว แต่โหลด Order Quotation ล่าสุดไม่สำเร็จ: " + err.message);
    } finally {
      setAddingQuotation(false);
    }
  }

  async function save() {
    if (!canSave) return;
    if (mode !== "quotation" && !selectedVendor) return;
    setBusy(true);
    setError("");
    const successes = [];
    const failures = [];

    if (mode === "quotation") {
      for (const row of previewRows) {
        const existingIds = new Set((vendorLists[String(row.id)] || []).map((item) => String(item.vendor_id)));
        for (const vendor of stagedVendors) {
          if (existingIds.has(String(vendor.id))) {
            successes.push({ order: row, vendor, skipped: true });
            continue;
          }
          try {
            await apiPost("/orders/" + row.id + "/vendors/", { vendor_id: vendor.id });
            successes.push({ order: row, vendor, skipped: false });
          } catch (err) {
            failures.push(row.order_number + " · " + vendorLabel(vendor) + ": " + err.message);
          }
        }
      }
    } else {
      for (const row of previewRows) {
        try {
          if (String(row.vendor_id || "") === String(vendorId)) {
            successes.push({ order: row, unchanged: true });
            continue;
          }
          await apiPatch("/orders/" + row.id + "/purchase/", { vendor_id: vendorId });
          successes.push({ order: row, unchanged: false });
        } catch (err) {
          failures.push(row.order_number + ": " + err.message);
        }
      }
    }

    setResult({
      successCount: successes.filter((row) => !row.skipped && !row.unchanged).length,
      skippedCount: successes.filter((row) => row.skipped || row.unchanged).length,
      failures,
    });
    setBusy(false);
  }
  const title = mode === "quotation" ? "Order Quotation" : "Vendor Order";
  const actionLabel = mode === "quotation" ? "เพิ่ม Vendor ใน Order Quotation" : "บันทึก Vendor Order";

  if (result) {
    return (
      <Modal title={`${title} · ผลการบันทึก`} onClose={onClose} wide>
        <div className={result.failures.length ? "alert warning" : "alert success"}>
          สำเร็จ {result.successCount} รายการ · ไม่ต้องเปลี่ยนแปลง {result.skippedCount} รายการ
          {result.failures.length ? ` · ไม่สำเร็จ ${result.failures.length} รายการ` : ""}
        </div>
        {result.failures.length > 0 && (
          <div className="alert danger">
            {result.failures.map((message) => <div key={message}>{message}</div>)}
          </div>
        )}
        <div className="modal-actions">
          <button
            className="btn primary"
            type="button"
            onClick={() => onSaved?.()}
          >
            เสร็จสิ้น
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`${title} · ${orders.length} Order`} onClose={onClose} wide>
      <style>{`
        @media (max-width: 640px) {
          .order-quotation-responsive table,
          .order-quotation-responsive tbody,
          .order-quotation-responsive tr,
          .order-quotation-responsive td { display: block; width: 100%; box-sizing: border-box; }
          .order-quotation-responsive thead { display: none; }
          .order-quotation-responsive tbody tr { border: 1px solid var(--border, #ddd); border-radius: 10px; padding: 8px 10px; margin: 0 0 10px; }
          .order-quotation-responsive tbody td { display: grid; grid-template-columns: minmax(6rem, 34%) minmax(0, 1fr); gap: 8px; padding: 6px 0; overflow-wrap: anywhere; border: 0; text-align: left; }
          .order-quotation-responsive tbody td::before { color: var(--muted, #666); font-weight: 600; }
          .order-quotation-responsive tbody td:nth-child(1)::before { content: "Order"; }
          .order-quotation-responsive tbody td:nth-child(2)::before { content: "Part ID"; }
          .order-quotation-responsive tbody td:nth-child(3)::before { content: "Vendor Order ปัจจุบัน"; }
          .order-quotation-responsive tbody td:nth-child(4)::before { content: "ผลที่จะเกิดขึ้น"; }
        }
      `}</style>
      <div className="form-grid">
        <label className="field span2">
          <span>{mode !== "quotation" ? "Vendor จาก Order Quotation *" : "เลือก Vendor เพื่อเพิ่มในรายการ *"}</span>
          <SearchableSelect
            required
            value={vendorId}
            options={vendorOptions}
            onChange={setVendorId}
            getLabel={vendorLabel}
            getSearchText={(vendor) => (vendor.code || "") + " " + (vendor.name || "") + " " + (vendor.email || "") + " " + (vendor.contact_person || "")}
            placeholder="พิมพ์ชื่อหรือรหัส Vendor"
          />
          {mode === "quotation" && (
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn ghost" disabled={!selectedVendor || loading || busy || stagedVendorIds.some((id) => String(id) === String(vendorId))} onClick={stageVendor}>
                + เพิ่ม Vendor ในรายการ
              </button>
              {stagedVendors.length > 0 && (
                <div className="quotation-rfq-list" style={{ marginTop: 10 }}>
                  <b>Vendor ที่จะบันทึก ({stagedVendors.length})</b>
                  {stagedVendors.map((vendor) => (
                    <div key={vendor.id}>
                      <span>{vendorLabel(vendor)}</span>
                      <button type="button" className="mini danger" disabled={busy} onClick={() => removeStagedVendor(vendor.id)}>นำออก</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </label>
      </div>

      <Alert>{error}</Alert>
      {quotationNotice && <div className="alert info">{quotationNotice}</div>}
      {!loading && !error && mode !== "quotation" && vendorOptions.length === 0 && (
        <div className="alert warning">
          ไม่มี Vendor ใน Order Quotation ของรายการที่เลือก กรุณาเพิ่ม Vendor ใน Order Quotation อย่างน้อยหนึ่งรายการก่อน
        </div>
      )}
      {loading ? (
        <div className="empty">กำลังตรวจสอบ Order Quotation ของรายการที่เลือก...</div>
      ) : (vendorId || (mode === "quotation" && stagedVendors.length > 0)) ? (
        <>
          {mode === "quotation" ? (
            <div className="alert info">
              เลือก Vendor ได้หลายรายก่อนกดยืนยันบันทึก รายที่มีอยู่แล้วใน Order ใดจะไม่ถูกเพิ่มซ้ำ และระบบจะไม่ส่งอีเมลอัตโนมัติ
            </div>
          ) : (
            <>
              {missingVendorOrders.length ? (
                <div className="alert warning">
                  <b>ไม่มี Vendor นี้ใน Order Quotation ที่บันทึกไว้ของ {missingVendorOrders.length} รายการ</b>
                  <div style={{ marginTop: 6 }}>เพิ่ม Vendor นี้เข้า Order Quotation ของรายการที่ขาดก่อน จึงจะบันทึก Vendor Order ได้</div>
                  {orders.length > 1 && (
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ marginTop: 10 }}
                      disabled={loading || busy || addingQuotation}
                      onClick={addVendorToMissingQuotations}
                    >
                      {addingQuotation ? "กำลังเพิ่มใน Order Quotation..." : "เพิ่ม Vendor นี้ใน Order Quotation ของรายการที่ขาด"}
                    </button>
                  )}
                </div>
              ) : (
                <div className="alert info">
                  ตรวจสอบแล้วว่า Vendor อยู่ใน Order Quotation ของทุกรายการ ระบบจะแสดงตัวอย่างด้านล่างก่อนบันทึก
                </div>
              )}
            </>
          )}
          <div className="table-wrap compact order-quotation-responsive">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Part ID</th>
                  <th>Vendor Order ปัจจุบัน</th>
                  <th>ผลที่จะเกิดขึ้น</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={row.id}>
                    <td><b>{row.order_number}</b></td>
                    <td>{row.item_id || "-"}</td>
                    <td>{row.currentVendorOrder ? vendorLabel(row.currentVendorOrder) : (row.vendor_name || "-")}</td>
                    <td>
                      {mode === "quotation"
                        ? (row.stagedStatus.length
                            ? row.stagedStatus.map(({ vendor, alreadyAdded }) => alreadyAdded
                                ? vendorLabel(vendor) + ": มีแล้ว"
                                : vendorLabel(vendor) + ": เพิ่ม").join(" · ")
                            : "เพิ่ม Vendor ในรายการด้านบนเพื่อดูผลก่อนบันทึก")
                        : missingVendorOrders.some((item) => item.id === row.id)
                          ? "ยังไม่มี Vendor ใน Order Quotation"
                          : String(row.vendor_id || "") === String(vendorId)
                            ? "ใช้ Vendor นี้อยู่แล้ว"
                            : "เปลี่ยนเป็น " + vendorLabel(selectedVendor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="empty">เลือก Vendor เพื่อดูตัวอย่างก่อนบันทึก</div>
      )}

      <div className="modal-actions">
        <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>ยกเลิก</button>
        <button className="btn primary" disabled={!canSave} onClick={save}>
          {busy ? "กำลังบันทึก..." : (mode === "quotation" ? "ยืนยันบันทึก Vendor " + stagedVendors.length + " ราย" : actionLabel)}
        </button>
      </div>
    </Modal>
  );
}
