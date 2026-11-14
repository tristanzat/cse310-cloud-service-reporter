// Express for requests, cors so react can connect to it, sqlite for database
const express = require("express");
const cors = require("cors");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();
app.use(cors());
app.use(express.json());

const db = new sqlite3.Database(path.join(__dirname, "services.db"), (err) => {
  if (err) return console.error(err.message);
  console.log("Connected to database");
});

// Promise wrappers around the callback-based sqlite3 API so handlers can use async/await.
// run() uses a regular function (not an arrow) because sqlite3 exposes lastID/changes on `this`.
const run = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve({ id: this.lastID, changes: this.changes });
    }),
  );
const all = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))),
  );
const get = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))),
  );

// Sample data so the report isn't empty on first run; only inserted into an empty table
const SEED = [
  ["Virtual Machines (D4s v5)", "Azure", "Compute", "East US", 280.32, "2025-10"],
  ["Blob Storage (Hot)", "Azure", "Storage", "East US", 46.5, "2025-10"],
  ["Azure SQL Database", "Azure", "Database", "West US 2", 410.0, "2025-10"],
  ["App Service (P1v3)", "Azure", "Compute", "Central US", 138.7, "2025-10"],
  ["EC2 (m5.large)", "AWS", "Compute", "us-east-1", 70.08, "2025-10"],
  ["S3 Standard", "AWS", "Storage", "us-west-2", 23.15, "2025-10"],
  ["RDS PostgreSQL", "AWS", "Database", "us-east-1", 215.4, "2025-10"],
  ["CloudFront", "AWS", "Networking", "Global", 18.9, "2025-10"],
  ["Compute Engine (e2-standard-4)", "GCP", "Compute", "us-central1", 97.3, "2025-10"],
  ["BigQuery", "GCP", "Analytics", "US", 126.75, "2025-10"],
  ["Cloud Storage", "GCP", "Storage", "us-central1", 12.6, "2025-10"],
];

async function init() {
  // IF NOT EXISTS keeps existing data across restarts; the CHECK constraint enforces
  // non-negative cost at the database level, even if the API validation is bypassed
  await run(`CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        category TEXT NOT NULL,
        region TEXT NOT NULL,
        cost REAL NOT NULL CHECK (cost >= 0),
        billing_month TEXT NOT NULL
    )`);
  const { count } = await get("SELECT COUNT(*) AS count FROM services");
  // Seed only when empty so restarts never duplicate rows or overwrite user edits
  if (count === 0) {
    for (const row of SEED) {
      await run(
        "INSERT INTO services (name, provider, category, region, cost, billing_month) VALUES (?, ?, ?, ?, ?, ?)",
        row,
      );
    }
  }
}

// Returns an error message, or null if the body is valid
function validate(body) {
  for (const field of ["name", "provider", "category", "region", "billing_month"]) {
    if (typeof body[field] !== "string" || !body[field].trim()) return `${field} is required`;
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.billing_month.trim())) {
    return "billing_month must be in YYYY-MM format";
  }
  const cost = Number(body.cost);
  // Number('') and Number(null) are both 0, so reject them explicitly instead of treating them as a valid cost
  if (body.cost === "" || body.cost === null || !Number.isFinite(cost) || cost < 0) {
    return "cost must be a non-negative number";
  }
  return null;
}

// Normalized parameter list shared by INSERT and UPDATE (order matches the column order in both queries)
const values = (b) => [
  b.name.trim(),
  b.provider.trim(),
  b.category.trim(),
  b.region.trim(),
  Number(b.cost),
  b.billing_month.trim(),
];

// Express 4 doesn't catch rejected promises from async handlers, so forward them to a 500 response
const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  });

// READ: list services (optionally filtered) plus the total cost of the filtered rows
app.get(
  "/api/services",
  wrap(async (req, res) => {
    const { search, provider, category, region, month } = req.query;
    const where = [];
    const params = [];
    if (search) {
      where.push("name LIKE ?");
      params.push(`%${search}%`);
    }
    // Column names here are hard-coded keys (never user input), so interpolating them is safe;
    // the values themselves always go through ? placeholders to prevent SQL injection
    for (const [column, value] of Object.entries({
      provider,
      category,
      region,
      billing_month: month,
    })) {
      if (value) {
        where.push(`${column} = ?`);
        params.push(value);
      }
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const services = await all(`SELECT * FROM services ${clause} ORDER BY cost DESC`, params);
    // Total is computed in SQL with the same filter so it covers all matching rows; COALESCE gives 0 instead of NULL when none match
    const { total } = await get(
      `SELECT COALESCE(SUM(cost), 0) AS total FROM services ${clause}`,
      params,
    );
    res.json({ services, total });
  }),
);

// READ: distinct values used to populate the filter dropdowns
app.get(
  "/api/filters",
  wrap(async (req, res) => {
    // `column` is only ever passed a literal below, so interpolation is safe here
    const distinct = async (column) =>
      (await all(`SELECT DISTINCT ${column} AS v FROM services ORDER BY v`)).map((r) => r.v);
    res.json({
      providers: await distinct("provider"),
      categories: await distinct("category"),
      regions: await distinct("region"),
      months: await distinct("billing_month"),
    });
  }),
);

// CREATE
app.post(
  "/api/services",
  wrap(async (req, res) => {
    const error = validate(req.body);
    if (error) return res.status(400).json({ error });
    const { id } = await run(
      "INSERT INTO services (name, provider, category, region, cost, billing_month) VALUES (?, ?, ?, ?, ?, ?)",
      values(req.body),
    );
    res.status(201).json(await get("SELECT * FROM services WHERE id = ?", [id]));
  }),
);

// UPDATE
app.put(
  "/api/services/:id",
  wrap(async (req, res) => {
    const error = validate(req.body);
    if (error) return res.status(400).json({ error });
    const { changes } = await run(
      "UPDATE services SET name = ?, provider = ?, category = ?, region = ?, cost = ?, billing_month = ? WHERE id = ?",
      [...values(req.body), req.params.id],
    );
    // changes === 0 means no row had this id
    if (!changes) return res.status(404).json({ error: "Service not found" });
    res.json(await get("SELECT * FROM services WHERE id = ?", [req.params.id]));
  }),
);

// DELETE
app.delete(
  "/api/services/:id",
  wrap(async (req, res) => {
    const { changes } = await run("DELETE FROM services WHERE id = ?", [req.params.id]);
    if (!changes) return res.status(404).json({ error: "Service not found" });
    res.status(204).end();
  }),
);

const PORT = process.env.PORT || 3001;
// Start listening only after the table exists, so early requests can't hit a missing schema
init()
  .then(() => app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`)))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
