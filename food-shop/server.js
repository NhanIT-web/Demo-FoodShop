import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import session from "express-session";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.use(express.json({ limit: "200kb" }));

app.use(
  session({
    name: "foodshop.sid",
    secret: process.env.SESSION_SECRET || "dev-session-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);

app.use(express.static(__dirname));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/health", (_req, res) => res.type("text").send("ok"));

const USERS_PATH = path.join(__dirname, "data", "users.json");
const ORDERS_PATH = path.join(__dirname, "data", "orders.json");
const PRODUCTS_PATH = path.join(__dirname, "data", "products.json");

async function atomicWriteJson(filePath, obj) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = filePath + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(obj, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

async function readProductsFile() {
  try {
    const raw = await fs.readFile(PRODUCTS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return { products: Array.isArray(parsed.products) ? parsed.products : [] };
  } catch {
    return { products: [] };
  }
}

async function writeProductsFile(db) {
  await atomicWriteJson(PRODUCTS_PATH, db);
}

function safeProduct(p) {
  return {
    id: p.id,
    cat: p.cat,
    name: p.name,
    price: p.price,
    orig: p.orig ?? null,
    emoji: p.emoji ?? "🍽️",
    tag: p.tag ?? "",
    rating: p.rating ?? 4.5,
    sold: p.sold ?? 0,
    desc: p.desc ?? "",
    imageUrl: p.imageUrl ?? "",
  };
}

async function readUsersFile() {
  try {
    const raw = await fs.readFile(USERS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return { users: Array.isArray(parsed.users) ? parsed.users : [] };
  } catch {
    return { users: [] };
  }
}

async function writeUsersFile(db) {
  await atomicWriteJson(USERS_PATH, db);
}

async function readOrdersFile() {
  try {
    const raw = await fs.readFile(ORDERS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return { orders: Array.isArray(parsed.orders) ? parsed.orders : [] };
  } catch {
    return { orders: [] };
  }
}

async function writeOrdersFile(db) {
  await atomicWriteJson(ORDERS_PATH, db);
}

function pbkdf2Hash(password, salt) {
  const hash = crypto.pbkdf2Sync(password, salt, 120_000, 32, "sha256");
  return hash.toString("hex");
}

function safeUser(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

async function ensureDefaultAdmin() {
  const db = await readUsersFile();
  const email = process.env.ADMIN_EMAIL || "admin@local";
  const password = process.env.ADMIN_PASSWORD || "admin123";
  const admin = db.users.find((u) => u.id === "u_admin") ?? db.users.find((u) => u.role === "admin");

  if (!admin || admin.id !== "u_admin") {
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = pbkdf2Hash(password, salt);
    db.users.push({
      id: "u_admin",
      email,
      name: "Admin",
      role: "admin",
      passwordHash,
      passwordSalt: salt,
    });
    await writeUsersFile(db);
    // eslint-disable-next-line no-console
    console.log(`Created default admin: ${email} / ${password}`);
    return;
  }

  const needsPassword = !admin.passwordSalt || !admin.passwordHash;
  if (needsPassword) {
    admin.email = admin.email || email;
    admin.name = admin.name || "Admin";
    const salt = crypto.randomBytes(16).toString("hex");
    admin.passwordSalt = salt;
    admin.passwordHash = pbkdf2Hash(password, salt);
    await writeUsersFile(db);
    // eslint-disable-next-line no-console
    console.log(`Initialized admin password for: ${admin.email} / ${password}`);
  }
}

async function ensureDefaultUser() {
  const db = await readUsersFile();
  const email = process.env.USER_EMAIL || "user@local";
  const password = process.env.USER_PASSWORD || "user123";
  const user = db.users.find((u) => u.role === "user");

  if (!user) {
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = pbkdf2Hash(password, salt);
    db.users.push({
      id: "u_user",
      email,
      name: "User",
      role: "user",
      passwordHash,
      passwordSalt: salt,
    });
    await writeUsersFile(db);
    // eslint-disable-next-line no-console
    console.log(`Created default user: ${email} / ${password}`);
    return;
  }

  const isDev = process.env.NODE_ENV !== "production";
  const needsPassword = !user.passwordSalt || !user.passwordHash;
  if (needsPassword || isDev) {
    if (isDev) user.email = email;
    user.email = user.email || email;
    user.name = user.name || "User";
    const salt = crypto.randomBytes(16).toString("hex");
    user.passwordSalt = salt;
    user.passwordHash = pbkdf2Hash(password, salt);
    await writeUsersFile(db);
    // eslint-disable-next-line no-console
    console.log(`${needsPassword ? "Initialized" : "Reset"} user password for: ${user.email} / ${password}`);
  }
}

function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: "unauthorized" });
  next();
}

function requireAdmin(req, res, next) {
  if (req.session?.role !== "admin") return res.status(403).json({ error: "forbidden" });
  next();
}

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: "missing_credentials" });

  const db = await readUsersFile();
  const user = db.users.find((u) => String(u.email).toLowerCase() === String(email).toLowerCase());
  if (!user?.passwordSalt || !user?.passwordHash) return res.status(401).json({ error: "invalid_login" });

  const hash = pbkdf2Hash(String(password), user.passwordSalt);
  if (!crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(user.passwordHash, "hex"))) {
    return res.status(401).json({ error: "invalid_login" });
  }

  req.session.userId = user.id;
  req.session.role = user.role;
  res.json({ user: safeUser(user) });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  const db = await readUsersFile();
  const user = db.users.find((u) => u.id === req.session.userId);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  res.json({ user: safeUser(user) });
});

