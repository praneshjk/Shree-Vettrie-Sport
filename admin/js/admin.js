(() => {
"use strict";
const CFG = window.APP_CONFIG;
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);
const A = { cats: [], products: [], orders: [], enq: [], settings: {}, user: null };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const dt = (d) => new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const catOf = (id) => A.cats.find((c) => c.id === id);
const ST = { new: ["New", "blue"], confirmed: ["Confirmed", "amber"], packed: ["Packed", "amber"], shipped: ["Shipped", "blue"], delivered: ["Delivered", "green"], cancelled: ["Cancelled", "red"] };
const PS = { pending: ["Pending", "gray"], submitted: ["Verify UTR", "amber"], paid: ["Paid", "green"], failed: ["Failed", "red"], refunded: ["Refunded", "red"] };
const tag = (m, k) => `<span class="tag ${m[k][1]}">${m[k][0]}</span>`;

function toast(m, err) {
  const t = document.createElement("div"); t.className = "toast" + (err ? " err" : ""); t.textContent = m; $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
function modal(html) { $("#modal").innerHTML = html; $("#modalBg").classList.add("on"); }
function closeModal() { $("#modalBg").classList.remove("on"); $("#modal").innerHTML = ""; }
$("#modalBg").addEventListener("mousedown", (e) => { if (e.target.id === "modalBg") closeModal(); });
async function guard(p, label) { const { data, error } = await p; if (error) { console.error(error); toast((label || "Error") + ": " + error.message, true); throw error; } return data; }

/* ---------- auth ---------- */
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const b = $("#loginBtn"), er = $("#loginErr"); er.textContent = ""; b.disabled = true; b.innerHTML = '<span class="spin"></span>';
  const { error } = await sb.auth.signInWithPassword({ email: $("#email").value.trim(), password: $("#password").value });
  b.disabled = false; b.textContent = "Sign in";
  if (error) return (er.textContent = error.message);
  await enter();
});
async function enter() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  const { data, error } = await sb.from("admins").select("email").limit(1);
  if (error || !data || !data.length) {
    await sb.auth.signOut();
    $("#loginErr").textContent = error ? "Database not set up yet: " + error.message : "This account is not an admin. Add its email to the admins table.";
    return;
  }
  A.user = session.user;
  $("#login").hidden = true; $("#app").hidden = false; $("#who").textContent = session.user.email;
  $("#storeLink").href = location.pathname.includes("/admin") ? location.pathname.replace(/\/admin\/?.*$/, "/shop/index.html") : "../shop/index.html";
  await loadAll(); go();
}
$("#logout").onclick = async () => { await sb.auth.signOut(); location.reload(); };

/* ---------- data ---------- */
async function loadAll() {
  const [c, p, o, e, s] = await Promise.all([
    sb.from("categories").select("*").order("sort_order"),
    sb.from("products").select("*").order("created_at", { ascending: false }),
    sb.from("orders").select("*").order("created_at", { ascending: false }),
    sb.from("enquiries").select("*").order("created_at", { ascending: false }),
    sb.from("site_settings").select("*"),
  ]);
  [c, p, o, e, s].forEach((r) => r.error && toast(r.error.message, true));
  A.cats = c.data || []; A.products = (p.data || []).map((x) => ({ ...x, price: Number(x.price), mrp: x.mrp ? Number(x.mrp) : null }));
  A.orders = (o.data || []).map((x) => ({ ...x, total: Number(x.total), subtotal: Number(x.subtotal), shipping: Number(x.shipping) }));
  A.enq = e.data || []; A.settings = {}; (s.data || []).forEach((r) => (A.settings[r.key] = r.value));
  $("#pillOrders").textContent = A.orders.filter((x) => x.status === "new" || x.payment_status === "submitted").length || "";
  $("#pillEnq").textContent = A.enq.filter((x) => !x.handled).length || "";
}

