let MENU = [];

const CATS = [
  { k: "all", l: "🍽️ Tất cả" },
  { k: "burger", l: "🍔 Burger" },
  { k: "pizza", l: "🍕 Pizza" },
  { k: "com", l: "🍗 Cơm" },
  { k: "mi", l: "🍜 Mì & Phở" },
  { k: "snack", l: "🥗 Khai vị" },
  { k: "drink", l: "🧋 Đồ uống" },
];

const PROMOS = { BEPNHA15: 15, GIAM10: 10, SALE20: 20 };

let cart = {};
let selCat = "all";
let promoDisc = 0;
let payMode = "cod";
let ordersCache = null;

function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

function fmt(n) {
  return Math.round(n).toLocaleString("vi-VN") + "đ";
}

function tagBadge(t) {
  if (!t) return "";
  const m = { hot: "🔥 Hot", new: "✨ Mới", sale: "🏷️ Sale" };
  return `<div class="badge ${t}">${m[t] ?? t}</div>`;
}

function buildCats() {
  $("catBar").innerHTML = CATS.map(
    (c) => `<button class="cat-btn${c.k === selCat ? " active" : ""}" type="button" data-cat="${c.k}">${c.l}</button>`,
  ).join("");
}

function getFiltered() {
  const q = $("searchInput").value.trim().toLowerCase();
  let list = MENU.filter(
    (m) =>
      (selCat === "all" || m.cat === selCat) &&
      (m.name.toLowerCase().includes(q) || m.desc.toLowerCase().includes(q)),
  );
  const s = $("sortSel").value;
  if (s === "price-asc") list.sort((a, b) => a.price - b.price);
  else if (s === "price-desc") list.sort((a, b) => b.price - a.price);
  else if (s === "rating") list.sort((a, b) => b.rating - a.rating);
  else if (s === "popular") list.sort((a, b) => b.sold - a.sold);
  return list;
}

function render() {
  const list = getFiltered();
  $("countLabel").textContent = String(list.length);
  const g = $("menu-grid");
  if (!list.length) {
    g.innerHTML = `<div class="no-result"><div class="big">🔍</div>Không tìm thấy món phù hợp</div>`;
    return;
  }
  g.innerHTML = list
    .map((m) => {
      const qty = cart[m.id] ?? 0;
      const priceOld = m.orig ? `<span class="fprice-old">${fmt(m.orig)}</span>` : "";
      const img = m.imageUrl
        ? `<img src="${m.imageUrl}" alt="" style="width:100%;height:100%;object-fit:cover" />`
        : `<span aria-hidden="true">${m.emoji}</span>`;
      const right =
        qty > 0
          ? `<div class="qty-ctrl">
              <button class="qty-btn" type="button" data-qty="${m.id}" data-delta="-1">−</button>
              <span class="qty-num">${qty}</span>
              <button class="qty-btn" type="button" data-qty="${m.id}" data-delta="1">+</button>
            </div>`
          : `<button class="btn-add" type="button" data-add="${m.id}">+ Thêm</button>`;

      return `<article class="fcard" aria-label="${m.name}">
        <div class="fcard-img">${tagBadge(m.tag)}${img}</div>
        <div class="fcard-body">
          <div class="fcard-top">
            <div class="fname">${m.name}</div>
            <div class="frating" aria-label="Đánh giá ${m.rating} trên 5">★ ${m.rating}</div>
          </div>
          <div class="fdesc">${m.desc}</div>
          <div class="fcard-bot">
            <div class="fprice-wrap">
              <span class="fprice">${fmt(m.price)}</span>
              ${priceOld}
            </div>
            ${right}
          </div>
        </div>
      </article>`;
    })
    .join("");
}

function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => t.classList.remove("show"), 2400);
}

function addToCart(id) {
  cart[id] = (cart[id] ?? 0) + 1;
  const m = MENU.find((x) => x.id === id);
  if (m) showToast(`Đã thêm ${m.emoji} ${m.name}`);
  renderCart();
  render();
}

function changeQty(id, d) {
  cart[id] = (cart[id] ?? 0) + d;
  if (cart[id] <= 0) delete cart[id];
  renderCart();
  render();
}

function clearCart() {
  cart = {};
  promoDisc = 0;
  $("promoInput").value = "";
  $("promoOk").style.display = "none";
  $("discRow").style.display = "none";
  renderCart();
  render();
}