app.get("/api/admin/users", requireAuth, requireAdmin, async (_req, res) => {
  const db = await readUsersFile();
  res.json({ users: db.users.map(safeUser) });
});

app.post("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
  const { email, name, role, password } = req.body ?? {};
  if (!email || !name || !role || !password) return res.status(400).json({ error: "missing_fields" });
  if (!["admin", "user"].includes(role)) return res.status(400).json({ error: "invalid_role" });

  const db = await readUsersFile();
  const exists = db.users.some((u) => String(u.email).toLowerCase() === String(email).toLowerCase());
  if (exists) return res.status(409).json({ error: "email_exists" });

  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = pbkdf2Hash(String(password), salt);
  const id = "u_" + crypto.randomBytes(8).toString("hex");
  const user = { id, email, name, role, passwordHash, passwordSalt: salt };
  db.users.push(user);
  await writeUsersFile(db);
  res.status(201).json({ user: safeUser(user) });
});

app.patch("/api/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, role, password } = req.body ?? {};
  const db = await readUsersFile();
  const user = db.users.find((u) => u.id === id);
  if (!user) return res.status(404).json({ error: "not_found" });

  if (typeof name === "string" && name.trim()) user.name = name.trim();
  if (typeof role === "string") {
    if (!["admin", "user"].includes(role)) return res.status(400).json({ error: "invalid_role" });
    user.role = role;
  }
  if (typeof password === "string" && password.length >= 4) {
    const salt = crypto.randomBytes(16).toString("hex");
    user.passwordSalt = salt;
    user.passwordHash = pbkdf2Hash(password, salt);
  }

  await writeUsersFile(db);
  res.json({ user: safeUser(user) });
});

app.delete("/api/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const db = await readUsersFile();
  const idx = db.users.findIndex((u) => u.id === id);
  if (idx === -1) return res.status(404).json({ error: "not_found" });
  if (db.users[idx].id === req.session.userId) return res.status(400).json({ error: "cannot_delete_self" });
  db.users.splice(idx, 1);
  await writeUsersFile(db);
  res.json({ ok: true });
});

function normalizeItems(items) {
  const out = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (!it) continue;
    const qty = Number(it.qty);
    const price = Number(it.price);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    if (!Number.isFinite(price) || price < 0) continue;
    const name = String(it.name ?? "").trim();
    if (!name) continue;
    out.push({
      productId: String(it.productId ?? it.id ?? ""),
      name,
      qty: Math.min(99, Math.floor(qty)),
      price: Math.round(price),
    });
  }
  return out;
}

function computeTotals({ items, promoDisc }) {
  const sub = items.reduce((s, it) => s + it.qty * it.price, 0);
  const discP = Number(promoDisc) || 0;
  const disc = discP > 0 ? Math.round((sub * discP) / 100) : 0;
  const ship = sub >= 150000 || sub === 0 ? 0 : 30000;
  const grand = sub - disc + ship;
  return { sub, disc, ship, grand, promoDisc: discP > 0 ? discP : 0 };
}

app.get("/api/orders", requireAuth, async (req, res) => {
  const db = await readOrdersFile();
  const my = db.orders.filter((o) => o.userId === req.session.userId);
  res.json({ orders: my });
});

