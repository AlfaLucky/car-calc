import { compute, carAge } from "./calc.js?v=3";
import { defaultCalc, defaultCosts } from "./defaults.js?v=3";

const STORE_KEY = "carcalc.v1";
const $ = (sel) => document.querySelector(sel);
const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const money = (v) => "$" + fmt.format(Math.round(v));
const uid = () => Math.random().toString(36).slice(2, 10);

// ---------- хранилище ----------
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const db = JSON.parse(raw);
      if (db && db.calcs && Object.keys(db.calcs).length) return db;
    }
  } catch { /* приватный режим или повреждённые данные */ }
  const id = uid();
  return { calcs: { [id]: defaultCalc() }, currentId: id };
}

let db = load();
if (!db.calcs[db.currentId]) db.currentId = Object.keys(db.calcs)[0];
// список льготников убран — чистим старые данные
delete db.beneficiaries;
for (const c of Object.values(db.calcs)) delete c.beneficiary;
const cur = () => db.calcs[db.currentId];

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(db));
      $("#saveStatus").textContent = "Сохранено " + new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    } catch {
      $("#saveStatus").textContent = "Не удалось сохранить в браузере — используйте «Экспорт».";
    }
  }, 250);
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- ссылка на расчёт ----------
const b64enc = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64dec = (s) => new TextDecoder().decode(
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

function importFromHash() {
  const m = location.hash.match(/^#c=(.+)$/);
  if (!m) return;
  try {
    const calc = normalize(JSON.parse(b64dec(m[1])));
    const id = uid();
    db.calcs[id] = calc;
    db.currentId = id;
    save();
    toast("Расчёт из ссылки добавлен");
  } catch {
    toast("Ссылка повреждена");
  }
  history.replaceState(null, "", location.pathname + location.search);
}

function normalize(c) {
  const base = defaultCalc();
  const out = { ...base, ...c };
  if (!Array.isArray(out.costs)) out.costs = base.costs;
  out.costs = out.costs.map((x) => ({ id: x.id || uid(), label: String(x.label ?? ""), value: x.value, kind: x.kind }));
  return out;
}

// ---------- рендер ----------
function renderCalcSelect() {
  const sel = $("#calcSelect");
  sel.innerHTML = "";
  for (const [id, c] of Object.entries(db.calcs)) {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = c.name || "Без названия";
    if (id === db.currentId) o.selected = true;
    sel.append(o);
  }
}

function renderFields() {
  const c = cur();
  document.querySelectorAll("[data-field]").forEach((el) => {
    const v = c[el.dataset.field];
    el.value = v ?? "";
  });
}

function renderCosts() {
  const tb = $("#costRows");
  tb.innerHTML = "";
  for (const item of cur().costs) {
    const tr = document.createElement("tr");
    tr.dataset.id = item.id;
    if (item.kind) {
      tr.className = "auto";
      const hint = item.kind === "auction" ? "по таблице площадки" : "€ по возрасту и объёму → $ по курсу";
      tr.innerHTML = `<td class="lbl"></td><td class="num"><span class="auto-val"></span></td><td></td>`;
      tr.querySelector(".lbl").textContent = item.label;
      const b = document.createElement("span");
      b.className = "badge";
      b.textContent = "авто · " + hint;
      tr.querySelector(".lbl").append(b);
    } else {
      tr.innerHTML = `<td><input class="c-label" type="text" aria-label="Наименование"></td>
        <td class="num"><input class="c-value" type="number" step="10" inputmode="decimal" aria-label="Сумма"></td>
        <td><button type="button" class="icon c-del" title="Удалить строку">✕</button></td>`;
      tr.querySelector(".c-label").value = item.label;
      tr.querySelector(".c-value").value = item.value ?? "";
    }
    tb.append(tr);
  }
}

function setSigned(el, v) {
  el.textContent = money(v);
  el.classList.toggle("pos", v > 0);
  el.classList.toggle("neg", v < 0);
}

function recalc() {
  const r = compute(cur());
  for (const row of r.rows) {
    if (!row.kind) continue;
    const el = document.querySelector(`tr[data-id="${row.id}"] .auto-val`);
    if (el) el.textContent = money(row.amount);
  }
  $("#lotOut").textContent = money(r.lot);
  $("#totalOut").textContent = money(r.total);
  $("#rTotal").textContent = money(r.total);
  $("#rMarkup").textContent = money(r.markup);
  $("#rFinal").textContent = money(r.finalPrice);
  setSigned($("#rMargin"), r.marginVsMarket);
  setSigned($("#rMaxBid"), r.maxBidSheet);
  $("#rBreakEven").textContent = money(r.breakEvenBid);
  document.title = (cur().name ? cur().name + " — " : "") + "Просчёт машины";
}

function renderAll() {
  renderCalcSelect();
  renderFields();
  renderCosts();
  recalc();
}

// ---------- курс EUR/USD ----------
async function fetchRate(manual) {
  const info = $("#rateInfo");
  info.textContent = "(загрузка…)";
  try {
    const res = await fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD");
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const rate = data?.rates?.USD;
    if (!rate) throw new Error("no rate");
    info.textContent = `(ЕЦБ, ${new Date(data.date).toLocaleDateString("ru-RU")})`;
    if (manual || cur().eurUsdAuto !== false) {
      cur().eurUsd = rate;
      cur().eurUsdAuto = true;
      $('[data-field="eurUsd"]').value = rate;
      recalc();
      save();
    }
  } catch {
    info.textContent = "(не удалось обновить, введите вручную)";
  }
}

// ---------- события ----------
const NUMERIC = new Set(["lotPrice", "engineCc", "age", "eurUsd", "markupPct", "marketMin"]);

document.addEventListener("input", (e) => {
  const el = e.target;
  const c = cur();

  if (el.dataset.field) {
    const f = el.dataset.field;
    c[f] = NUMERIC.has(f) ? (el.value === "" ? "" : +el.value) : el.value;
    if (f === "prodDate") {
      c.age = carAge(c.prodDate);
      $('[data-field="age"]').value = c.age;
    }
    if (f === "eurUsd") c.eurUsdAuto = false;
    if (f === "name") renderCalcSelect();
  } else if (el.classList.contains("c-label") || el.classList.contains("c-value")) {
    const id = el.closest("tr").dataset.id;
    const item = c.costs.find((x) => x.id === id);
    if (el.classList.contains("c-label")) item.label = el.value;
    else item.value = el.value === "" ? "" : +el.value;
  } else {
    return;
  }
  recalc();
  save();
});

// select'ы тоже шлют input, но на всякий случай ловим change
document.addEventListener("change", (e) => {
  if (e.target.tagName === "SELECT" && e.target.dataset.field) {
    e.target.dispatchEvent(new Event("input", { bubbles: true }));
  }
});

document.addEventListener("click", (e) => {
  const t = e.target;
  if (t.classList.contains("c-del")) {
    const id = t.closest("tr").dataset.id;
    cur().costs = cur().costs.filter((x) => x.id !== id);
    renderCosts(); recalc(); save();
  }
});

$("#btnAddCost").onclick = () => {
  const costs = cur().costs;
  // новые строки вставляем перед «ценой восстановления», если она последняя — как пустые строки в таблице
  const item = { id: uid(), label: "", value: 0 };
  const last = costs[costs.length - 1];
  if (last && /восстановлен/i.test(last.label)) costs.splice(costs.length - 1, 0, item); else costs.push(item);
  renderCosts(); recalc(); save();
  document.querySelector(`tr[data-id="${item.id}"] .c-label`)?.focus();
};

$("#btnResetCosts").onclick = () => {
  if (!confirm("Заменить список затрат на значения по умолчанию из таблицы?")) return;
  cur().costs = defaultCosts();
  renderCosts(); recalc(); save();
};

$("#calcSelect").onchange = (e) => {
  db.currentId = e.target.value;
  renderAll(); save();
};

$("#btnNew").onclick = () => {
  const id = uid();
  const c = defaultCalc();
  c.name = "Расчёт " + (Object.keys(db.calcs).length + 1);
  c.eurUsd = cur().eurUsd;
  c.prodDate = "";
  c.age = 0;
  db.calcs[id] = c;
  db.currentId = id;
  renderAll(); save();
  $('[data-field="name"]').select();
};

$("#btnDup").onclick = () => {
  const id = uid();
  const c = structuredClone(cur());
  c.name = (c.name || "Расчёт") + " (копия)";
  db.calcs[id] = c;
  db.currentId = id;
  renderAll(); save();
};

$("#btnDel").onclick = () => {
  if (!confirm(`Удалить расчёт «${cur().name || "Без названия"}»?`)) return;
  delete db.calcs[db.currentId];
  if (!Object.keys(db.calcs).length) {
    const id = uid();
    db.calcs[id] = defaultCalc();
  }
  db.currentId = Object.keys(db.calcs)[0];
  renderAll(); save();
};

$("#btnShare").onclick = async () => {
  const url = location.origin + location.pathname + "#c=" + b64enc(JSON.stringify(cur()));
  try {
    await navigator.clipboard.writeText(url);
    toast("Ссылка на расчёт скопирована");
  } catch {
    prompt("Скопируйте ссылку:", url);
  }
};

$("#btnExport").onclick = () => {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `prosschet-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};

$("#fileImport").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.calcs) throw new Error();
    let added = 0;
    for (const c of Object.values(data.calcs)) { db.calcs[uid()] = normalize(c); added++; }
    renderAll(); save();
    toast(`Импортировано расчётов: ${added}`);
  } catch {
    toast("Не похоже на файл экспорта");
  }
};

// ---------- старт ----------
importFromHash();
renderAll();
fetchRate(false);
$("#btnRate").onclick = () => fetchRate(true);