function renderCart() {
  const ids = Object.keys(cart);
  const count = ids.reduce((s, id) => s + (cart[id] ?? 0), 0);
  $("cartCount").textContent = String(count);
  $("cartBadge").textContent = String(count);

  const total = ids.reduce((s, id) => {
    const m = MENU.find((x) => String(x.id) === String(id));
    return s + (cart[id] ?? 0) * (m?.price ?? 0);
  }, 0);

  if (!ids.length) {
    $("cart-items").innerHTML = `<div class="cart-empty"><div class="eico">🛒</div>Giỏ hàng trống<br><span style="font-size:.8rem">Chọn món bên trái để bắt đầu</span></div>`;
  } else {
    $("cart-items").innerHTML = ids
      .map((id) => {
        const m = MENU.find((x) => String(x.id) === String(id));
        if (!m) return "";
        return `<div class="ci">
          <div class="ci-emo" aria-hidden="true">${m.emoji}</div>
          <div class="ci-info">
            <div class="ci-name">${m.name}</div>
            <div class="ci-price">${fmt(m.price * (cart[id] ?? 0))}</div>
          </div>
          <div class="ci-qty" aria-label="Số lượng">
            <button class="cq-btn" type="button" data-qty="${m.id}" data-delta="-1">−</button>
            <span class="cq-num">${cart[id] ?? 0}</span>
            <button class="cq-btn" type="button" data-qty="${m.id}" data-delta="1">+</button>
          </div>
        </div>`;
      })
      .join("");
  }

  const sub = total;
  const disc = promoDisc ? Math.round((sub * promoDisc) / 100) : 0;
  const ship = sub >= 150000 || sub === 0 ? 0 : 30000;
  const grand = sub - disc + ship;

  $("subTotal").textContent = fmt(sub);
  $("shipFee").textContent = ship === 0 ? "Miễn phí" : fmt(ship);
  $("grandTotal").textContent = fmt(grand);
  $("shipNote").textContent =
    ship > 0 ? `Thêm ${fmt(150000 - sub)} để miễn phí ship` : sub === 0 ? "" : "🎉 Bạn được miễn phí giao hàng!";

  if (disc > 0) {
    $("discRow").style.display = "flex";
    $("discAmt").textContent = "-" + fmt(disc);
  }

  $("checkoutBtn").disabled = ids.length === 0;
}

function applyPromo() {
  const code = $("promoInput").value.trim().toUpperCase();
  const disc = PROMOS[code];
  if (disc) {
    promoDisc = disc;
    const ok = $("promoOk");
    ok.textContent = `✓ Mã "${code}" – Giảm ${promoDisc}% đã áp dụng`;
    ok.style.display = "flex";
    showToast(`Áp dụng mã ${code} thành công!`);
    renderCart();
  } else {
    showToast("Mã giảm giá không hợp lệ");
  }
}

function showOrders() {
  openOrders();
  renderOrders({ loading: true });
  loadOrders({ force: true }).catch(() => {});
}

function openOrders() {
  document.body.classList.add("orders-open");
  $("orders-modal").setAttribute("aria-hidden", "false");
  $("orders-overlay").setAttribute("aria-hidden", "false");
}