app.post("/api/orders", requireAuth, async (req, res) => {
  const { items, shipping, paymentMode, promoDisc } = req.body ?? {};
  const normItems = normalizeItems(items);
  if (!normItems.length) return res.status(400).json({ error: "empty_items" });

  const ship = shipping ?? {};
  const name = String(ship.name ?? "").trim();
  const phone = String(ship.phone ?? "").trim();
  const addr = String(ship.addr ?? "").trim();
  const note = String(ship.note ?? "").trim();
  if (!name || !phone || !addr) return res.status(400).json({ error: "missing_shipping" });

  const pay = String(paymentMode ?? "cod");
  if (!["cod", "card", "momo", "vnpay"].includes(pay)) return res.status(400).json({ error: "invalid_payment" });

  const totals = computeTotals({ items: normItems, promoDisc });
  const id = "OD" + String(Date.now()).slice(-8) + crypto.randomBytes(2).toString("hex");
  const order = {
    id,
    userId: req.session.userId,
    status: "new",
    createdAt: new Date().toISOString(),
    items: normItems,
    shipping: { name, phone, addr, note },
    paymentMode: pay,
    totals,
  };

  const db = await readOrdersFile();
  db.orders.unshift(order);
  await writeOrdersFile(db);
  res.status(201).json({ order });
});

app.get("/api/admin/orders", requireAuth, requireAdmin, async (_req, res) => {
  const db = await readOrdersFile();
  res.json({ orders: db.orders });
});

app.post("/api/admin/orders", requireAuth, requireAdmin, async (req, res) => {
  // allow admin to create manual order
  const { userId, items, shipping, paymentMode, promoDisc, status } = req.body ?? {};
  const normItems = normalizeItems(items);
  if (!normItems.length) return res.status(400).json({ error: "empty_items" });
  const ship = shipping ?? {};
  const name = String(ship.name ?? "").trim();
  const phone = String(ship.phone ?? "").trim();
  const addr = String(ship.addr ?? "").trim();
  const note = String(ship.note ?? "").trim();
  if (!name || !phone || !addr) return res.status(400).json({ error: "missing_shipping" });

  const pay = String(paymentMode ?? "cod");
  if (!["cod", "card", "momo", "vnpay"].includes(pay)) return res.status(400).json({ error: "invalid_payment" });

  const st = String(status ?? "new");
  const allowed = ["new", "confirmed", "cooking", "delivering", "done", "cancelled"];
  if (!allowed.includes(st)) return res.status(400).json({ error: "invalid_status" });

  const totals = computeTotals({ items: normItems, promoDisc });
  const id = "OD" + String(Date.now()).slice(-8) + crypto.randomBytes(2).toString("hex");
  const order = {
    id,
    userId: String(userId || "manual"),
    status: st,
    createdAt: new Date().toISOString(),
    items: normItems,
    shipping: { name, phone, addr, note },
    paymentMode: pay,
    totals,
  };

  const db = await readOrdersFile();
  db.orders.unshift(order);
  await writeOrdersFile(db);
  res.status(201).json({ order });
});

app.patch("/api/admin/orders/:id", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status, shipping } = req.body ?? {};
  const db = await readOrdersFile();
  const order = db.orders.find((o) => o.id === id);
  if (!order) return res.status(404).json({ error: "not_found" });

  if (typeof status === "string") {
    const allowed = ["new", "confirmed", "cooking", "delivering", "done", "cancelled"];
    if (!allowed.includes(status)) return res.status(400).json({ error: "invalid_status" });
    order.status = status;
  }
  if (shipping && typeof shipping === "object") {
    if (typeof shipping.name === "string") order.shipping.name = shipping.name.trim() || order.shipping.name;
    if (typeof shipping.phone === "string") order.shipping.phone = shipping.phone.trim() || order.shipping.phone;
    if (typeof shipping.addr === "string") order.shipping.addr = shipping.addr.trim() || order.shipping.addr;
    if (typeof shipping.note === "string") order.shipping.note = shipping.note.trim();
  }

  await writeOrdersFile(db);
  res.json({ order });
});

app.delete("/api/admin/orders/:id", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const db = await readOrdersFile();
  const idx = db.orders.findIndex((o) => o.id === id);
  if (idx === -1) return res.status(404).json({ error: "not_found" });
  db.orders.splice(idx, 1);
  await writeOrdersFile(db);
  res.json({ ok: true });
});