/* ---------- router ---------- */
const VIEWS = { dashboard: ["Dashboard", vDash], orders: ["Orders", vOrders], products: ["Products", vProducts], categories: ["Categories", vCats], enquiries: ["Bulk Enquiries", vEnq], settings: ["Store Settings", vSettings] };
function go() {
  const v = location.hash.replace("#", "") || "dashboard"; const [title, fn] = VIEWS[v] || VIEWS.dashboard;
  $("#title").textContent = title; $$("#menu a").forEach((a) => a.classList.toggle("on", a.dataset.v === v));
  $("#side").classList.remove("on"); $("#content").innerHTML = ""; fn();
}
window.addEventListener("hashchange", () => { if (!$("#app").hidden) go(); });
$("#burger").onclick = () => $("#side").classList.toggle("on");
async function refresh() { await loadAll(); go(); }

/* ---------- dashboard ---------- */
function vDash() {
  const paid = A.orders.filter((o) => o.payment_status === "paid");
  const today = new Date().toDateString();
  const low = A.products.filter((p) => p.stock <= 5);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d; });
  const rev = days.map((d) => paid.filter((o) => new Date(o.created_at).toDateString() === d.toDateString()).reduce((a, o) => a + o.total, 0));
  const mx = Math.max(...rev, 1);
  $("#content").innerHTML = `
  ${A.cats.length === 0 && A.products.length === 0 ? `<div class="warn">Welcome! Start by adding <b>Categories</b>, then your <b>Products</b>, and customise your store in <b>Store Settings</b>.</div>` : ""}
  <div class="cards">
    <div class="stat"><span class="em">💰</span><small>Revenue (paid)</small><b>${money(paid.reduce((a, o) => a + o.total, 0))}</b></div>
    <div class="stat"><span class="em">🧾</span><small>Total orders</small><b>${A.orders.length}</b></div>
    <div class="stat"><span class="em">🆕</span><small>Orders today</small><b>${A.orders.filter((o) => new Date(o.created_at).toDateString() === today).length}</b></div>
    <div class="stat"><span class="em">⏳</span><small>Payments to verify</small><b>${A.orders.filter((o) => o.payment_status === "submitted").length}</b></div>
    <div class="stat"><span class="em">📦</span><small>Products</small><b>${A.products.length}</b></div>
    <div class="stat"><span class="em">⚠️</span><small>Low stock (≤5)</small><b>${low.length}</b></div>
  </div>
  <div class="two"><div class="panel"><h3>Last 7 days – paid revenue</h3><div class="bars">${rev.map((v, i) => `<div class="bar"><b>${v ? money(v) : ""}</b><i style="height:${(v / mx) * 78}%"></i>${days[i].toLocaleDateString("en-IN", { weekday: "short" })}</div>`).join("")}</div></div>
  <div class="panel"><h3>Low stock</h3>${low.length ? low.slice(0, 8).map((p) => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)"><span>${esc(p.name)}</span><span class="tag ${p.stock <= 0 ? "red" : "amber"}">${p.stock} left</span></div>`).join("") : '<div class="empty">All products well stocked ✓</div>'}</div></div>
  <div class="panel"><h3>Recent orders</h3>${ordersTable(A.orders.slice(0, 6))}</div>`;
  bindOrderRows();
}

/* ---------- orders ---------- */
function ordersTable(list) {
  if (!list.length) return '<div class="empty">No orders yet</div>';
  return `<div class="tbl-w" style="border:0"><table><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th><th>Date</th></tr></thead><tbody>${list.map((o) => `
    <tr class="hov" data-order="${o.id}" style="cursor:pointer"><td><b>${esc(o.order_no)}</b></td><td>${esc(o.customer_name)}<br><small style="color:var(--muted)">${esc(o.phone)}</small></td><td><b>${money(o.total)}</b></td><td>${tag(PS, o.payment_status)}</td><td>${tag(ST, o.status)}</td><td>${dt(o.created_at)}</td></tr>`).join("")}</tbody></table></div>`;
}
function bindOrderRows() { $$("[data-order]").forEach((r) => r.addEventListener("click", () => orderModal(r.dataset.order))); }
let OF = { q: "", status: "", pay: "" };
function vOrders() {
  const list = A.orders.filter((o) => (!OF.status || o.status === OF.status) && (!OF.pay || o.payment_status === OF.pay) && (!OF.q || `${o.order_no} ${o.customer_name} ${o.phone}`.toLowerCase().includes(OF.q.toLowerCase())));
  $("#content").innerHTML = `<div class="toolbar"><input class="in" id="oq" placeholder="Search order no, name, phone" value="${esc(OF.q)}">
    <select class="in" id="os" style="max-width:170px"><option value="">All statuses</option>${Object.keys(ST).map((k) => `<option value="${k}" ${OF.status === k ? "selected" : ""}>${ST[k][0]}</option>`).join("")}</select>
    <select class="in" id="op" style="max-width:170px"><option value="">All payments</option>${Object.keys(PS).map((k) => `<option value="${k}" ${OF.pay === k ? "selected" : ""}>${PS[k][0]}</option>`).join("")}</select>
    <button class="btn line sp" id="csv">⬇ Export CSV</button></div>${ordersTable(list)}`;
  bindOrderRows();
  $("#oq").oninput = (e) => { OF.q = e.target.value; clearTimeout(vOrders.t); vOrders.t = setTimeout(() => { vOrders(); const i = $("#oq"); i.focus(); i.setSelectionRange(99, 99); }, 300); };
  $("#os").onchange = (e) => { OF.status = e.target.value; vOrders(); };
  $("#op").onchange = (e) => { OF.pay = e.target.value; vOrders(); };
  $("#csv").onclick = () => {
    const rows = [["Order", "Date", "Customer", "Phone", "Address", "City", "Pincode", "Items", "Total", "Payment", "UTR", "Status"]].concat(list.map((o) => [o.order_no, dt(o.created_at), o.customer_name, o.phone, o.address, o.city, o.pincode, (o.items || []).map((i) => `${i.name} x${i.qty}`).join("; "), o.total, o.payment_status, o.upi_ref || "", o.status]));
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = "orders.csv"; a.click();
  };
}
function orderModal(id) {
  const o = A.orders.find((x) => x.id === id); if (!o) return;
  modal(`<h3>Order ${esc(o.order_no)}</h3>
  <div class="kv"><b>Placed</b><span>${dt(o.created_at)}</span><b>Customer</b><span>${esc(o.customer_name)}</span><b>Phone</b><span><a href="tel:${esc(o.phone)}" style="color:var(--blue);font-weight:600">${esc(o.phone)}</a> · <a target="_blank" href="https://wa.me/91${esc(o.phone)}" style="color:var(--green);font-weight:600">WhatsApp</a></span>
  ${o.email ? `<b>Email</b><span>${esc(o.email)}</span>` : ""}<b>Address</b><span>${esc(o.address)}, ${esc(o.city || "")} – ${esc(o.pincode || "")}</span>${o.notes ? `<b>Notes</b><span>${esc(o.notes)}</span>` : ""}
  <b>Pay method</b><span>${esc(o.payment_method || "UPI")}</span><b>UTR / Ref</b><span><b style="color:var(--ink)">${esc(o.upi_ref || "— not submitted —")}</b></span></div>
  <div class="tbl-w"><table style="min-width:0"><thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead><tbody>${(o.items || []).map((i) => `<tr><td>${esc(i.name)}${i.size ? ` <span class="tag">${esc(i.size)}</span>` : ""}</td><td>${i.qty}</td><td>${money(i.price * i.qty)}</td></tr>`).join("")}
  <tr><td colspan="2" style="text-align:right">Shipping</td><td>${money(o.shipping)}</td></tr><tr><td colspan="2" style="text-align:right"><b>Total</b></td><td><b>${money(o.total)}</b></td></tr></tbody></table></div>
  <div class="fgrid" style="margin-top:16px"><div><label class="f">Order status</label><select class="in" id="m_status">${Object.keys(ST).map((k) => `<option value="${k}" ${o.status === k ? "selected" : ""}>${ST[k][0]}</option>`).join("")}</select></div>
  <div><label class="f">Payment status</label><select class="in" id="m_pay">${Object.keys(PS).map((k) => `<option value="${k}" ${o.payment_status === k ? "selected" : ""}>${PS[k][0]}</option>`).join("")}</select></div></div>
  <p style="font-size:12.5px;color:var(--muted);margin-top:8px">Stock is deducted automatically the first time payment is marked <b>Paid</b>.</p>
  <div class="modal-f"><button class="btn red sm" id="m_del">Delete</button><button class="btn line sm" id="m_print">🖨 Invoice</button><button class="btn line" id="m_close">Close</button><button class="btn gold" id="m_save">Save changes</button></div>`);
  $("#m_close").onclick = closeModal;
  $("#m_del").onclick = async () => { if (!confirm("Delete this order permanently?")) return; await guard(sb.from("orders").delete().eq("id", id)); closeModal(); toast("Order deleted"); refresh(); };
  $("#m_print").onclick = () => printInvoice(o);
  $("#m_save").onclick = async () => {
    const status = $("#m_status").value, pay = $("#m_pay").value, upd = { status, payment_status: pay };
    const b = $("#m_save"); b.disabled = true;
    if (pay === "paid" && !o.stock_deducted) {
      for (const it of o.items || []) {
        const p = A.products.find((x) => x.id === it.id);
        if (p) await guard(sb.from("products").update({ stock: Math.max(0, p.stock - it.qty) }).eq("id", p.id), "Stock update");
      }
      upd.stock_deducted = true;
    }
    await guard(sb.from("orders").update(upd).eq("id", id), "Save");
    closeModal(); toast("Order updated ✓"); refresh();
  };
}
function printInvoice(o) {
  const s = A.settings, w = window.open("", "_blank");
  w.document.write(`<html><head><title>Invoice ${esc(o.order_no)}</title><style>body{font-family:Arial,sans-serif;padding:30px;color:#111;max-width:780px;margin:auto}h1{color:#071230;margin:0}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border-bottom:1px solid #ddd;padding:9px;text-align:left}.r{text-align:right}.hd{display:flex;justify-content:space-between;border-bottom:3px solid #f5b700;padding-bottom:12px}</style></head><body>
  <div class="hd"><div><h1>SHREE VETTRIE SPORTS EMPIRE</h1><small>${esc(s.address || CFG.DEFAULTS.address)}<br>${esc(s.phone1 || CFG.DEFAULTS.phone1)} · ${esc(s.email || CFG.DEFAULTS.email)}<br>GSTIN: ${esc(s.gstin || CFG.DEFAULTS.gstin)}</small></div><div class="r"><b>INVOICE</b><br>${esc(o.order_no)}<br>${dt(o.created_at)}</div></div>
  <p><b>Bill to:</b> ${esc(o.customer_name)}<br>${esc(o.address)}, ${esc(o.city || "")} – ${esc(o.pincode || "")}<br>${esc(o.phone)}</p>
  <table><tr><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr>${(o.items || []).map((i) => `<tr><td>${esc(i.name)}${i.size ? " (" + esc(i.size) + ")" : ""}</td><td class="r">${i.qty}</td><td class="r">${money(i.price)}</td><td class="r">${money(i.price * i.qty)}</td></tr>`).join("")}
  <tr><td colspan="3" class="r">Shipping</td><td class="r">${money(o.shipping)}</td></tr><tr><td colspan="3" class="r"><b>Total (incl. taxes)</b></td><td class="r"><b>${money(o.total)}</b></td></tr></table>
  <p>Payment: ${esc(PS[o.payment_status] ? PS[o.payment_status][0] : o.payment_status)} ${o.upi_ref ? "· UTR " + esc(o.upi_ref) : ""}</p><p style="text-align:center;margin-top:40px"><b>Thank you! For Champions. By Champions.</b></p><script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

/* ---------- products ---------- */
let PF = { q: "", cat: "" };
function vProducts() {
  const list = A.products.filter((p) => (!PF.cat || p.category_id === PF.cat) && (!PF.q || `${p.name} ${p.brand || ""}`.toLowerCase().includes(PF.q.toLowerCase())));
  $("#content").innerHTML = `<div class="toolbar"><input class="in" id="pq" placeholder="Search products" value="${esc(PF.q)}">
  <select class="in" id="pc" style="max-width:200px"><option value="">All categories</option>${A.cats.map((c) => `<option value="${c.id}" ${PF.cat === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
  <button class="btn gold sp" id="addP">+ Add product</button></div>
  ${list.length ? `<div class="tbl-w"><table><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Featured</th><th>Visible</th><th></th></tr></thead><tbody>${list.map((p) => `<tr class="hov">
   <td><div class="pn">${p.image_url ? `<img class="thumb" src="${esc(p.image_url)}" alt="">` : `<span class="thumb">${(catOf(p.category_id) || {}).emoji || "🏅"}</span>`}<div>${esc(p.name)}<br><small style="color:var(--muted)">${esc(p.brand || "")}</small></div></div></td>
   <td>${esc((catOf(p.category_id) || {}).name || "—")}</td><td><b>${money(p.price)}</b>${p.mrp ? `<br><small style="color:var(--muted);text-decoration:line-through">${money(p.mrp)}</small>` : ""}</td>
   <td><span class="tag ${p.stock <= 0 ? "red" : p.stock <= 5 ? "amber" : "green"}">${p.stock}</span></td>
   <td><label class="sw"><input type="checkbox" data-tg="featured" data-id="${p.id}" ${p.featured ? "checked" : ""}><span></span></label></td>
   <td><label class="sw"><input type="checkbox" data-tg="active" data-id="${p.id}" ${p.active ? "checked" : ""}><span></span></label></td>
   <td><div class="acts"><button class="btn line sm" data-edit="${p.id}">Edit</button><button class="btn red sm" data-del="${p.id}">Delete</button></div></td></tr>`).join("")}</tbody></table></div>` : `<div class="panel empty">No products yet. Click <b>+ Add product</b> to create your first one.</div>`}`;
  $("#addP").onclick = () => productModal();
  $("#pq").oninput = (e) => { PF.q = e.target.value; clearTimeout(vProducts.t); vProducts.t = setTimeout(() => { vProducts(); const i = $("#pq"); i.focus(); i.setSelectionRange(99, 99); }, 300); };
  $("#pc").onchange = (e) => { PF.cat = e.target.value; vProducts(); };
  $$("[data-edit]").forEach((b) => (b.onclick = () => productModal(b.dataset.edit)));
  $$("[data-del]").forEach((b) => (b.onclick = async () => { const p = A.products.find((x) => x.id === b.dataset.del); if (!confirm(`Delete "${p.name}"?`)) return; await guard(sb.from("products").delete().eq("id", p.id)); toast("Product deleted"); refresh(); }));
  $$("[data-tg]").forEach((c) => (c.onchange = async () => { await guard(sb.from("products").update({ [c.dataset.tg]: c.checked }).eq("id", c.dataset.id)); const p = A.products.find((x) => x.id === c.dataset.id); p[c.dataset.tg] = c.checked; toast("Updated ✓"); }));
}
async function resizeImage(file, max = 1200) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  const bmp = await createImageBitmap(file); const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext("2d"); if (file.type === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); } ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const type = file.type === "image/png" ? "image/png" : "image/webp";
  return await new Promise((r) => c.toBlob((b) => r(b || file), type, 0.86));
}
async function uploadImage(file) {
  const blob = await resizeImage(file); const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from("product-images").upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
  if (error) throw error;
  return sb.storage.from("product-images").getPublicUrl(path).data.publicUrl;
}
function productModal(id) {
  const p = id ? A.products.find((x) => x.id === id) : { name: "", brand: "", description: "", category_id: A.cats[0]?.id || "", price: "", mrp: "", stock: 10, sizes: [], featured: false, active: true, image_url: null, gallery: [] };
  let imgs = [p.image_url, ...(p.gallery || [])].filter(Boolean);
  const drawImgs = () => { $("#imgs").innerHTML = imgs.map((u, i) => `<div class="im ${i ? "" : "main"}"><img src="${esc(u)}" alt=""><button class="x" data-rm="${i}" type="button">✕</button>${i ? `<div class="mk" data-main="${i}">Make main</div>` : `<div class="mk" style="cursor:default">MAIN</div>`}</div>`).join("");
    $$("[data-rm]").forEach((b) => (b.onclick = () => { imgs.splice(+b.dataset.rm, 1); drawImgs(); })); $$("[data-main]").forEach((b) => (b.onclick = () => { const [u] = imgs.splice(+b.dataset.main, 1); imgs.unshift(u); drawImgs(); })); };
  modal(`<h3>${id ? "Edit" : "Add"} product</h3><form id="pf"><div class="fgrid">
  <div class="full"><label class="f">Product name *</label><input class="in" name="name" required value="${esc(p.name)}"></div>
  <div><label class="f">Brand</label><input class="in" name="brand" placeholder="SS, Yonex, Nivia…" value="${esc(p.brand)}"></div>
  <div><label class="f">Category</label><select class="in" name="category_id"><option value="">— none —</option>${A.cats.map((c) => `<option value="${c.id}" ${p.category_id === c.id ? "selected" : ""}>${esc(c.emoji)} ${esc(c.name)}</option>`).join("")}</select></div>
  <div><label class="f">Selling price (₹) *</label><input class="in" type="number" name="price" min="0" step="0.01" required value="${esc(p.price)}"></div>
  <div><label class="f">MRP / original price (₹)</label><input class="in" type="number" name="mrp" min="0" step="0.01" value="${esc(p.mrp || "")}"></div>
  <div><label class="f">Stock quantity *</label><input class="in" type="number" name="stock" min="0" required value="${esc(p.stock)}"></div>
  <div><label class="f">Sizes (comma separated, optional)</label><input class="in" name="sizes" placeholder="S, M, L, XL  or  UK 7, UK 8" value="${esc((p.sizes || []).join(", "))}"></div>
  <div class="full"><label class="f">Description</label><textarea class="in" name="description">${esc(p.description)}</textarea></div>
  <div class="full"><label class="f">Images (first one is the main image)</label><div class="drop" id="drop">📷 Click to upload photos (JPG / PNG / WEBP)<input type="file" id="file" accept="image/*" multiple hidden></div><div class="imgs" id="imgs"></div>
    <div style="display:flex;gap:8px;margin-top:8px"><input class="in" id="urlIn" placeholder="…or paste an image URL"><button class="btn line sm" type="button" id="urlAdd">Add</button></div></div>
  <div><label class="f" style="display:flex;gap:10px;align-items:center"><span class="sw"><input type="checkbox" name="featured" ${p.featured ? "checked" : ""}><span></span></span> Featured on home page</label></div>
  <div><label class="f" style="display:flex;gap:10px;align-items:center"><span class="sw"><input type="checkbox" name="active" ${p.active ? "checked" : ""}><span></span></span> Visible in store</label></div>
  </div><div class="modal-f"><button class="btn line" type="button" id="pcancel">Cancel</button><button class="btn gold" id="psave">${id ? "Save changes" : "Add product"}</button></div></form>`);
  drawImgs();
  $("#pcancel").onclick = closeModal;
  $("#drop").onclick = () => $("#file").click();
  $("#urlAdd").onclick = () => { const u = $("#urlIn").value.trim(); if (/^https?:\/\//.test(u)) { imgs.push(u); $("#urlIn").value = ""; drawImgs(); } else toast("Enter a valid image URL", true); };
  $("#file").onchange = async (e) => {
    const d = $("#drop"); const old = d.firstChild.textContent; d.firstChild.textContent = "Uploading…";
    for (const f of e.target.files) { try { imgs.push(await uploadImage(f)); drawImgs(); } catch (er) { toast("Upload failed: " + er.message, true); } }
    d.firstChild.textContent = old; e.target.value = "";
  };
  $("#pf").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target, d = Object.fromEntries(new FormData(f)); const b = $("#psave"); b.disabled = true;
    const row = { name: d.name.trim(), brand: d.brand.trim() || null, category_id: d.category_id || null, price: +d.price, mrp: d.mrp ? +d.mrp : null, stock: parseInt(d.stock, 10) || 0,
      sizes: d.sizes.split(",").map((s) => s.trim()).filter(Boolean), description: d.description.trim() || null, image_url: imgs[0] || null, gallery: imgs.slice(1),
      featured: f.featured.checked, active: f.active.checked };
    try { await guard(id ? sb.from("products").update(row).eq("id", id) : sb.from("products").insert(row), "Save"); closeModal(); toast(id ? "Product updated ✓" : "Product added ✓"); refresh(); } catch (er) { b.disabled = false; }
  });
}

/* ---------- categories ---------- */
function vCats() {
  $("#content").innerHTML = `<div class="toolbar"><button class="btn gold sp" id="addC">+ Add category</button></div>
  ${A.cats.length ? `<div class="tbl-w"><table style="min-width:0"><thead><tr><th>Icon</th><th>Name</th><th>Order</th><th>Products</th><th></th></tr></thead><tbody>${A.cats.map((c) => `<tr class="hov"><td style="font-size:26px">${esc(c.emoji)}</td><td><b>${esc(c.name)}</b></td><td>${c.sort_order}</td><td>${A.products.filter((p) => p.category_id === c.id).length}</td><td><div class="acts"><button class="btn line sm" data-ce="${c.id}">Edit</button><button class="btn red sm" data-cd="${c.id}">Delete</button></div></td></tr>`).join("")}</tbody></table></div>` : '<div class="panel empty">No categories yet.</div>'}`;
  $("#addC").onclick = () => catModal();
  $$("[data-ce]").forEach((b) => (b.onclick = () => catModal(b.dataset.ce)));
  $$("[data-cd]").forEach((b) => (b.onclick = async () => { const c = catOf(b.dataset.cd); if (!confirm(`Delete category "${c.name}"? Its products will become uncategorised.`)) return; await guard(sb.from("categories").delete().eq("id", c.id)); toast("Category deleted"); refresh(); }));
}
function catModal(id) {
  const c = id ? catOf(id) : { name: "", emoji: "🏅", sort_order: (A.cats.length + 1) };
  modal(`<h3>${id ? "Edit" : "Add"} category</h3><form id="cf"><div class="fgrid"><div><label class="f">Name *</label><input class="in" name="name" required value="${esc(c.name)}"></div><div><label class="f">Emoji icon</label><input class="in" name="emoji" maxlength="4" value="${esc(c.emoji)}"></div><div><label class="f">Display order</label><input class="in" type="number" name="sort_order" value="${esc(c.sort_order)}"></div></div><div class="modal-f"><button class="btn line" type="button" id="cc">Cancel</button><button class="btn gold">Save</button></div></form>`);
  $("#cc").onclick = closeModal;
  $("#cf").onsubmit = async (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); const row = { name: d.name.trim(), emoji: d.emoji.trim() || "🏅", sort_order: +d.sort_order || 0 };
    try { await guard(id ? sb.from("categories").update(row).eq("id", id) : sb.from("categories").insert(row), "Save"); closeModal(); toast("Saved ✓"); refresh(); } catch (er) { } };
}

/* ---------- enquiries ---------- */
function vEnq() {
  $("#content").innerHTML = A.enq.length ? `<div class="tbl-w"><table><thead><tr><th>From</th><th>Organisation</th><th>Request</th><th>Date</th><th>Done</th><th></th></tr></thead><tbody>${A.enq.map((x) => `<tr class="hov"><td><b>${esc(x.name)}</b><br><a href="tel:${esc(x.phone)}" style="color:var(--blue)">${esc(x.phone)}</a> · <a target="_blank" href="https://wa.me/91${esc(x.phone)}" style="color:var(--green)">WhatsApp</a></td><td>${esc(x.organisation || "—")}</td><td style="max-width:320px">${esc(x.message)}</td><td>${dt(x.created_at)}</td><td><label class="sw"><input type="checkbox" data-eh="${x.id}" ${x.handled ? "checked" : ""}><span></span></label></td><td><button class="btn red sm" data-ed="${x.id}">Delete</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="panel empty">No enquiries yet.</div>';
  $$("[data-eh]").forEach((c) => (c.onchange = async () => { await guard(sb.from("enquiries").update({ handled: c.checked }).eq("id", c.dataset.eh)); await loadAll(); }));
  $$("[data-ed]").forEach((b) => (b.onclick = async () => { if (!confirm("Delete enquiry?")) return; await guard(sb.from("enquiries").delete().eq("id", b.dataset.ed)); refresh(); }));
}

/* ---------- settings ---------- */
const FIELDS = [
  ["Home page", [["announcement", "Top announcement bar text", "full"], ["hero_title", "Hero headline (use '. ' to split lines)", "full"], ["hero_subtitle", "Hero sub-text", "full"]]],
  ["Shipping", [["shipping_fee", "Shipping fee (₹)"], ["free_shipping_above", "Free shipping above (₹, 0 = never)"]]],
  ["Contact & business", [["phone1", "Phone 1"], ["phone2", "Phone 2"], ["email", "Email"], ["whatsapp", "WhatsApp number (with 91, no +)"], ["address", "Store address", "full"], ["gstin", "GSTIN"], ["instagram", "Instagram URL"], ["facebook", "Facebook URL"]]],
];
function vSettings() {
  const v = (k) => A.settings[k] ?? CFG.DEFAULTS[k] ?? "";
  $("#content").innerHTML = `<form class="panel" id="sf"><div class="fgrid">${FIELDS.map(([sec, fs]) => `<div class="set-sec">${sec}</div>${fs.map(([k, l, w]) => `<div class="${w || ""}"><label class="f">${l}</label><input class="in" name="${k}" value="${esc(v(k))}"></div>`).join("")}`).join("")}</div>
  <div class="modal-f"><button class="btn gold" id="ssave">Save settings</button></div></form>
  ${CFG.REQUIRE_LOGIN === false ? "" : `<div class="panel"><h3>Change admin password</h3><div style="display:flex;gap:10px;max-width:480px"><input class="in" type="password" id="np" placeholder="New password (min 8 chars)"><button class="btn" id="npb">Update</button></div></div>`}`;
  $("#sf").onsubmit = async (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); const rows = Object.entries(d).map(([key, value]) => ({ key, value: String(value).trim() }));
    const b = $("#ssave"); b.disabled = true; try { await guard(sb.from("site_settings").upsert(rows), "Save"); toast("Settings saved – live on your store ✓"); await loadAll(); } catch (er) { } b.disabled = false; };
  if ($("#npb")) $("#npb").onclick = async () => { const p = $("#np").value; if (p.length < 8) return toast("Password must be at least 8 characters", true); const { error } = await sb.auth.updateUser({ password: p }); if (error) return toast(error.message, true); $("#np").value = ""; toast("Password updated ✓"); };
}

/* ---------- boot ---------- */
async function enterOpen() {
  $("#login").hidden = true; $("#app").hidden = false; $("#who").textContent = "Store owner";
  $("#logout").hidden = true;
  $("#storeLink").href = location.pathname.includes("/admin") ? location.pathname.replace(/\/admin\/?.*$/, "/shop/index.html") : "../shop/index.html";
  await loadAll(); go();
}
if (CFG.REQUIRE_LOGIN === false) enterOpen();
else sb.auth.getSession().then(({ data }) => { if (data.session) enter(); });
})();