function closeOrders() {
  document.body.classList.remove("orders-open");
  $("orders-modal").setAttribute("aria-hidden", "true");
  $("orders-overlay").setAttribute("aria-hidden", "true");
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderOrders({ loading } = {}) {
  const host = $("ordersList");
  if (loading) {
    host.innerHTML = `<div class="order-empty">Đang tải đơn hàng…</div>`;
    return;
  }
  const orders = Array.isArray(ordersCache) ? ordersCache : [];
  if (!orders.length) {
    host.innerHTML = `<div class="order-empty">Chưa có đơn hàng nào.</div>`;
    return;
  }
  host.innerHTML = orders
    .slice(0, 20)
    .map((o) => {
      const items = Array.isArray(o.items) ? o.items : [];
      const itemText = items.slice(0, 3).map((it) => `${esc(it.name)} x${it.qty}`).join(", ");
      const more = items.length > 3 ? ` +${items.length - 3} món` : "";
      const created = o.createdAt ? new Date(o.createdAt).toLocaleString("vi-VN") : "";
      return `
        <div class="order-row">
          <div class="order-row-top">
            <div>
              <div class="order-id">#${esc(o.id)}</div>
              <div class="order-meta">${esc(created)} • Tổng: <b style="color:var(--or)">${fmt(o.totals?.grand ?? 0)}</b></div>
            </div>
            <div class="order-status">${esc(o.status)}</div>
          </div>
          <div class="order-items"><b>Món:</b> ${itemText}${more}</div>
        </div>
      `;
    })
    .join("");
}

async function loadOrders({ force } = {}) {
  if (!force && Array.isArray(ordersCache)) {
    renderOrders();
    return;
  }
  const r = await fetch("/api/orders");
  if (r.status === 401) {
    closeOrders();
    showToast("Vui lòng đăng nhập để xem đơn hàng");
    window.location.href = "/login.html";
    return;
  }
  const j = await r.json().catch(() => ({}));
  ordersCache = Array.isArray(j.orders) ? j.orders : [];
  renderOrders();
}

async function checkout() {
  const name = $("fName").value.trim();
  const phone = $("fPhone").value.trim();
  const addr = $("fAddr").value.trim();
  const note = $("fNote").value.trim();

  if (!name) return showToast("Vui lòng nhập họ tên");
  if (!phone) return showToast("Vui lòng nhập số điện thoại");
  if (!addr) return showToast("Vui lòng nhập địa chỉ");
  if (!Object.keys(cart).length) return showToast("Giỏ hàng đang trống");

  const ids = Object.keys(cart);
  const payLabel = { cod: "Tiền mặt", card: "Thẻ ngân hàng", momo: "MoMo", vnpay: "VNPay" }[payMode] ?? "Tiền mặt";
  const itemLines = ids.map((id) => {
    const m = MENU.find((x) => String(x.id) === String(id));
    return m ? `${m.name} x${cart[id] ?? 0}` : "";
  });

  const apiItems = ids
    .map((id) => {
      const m = MENU.find((x) => String(x.id) === String(id));
      if (!m) return null;
      return { productId: String(m.id), name: m.name, qty: cart[id] ?? 0, price: m.price };
    })
    .filter(Boolean);

  $("checkoutBtn").disabled = true;
  try {
    const r = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: apiItems,
        shipping: { name, phone, addr, note },
        paymentMode: payMode,
        promoDisc,
      }),
    });
    if (r.status === 401) {
      showToast("Vui lòng đăng nhập để đặt hàng");
      window.location.href = "/login.html";
      return;
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "order_failed");

    const order = j.order;
    const orderId = order?.id ?? "N/A";
    const grand = order?.totals?.grand ?? 0;

    if (order) {
      ordersCache = Array.isArray(ordersCache) ? ordersCache : [];
      ordersCache = [order, ...ordersCache.filter((x) => x?.id !== order.id)];
    }

    $("modalSub").textContent = `Cảm ơn ${name}! Đơn hàng #${orderId} đang được xử lý.`;
    $("orderInfo").innerHTML = `
      <div class="oi-row"><span>Mã đơn</span><span>#${orderId}</span></div>
      <div class="oi-row"><span>Món</span><span>${itemLines.slice(0, 2).join(", ")}${itemLines.length > 2 ? " +" + (itemLines.length - 2) + " món" : ""}</span></div>
      <div class="oi-row"><span>Giao đến</span><span style="text-align:right;max-width:180px">${addr}</span></div>
      <div class="oi-row"><span>Thanh toán</span><span>${payLabel}</span></div>
      <div class="oi-row"><span>Tổng cộng</span><span style="color:var(--or)">${fmt(grand)}</span></div>
    `;

    $("success-modal").classList.add("show");
    openCart();
    $("success-modal").scrollIntoView({ behavior: "smooth" });
  } catch {
    showToast("Đặt hàng thất bại. Vui lòng thử lại.");
  } finally {
    $("checkoutBtn").disabled = false;
  }
}

function resetAll() {
  $("success-modal").classList.remove("show");
  cart = {};
  promoDisc = 0;
  $("promoInput").value = "";
  $("promoOk").style.display = "none";
  $("discRow").style.display = "none";
  $("fName").value = "";
  $("fPhone").value = "";
  $("fAddr").value = "";
  $("fNote").value = "";
  renderCart();
  render();
}

function openCart() {
  document.body.classList.add("cart-open");
  $("cart-panel").setAttribute("aria-hidden", "false");
  $("cart-overlay").setAttribute("aria-hidden", "false");
}

function closeCart() {
  document.body.classList.remove("cart-open");
  $("cart-panel").setAttribute("aria-hidden", "true");
  $("cart-overlay").setAttribute("aria-hidden", "true");
}

