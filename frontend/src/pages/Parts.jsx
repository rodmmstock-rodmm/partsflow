import { useEffect, useState } from "react";
import { apiGet } from "../api";

function getResults(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.results || [];
}

export default function Parts() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load({ search = q, state = status } = {}) {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      params.set("page_size", "50");

      if (search.trim()) params.set("q", search.trim());
      if (state) params.set("status", state);

      const payload = await apiGet(`/parts/?${params.toString()}`);
      const results = getResults(payload);

      setItems(results);
      setCount(payload?.count ?? results.length);
    } catch (err) {
      setError(err.message || "โหลดรายการอะไหล่ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load({ search: "", state: "" });
  }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Parts</h2>
          <p>รายการอะไหล่ทั้งหมด {count ? `· ${count.toLocaleString()} รายการ` : ""}</p>
        </div>
      </div>

      <section className="panel">
        <form
          className="search-row"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหา Part ID / Part Name / Detail / Maker / Supplier"
          />

          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Status</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
            <option value="critical">Critical</option>
          </select>

          <button type="submit">Search</button>
        </form>

        {error && <div className="pf-login-error">{error}</div>}

        {loading ? (
          <div className="empty">กำลังโหลดข้อมูล...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Part ID</th>
                  <th>Part Name</th>
                  <th>Detail</th>
                  <th>Maker</th>
                  <th>Stock</th>
                  <th>Min</th>
                  <th>Location</th>
                </tr>
              </thead>

              <tbody>
                {items.map((part) => (
                  <tr key={part.id}>
                    <td>
                      <strong>{part.sku || part.item_id || part.code || "-"}</strong>
                    </td>
                    <td>{part.name || part.part_name || "-"}</td>
                    <td>{part.description || part.part_detail || part.detail || "-"}</td>
                    <td>
                      {part.maker_name ||
                        part.maker?.name ||
                        part.maker ||
                        "-"}
                    </td>
                    <td>
                      {part.inventory_quantity ??
                        part.quantity ??
                        part.stock_quantity ??
                        "-"}
                    </td>
                    <td>{part.min_stock ?? part.minimum_stock ?? "-"}</td>
                    <td>
                      {part.location_name ||
                        part.location?.name ||
                        part.location ||
                        "-"}
                    </td>
                  </tr>
                ))}

                {!items.length && (
                  <tr>
                    <td colSpan="7" className="empty">
                      ไม่พบรายการอะไหล่
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

