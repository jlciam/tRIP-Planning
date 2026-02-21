import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";

const db = new Database("trip.db");

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS trip_items (
    id TEXT PRIMARY KEY,
    type TEXT,
    name TEXT,
    notes TEXT,
    link TEXT,
    role TEXT,
    cost REAL,
    chosen INTEGER DEFAULT 0,
    date TEXT,
    time TEXT,
    location TEXT
  );
  
  CREATE TABLE IF NOT EXISTS trip_config (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

// API Routes
app.get("/api/items", (req, res) => {
  const items = db.prepare("SELECT * FROM trip_items").all();
  res.json(items);
});

app.post("/api/items", (req, res) => {
  const { id, type, name, notes, link, role, cost, chosen, date, time, location } = req.body;
  db.prepare(`
    INSERT OR REPLACE INTO trip_items (id, type, name, notes, link, role, cost, chosen, date, time, location)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, type, name, notes, link, role, cost, chosen ? 1 : 0, date, time, location);
  broadcast({ type: "UPDATE_ITEMS" });
  res.json({ success: true });
});

app.delete("/api/items/:id", (req, res) => {
  db.prepare("DELETE FROM trip_items WHERE id = ?").run(req.params.id);
  broadcast({ type: "UPDATE_ITEMS" });
  res.json({ success: true });
});

app.get("/api/config", (req, res) => {
  const config = db.prepare("SELECT * FROM trip_config").all();
  const configMap = config.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {});
  res.json(configMap);
});

app.post("/api/config", (req, res) => {
  const { key, value } = req.body;
  db.prepare("INSERT OR REPLACE INTO trip_config (key, value) VALUES (?, ?)").run(key, value);
  broadcast({ type: "UPDATE_CONFIG" });
  res.json({ success: true });
});

// WebSocket logic
function broadcast(data: any) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

wss.on("connection", (ws) => {
  console.log("Client connected");
});

// Vite middleware
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }
}

setupVite().then(() => {
  const PORT = 3000;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
