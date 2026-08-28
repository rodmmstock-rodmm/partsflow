import { useEffect, useState } from "react";
import { apiGet } from "../api";

function resultsOf(payload) {
  return Array.isArray(payload) ? payload : payload?.results || [];
}

export default function Inventory() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(search = q) {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ page_size: "100" });
      if (search.trim()) params.set("q", search.trim());

      const payload = await apiGet(`/inventory/?${params.toString()}`);
      const results = resultsOf(payload);

      setRows(results);
      setCount(payload?.count ?? results.length);
    } catch (err) {
      setError(err.message || "โหลด Inventory ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load("");
  }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Inventory</h2>
          <p>Stock ปัจจุบัน {count ? `· ${count.toLocaleString()} รายการ` : ""}</p>
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
            placeholder="ค้นหา Item / Part / Location"
          />
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
                  <th>Item ID</th>
                  <th>Part Name</th>
                  <th>Quantity</th>
                  <th>Unit</th>
                  <th>Min Stock</th>
                  <th>Location</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => {
                  const part = row.part || {};

                  return (
                    <tr key={row.id}>
                      <td>
                        <strong>
                          {row.part_sku ||
                            row.sku ||
                            part.sku ||
                            part.item_id ||
                            "-"}
                        </strong>
                      </td>
                      <td>
                        {row.part_name ||
                          row.name ||
                          part.name ||
                          part.part_name ||
                          "-"}
                      </td>
                      <td>{row.quantity ?? 0}</td>
                      <td>
                        {row.unit_name ||
                          row.unit ||
                          part.unit_name ||
                          part.unit?.name ||
                          "-"}
                      </td>
                      <td>
                        {row.min_stock ??
                          row.minimum_stock ??
                          part.min_stock ??
                          "-"}
                      </td>
                      <td>
                        {row.location_name ||
                          row.location?.name ||
                          row.location ||
                          part.location_name ||
                          part.location?.name ||
                          "-"}
                      </td>
                    </tr>
                  );
                })}

                {!rows.length && (
                  <tr>
                    <td colSpan="6" className="empty">
                      ไม่พบข้อมูล Inventory
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
