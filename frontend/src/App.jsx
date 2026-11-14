import { useCallback, useEffect, useState } from "react";
import "./App.css";

const API = "http://localhost:3001/api";
const EMPTY_FORM = {
  name: "",
  provider: "",
  category: "",
  region: "",
  cost: "",
  billing_month: "",
};
const EMPTY_FILTERS = { search: "", provider: "", category: "", region: "", month: "" };

// Formats costs consistently (e.g. $1,234.50) in the total, table, and footer
const money = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

// Thin fetch wrapper: surfaces the server's { error } message as a thrown Error so callers have one catch path
async function request(path, options) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  // DELETE returns 204 with no body, so calling res.json() would throw
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function App() {
  const [services, setServices] = useState([]);
  const [total, setTotal] = useState(0);
  const [options, setOptions] = useState({
    providers: [],
    categories: [],
    regions: [],
    months: [],
  });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");

  // Memoized on `filters` so the effect below re-fetches only when a filter changes
  const load = useCallback(async () => {
    try {
      // Drop empty filters so the URL only contains active ones
      const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
      // Filter options are refetched too, so dropdowns include values from newly added/edited rows
      const [list, opts] = await Promise.all([request(`/services?${query}`), request("/filters")]);
      setServices(list.services);
      setTotal(list.total);
      setOptions(opts);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  // Curried setters: setFilter('provider') returns a handler for that one key; functional updates avoid stale state
  const setFilter = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }));
  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      await request(editingId ? `/services/${editingId}` : "/services", {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(form),
      });
      resetForm();
      // Reload from the server so the list, total, and sort order reflect what was actually saved
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  // Cost is stringified because the number input's value is a string
  const edit = (s) => {
    setEditingId(s.id);
    setForm({ ...s, cost: String(s.cost) });
  };

  const remove = async (s) => {
    if (!window.confirm(`Delete "${s.name}"?`)) return;
    try {
      await request(`/services/${s.id}`, { method: "DELETE" });
      // Avoid leaving the form pointed at a row that no longer exists
      if (editingId === s.id) resetForm();
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="app">
      <div className="header">
        <h1>Cloud Services Cost Report</h1>
        <div className="total">
          <span>Total cost (current filters)</span>
          <strong>{money(total)}</strong>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <section className="card">
        <h2>Filters</h2>
        <div className="grid">
          <label>
            Search name
            <input
              value={filters.search}
              placeholder="e.g. storage"
              onChange={(e) => setFilter("search")(e.target.value)}
            />
          </label>
          <FilterSelect
            label="Provider"
            value={filters.provider}
            options={options.providers}
            onChange={setFilter("provider")}
          />
          <FilterSelect
            label="Category"
            value={filters.category}
            options={options.categories}
            onChange={setFilter("category")}
          />
          <FilterSelect
            label="Region"
            value={filters.region}
            options={options.regions}
            onChange={setFilter("region")}
          />
          <FilterSelect
            label="Billing month"
            value={filters.month}
            options={options.months}
            onChange={setFilter("month")}
          />
          <button type="button" className="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear filters
          </button>
        </div>
      </section>

      <section className="card">
        <h2>{editingId ? "Edit service" : "Add service"}</h2>
        <form onSubmit={submit} className="grid">
          <label>
            Service name
            <input required value={form.name} onChange={setField("name")} />
          </label>
          <label>
            Provider
            <input
              required
              list="providers"
              value={form.provider}
              onChange={setField("provider")}
            />
          </label>
          <label>
            Category
            <input
              required
              list="categories"
              value={form.category}
              onChange={setField("category")}
            />
          </label>
          <label>
            Region
            <input required list="regions" value={form.region} onChange={setField("region")} />
          </label>
          <label>
            Cost (USD)
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={form.cost}
              onChange={setField("cost")}
            />
          </label>
          <label>
            Billing month
            <input
              required
              type="month"
              value={form.billing_month}
              onChange={setField("billing_month")}
            />
          </label>
          <div className="actions">
            <button type="submit">{editingId ? "Save" : "Add"}</button>
            {editingId && (
              <button type="button" className="secondary" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
        </form>
        {/* Datalists suggest existing values but still allow typing new ones, unlike a strict select */}
        <datalist id="providers">
          {options.providers.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
        <datalist id="categories">
          {options.categories.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
        <datalist id="regions">
          {options.regions.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </section>

      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th>Provider</th>
              <th>Category</th>
              <th>Region</th>
              <th>Month</th>
              <th className="num">Cost</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {services.length === 0 && (
              <tr>
                <td colSpan="7" className="empty">
                  No services match the current filters.
                </td>
              </tr>
            )}
            {services.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.provider}</td>
                <td>{s.category}</td>
                <td>{s.region}</td>
                <td>{s.billing_month}</td>
                <td className="num">{money(s.cost)}</td>
                <td>
                  <div className="actions">
                    <button type="button" className="secondary" onClick={() => edit(s)}>
                      Edit
                    </button>
                    <button type="button" className="danger" onClick={() => remove(s)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="5">Total ({services.length} services)</td>
              <td className="num">{money(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}
