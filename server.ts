import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

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

// Migration: Add location column if it doesn't exist
try {
  db.prepare("ALTER TABLE trip_items ADD COLUMN location TEXT").run();
} catch (e) {
  // Column probably already exists
}

// Seeding logic: Load from seed.json if DB is empty
const itemCount = (db.prepare("SELECT COUNT(*) as count FROM trip_items").get() as any).count;
const configCount = (db.prepare("SELECT COUNT(*) as count FROM trip_config").get() as any).count;

if (itemCount === 0 && configCount === 0) {
  const seedPath = path.join(process.cwd(), "seed.json");
  if (fs.existsSync(seedPath)) {
    try {
      const seedData = JSON.parse(fs.readFileSync(seedPath, "utf8"));
      if (seedData.items) {
        const insertItem = db.prepare(`
          INSERT INTO trip_items (id, type, name, notes, link, role, cost, chosen, date, time, location)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const item of seedData.items) {
          insertItem.run(
            item.id, 
            item.type, 
            item.name, 
            item.notes, 
            item.link, 
            item.role, 
            item.cost, 
            item.chosen ? 1 : 0, 
            item.date, 
            item.time, 
            item.location
          );
        }
      }
      if (seedData.config) {
        const insertConfig = db.prepare("INSERT INTO trip_config (key, value) VALUES (?, ?)");
        for (const [key, value] of Object.entries(seedData.config)) {
          insertConfig.run(key, value);
        }
      }
      console.log("Database seeded from seed.json");
    } catch (err) {
      console.error("Failed to seed database:", err);
    }
  }
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

app.get("/api/export", (req, res) => {
  const items = db.prepare("SELECT * FROM trip_items").all();
  const config = db.prepare("SELECT * FROM trip_config").all();
  const configMap = config.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {});
  res.json({ items, config: configMap });
});

app.post("/api/import", (req, res) => {
  const { items, config } = req.body;
  
  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM trip_items").run();
    db.prepare("DELETE FROM trip_config").run();
    
    if (items) {
      const insertItem = db.prepare(`
        INSERT INTO trip_items (id, type, name, notes, link, role, cost, chosen, date, time, location)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of items) {
        insertItem.run(
          item.id, 
          item.type, 
          item.name, 
          item.notes, 
          item.link, 
          item.role, 
          item.cost, 
          item.chosen ? 1 : 0, 
          item.date, 
          item.time, 
          item.location
        );
      }
    }
    
    if (config) {
      const insertConfig = db.prepare("INSERT INTO trip_config (key, value) VALUES (?, ?)");
      for (const [key, value] of Object.entries(config)) {
        insertConfig.run(key, value);
      }
    }
  });

  try {
    transaction();
    broadcast({ type: "UPDATE_ITEMS" });
    broadcast({ type: "UPDATE_CONFIG" });
    res.json({ success: true });
  } catch (err) {
    console.error("Import failed:", err);
    res.status(500).json({ error: "Import failed" });
  }
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