// Products (public read)
app.get("/api/products", async (_req, res) => {
  const db = await readProductsFile();
  res.json({ products: db.products.map(safeProduct) });
});

// Products (admin CRUD)
app.get("/api/admin/products", requireAuth, requireAdmin, async (_req, res) => {
  const db = await readProductsFile();
  res.json({ products: db.products.map(safeProduct) });
});

app.post("/api/admin/products", requireAuth, requireAdmin, async (req, res) => {
  const { cat, name, price, orig, emoji, tag, rating, sold, desc } = req.body ?? {};
  if (!cat || !name) return res.status(400).json({ error: "missing_fields" });
  const pr = Number(price);
  if (!Number.isFinite(pr) || pr <= 0) return res.status(400).json({ error: "invalid_price" });

  const db = await readProductsFile();
  const id = "p_" + crypto.randomBytes(8).toString("hex");
  const p = {
    id,
    cat: String(cat),
    name: String(name),
    price: Math.round(pr),
    orig: orig === null || orig === undefined || orig === "" ? null : Math.round(Number(orig)),
    emoji: emoji ? String(emoji) : "🍽️",
    tag: tag ? String(tag) : "",
    rating: rating === undefined ? 4.5 : Number(rating),
    sold: sold === undefined ? 0 : Number(sold),
    desc: desc ? String(desc) : "",
    imageUrl: "",
  };
  db.products.unshift(p);
  await writeProductsFile(db);
  res.status(201).json({ product: safeProduct(p) });
});

app.patch("/api/admin/products/:id", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const db = await readProductsFile();
  const p = db.products.find((x) => x.id === id);
  if (!p) return res.status(404).json({ error: "not_found" });

  const { cat, name, price, orig, emoji, tag, rating, sold, desc, imageUrl } = req.body ?? {};
  if (typeof cat === "string" && cat.trim()) p.cat = cat.trim();
  if (typeof name === "string" && name.trim()) p.name = name.trim();
  if (price !== undefined) {
    const pr = Number(price);
    if (!Number.isFinite(pr) || pr <= 0) return res.status(400).json({ error: "invalid_price" });
    p.price = Math.round(pr);
  }
  if (orig !== undefined) {
    if (orig === null || orig === "") p.orig = null;
    else {
      const o = Number(orig);
      if (!Number.isFinite(o) || o <= 0) return res.status(400).json({ error: "invalid_orig" });
      p.orig = Math.round(o);
    }
  }
  if (typeof emoji === "string") p.emoji = emoji;
  if (typeof tag === "string") p.tag = tag;
  if (rating !== undefined) p.rating = Number(rating);
  if (sold !== undefined) p.sold = Number(sold);
  if (typeof desc === "string") p.desc = desc;
  if (typeof imageUrl === "string") p.imageUrl = imageUrl;

  await writeProductsFile(db);
  res.json({ product: safeProduct(p) });
});

app.delete("/api/admin/products/:id", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const db = await readProductsFile();
  const idx = db.products.findIndex((x) => x.id === id);
  if (idx === -1) return res.status(404).json({ error: "not_found" });
  db.products.splice(idx, 1);
  await writeProductsFile(db);
  res.json({ ok: true });
});

// Upload product image (admin)
const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => {
      try {
        const dir = path.join(__dirname, "uploads");
        await fs.mkdir(dir, { recursive: true });
        cb(null, dir);
      } catch (e) {
        cb(e);
      }
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".png";
      cb(null, `p_${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype);
    cb(ok ? null : new Error("invalid_file"), ok);
  },
});

app.post("/api/admin/products/:id/image", requireAuth, requireAdmin, upload.single("image"), async (req, res) => {
  const { id } = req.params;
  const db = await readProductsFile();
  const p = db.products.find((x) => x.id === id);
  if (!p) return res.status(404).json({ error: "not_found" });
  if (!req.file?.filename) return res.status(400).json({ error: "missing_file" });
  p.imageUrl = `/uploads/${req.file.filename}`;
  await writeProductsFile(db);
  res.json({ product: safeProduct(p) });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  const baseUrl = `http://localhost:${PORT}`;
  // In ra URL để terminal/VS Code tự nhận dạng link và bạn có thể bấm mở ngay.
  console.log([
    "Food Shop is running.",
    `Open: ${baseUrl}/`,
    `Health: ${baseUrl}/health`,
  ].join("\n"));
});

ensureDefaultAdmin().catch(() => {});
ensureDefaultUser().catch(() => {});