function toggleCart() {
  if (document.body.classList.contains("cart-open")) closeCart();
  else openCart();
}

function flyToCart(fromElOrPoint, emoji) {
  const cartBtn = $("cartBtn");
  const fromRect = fromElOrPoint?.getBoundingClientRect?.();
  const toRect = cartBtn.getBoundingClientRect();

  const startX =
    typeof fromElOrPoint?.x === "number"
      ? fromElOrPoint.x
      : fromRect
        ? fromRect.left + fromRect.width / 2
        : window.innerWidth / 2;
  const startY =
    typeof fromElOrPoint?.y === "number"
      ? fromElOrPoint.y
      : fromRect
        ? fromRect.top + fromRect.height / 2
        : window.innerHeight / 2;
  const endX = toRect.left + toRect.width / 2;
  const endY = toRect.top + toRect.height / 2;

  const node = document.createElement("div");
  node.className = "fly-item";
  node.textContent = emoji ?? "🛒";
  node.style.transform = `translate3d(${startX - 22}px, ${startY - 22}px, 0) scale(1)`;
  document.body.appendChild(node);

  const dx = endX - startX;
  const dy = endY - startY;

  node
    .animate(
      [
        { transform: `translate3d(${startX - 22}px, ${startY - 22}px, 0) scale(1)`, opacity: 1, offset: 0 },
        { transform: `translate3d(${startX - 22 + dx * 0.65}px, ${startY - 22 + dy * 0.2}px, 0) scale(.92)`, opacity: 1, offset: 0.65 },
        { transform: `translate3d(${endX - 22}px, ${endY - 22}px, 0) scale(.35)`, opacity: 0.15, offset: 1 },
      ],
      { duration: 520, easing: "cubic-bezier(.22,1,.36,1)" },
    )
    .finished.finally(() => node.remove());

  cartBtn
    .animate([{ transform: "translateY(0)" }, { transform: "translateY(-1px)" }, { transform: "translateY(0)" }], {
      duration: 260,
      easing: "ease-out",
    })
    .catch(() => {});
}

function setPayMode(mode) {
  payMode = mode;
  document.querySelectorAll(".pay-opt").forEach((e) => e.classList.toggle("sel", e.dataset.mode === mode));
}

function wireEvents() {
  $("searchInput").addEventListener("input", render);
  $("sortSel").addEventListener("change", render);

  $("ordersBtn").addEventListener("click", showOrders);
  $("ordersCloseBtn").addEventListener("click", closeOrders);
  $("orders-overlay").addEventListener("click", closeOrders);
  $("ordersReloadBtn").addEventListener("click", () => loadOrders({ force: true }));
  $("cartBtn").addEventListener("click", openCart);
  $("cartCloseBtn").addEventListener("click", closeCart);
  $("cart-overlay").addEventListener("click", closeCart);
  $("clearCartBtn").addEventListener("click", clearCart);
  $("applyPromoBtn").addEventListener("click", applyPromo);
  $("checkoutBtn").addEventListener("click", checkout);
  $("resetBtn").addEventListener("click", resetAll);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeCart();
      closeOrders();
    }
  });

  $("catBar").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cat]");
    if (!btn) return;
    selCat = btn.dataset.cat ?? "all";
    buildCats();
    render();
  });

  $("payOpts").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mode]");
    if (!btn) return;
    setPayMode(btn.dataset.mode ?? "cod");
  });

  document.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]");
    if (add) {
      const id = String(add.dataset.add);
      const m = MENU.find((x) => String(x.id) === id);
      addToCart(id);
      flyToCart({ x: e.clientX, y: e.clientY }, m?.emoji);
      return;
    }
    const q = e.target.closest("[data-qty][data-delta]");
    if (q) {
      const id = String(q.dataset.qty);
      const delta = Number(q.dataset.delta);
      const m = MENU.find((x) => String(x.id) === id);
      if (delta > 0) {
        flyToCart({ x: e.clientX, y: e.clientY }, m?.emoji);
      }
      changeQty(id, delta);
    }
  });
}

async function loadProducts() {
  const r = await fetch("/api/products");
  const j = await r.json().catch(() => ({}));
  const list = Array.isArray(j.products) ? j.products : [];
  MENU = list.map((p) => ({ ...p, id: String(p.id) }));
}

async function init() {
  try {
    await loadProducts();
  } catch {
    MENU = [];
  }
  buildCats();
  wireEvents();
  render();
  renderCart();
}

document.addEventListener("DOMContentLoaded", init);

