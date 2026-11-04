import { compute, carAge, auctionFeeBreakdown, PLATFORM_FIXED } from "./calc.js?v=11";
import {
  defaultCalc as baseCalc, defaultCosts as baseCosts, defaultPerMarket, SERVICE_PACKAGES, MARKETS,
  FUELS as CAR_FUELS, FUELS_MOTO, manualDefaultsFor, PER_MARKET_FIELDS,
} from "./defaults.js?v=11";

// Страница машин (index.html) или мотоциклов (moto.html): у каждой свой список расчётов.
const VEHICLE = document.body.dataset.vehicle === "moto" ? "moto" : "car";
const STORE_KEY = VEHICLE === "moto" ? "carcalc.moto.v1" : "carcalc.v1";
const FUELS = VEHICLE === "moto" ? FUELS_MOTO : CAR_FUELS;
const MANUAL_DEFAULTS = manualDefaultsFor(VEHICLE);
const defaultCalc = () => baseCalc(VEHICLE);
const defaultCosts = () => baseCosts(VEHICLE);
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const money = (v) => "$" + fmt.format(Math.round(v));
const uid = () => Math.random().toString(36).slice(2, 10);
const MARKET_IDS = Object.keys(MARKETS);

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
delete db.beneficiaries; // список льготников убран
for (const [id, c] of Object.entries(db.calcs)) { delete c.beneficiary; db.calcs[id] = normalize(c); }
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

// Приводит расчёт любой старой версии к текущему формату.
function normalize(c) {
  const base = defaultCalc();
  const out = { ...base, ...c };
  out.vehicle = VEHICLE;
  if (!MARKETS[out.market]) out.market = "by";
  if (!FUELS[out.fuel]) out.fuel = "petrol";
  if (!Array.isArray(out.costs)) out.costs = base.costs;
  out.costs = out.costs.map((x) => ({ id: x.id || uid(), label: String(x.label ?? ""), kind: x.kind, values: x.values, value: x.value }));

  // Поля, ставшие отдельными, — из старых ручных строк.
  const lift = (kind, label, test, field, fallbackAt) => {
    if (out.costs.some((x) => x.kind === kind)) return;
    const row = { id: kind, label, kind };
    const i = out.costs.findIndex(test);
    if (i >= 0) {
      const old = out.costs[i];
      const v = old.values ? old.values.by : old.value;
      if (field && c[field] === undefined && v !== "" && v != null) out[field] = +v;
      out.costs.splice(i, 1, row);
    } else {
      out.costs.splice(fallbackAt(out.costs), 0, row);
    }
  };
  const beforeRepair = (cs) => { const i = cs.findIndex((x) => x.kind === "repair"); return i >= 0 ? i : cs.length; };
  lift("repair", "Примерная цена восстановления", (x) => x.id === "c19" || /восстановлен/i.test(x.label), "repairCost", (cs) => cs.length);
  lift("shipping", "Доставка до Поти", (x) => x.id === "c1" || /доставка до поти/i.test(x.label), "shippingPoti",
    (cs) => cs.findIndex((x) => x.kind === "auction") + 1);
  lift("service", "Пакет услуг сопровождения", (x) => x.id === "c18" || /сопровожд/i.test(x.label), null, beforeRepair);
  lift("util", "Утильсбор", (x) => x.id === "c14" || /утиль/i.test(x.label), null,
    (cs) => cs.findIndex((x) => x.kind === "customs") + 1);

  // Ручные строки: одна сумма → суммы по рынкам.
  for (const x of out.costs) {
    if (x.kind) { delete x.values; delete x.value; continue; }
    if (!x.values) {
      const v = x.value === "" || x.value == null ? 0 : +x.value;
      const d = MANUAL_DEFAULTS[x.id];
      x.values = { by: v, ru: d ? d.ru : v, ge: d ? d.ge : v };
    }
    for (const m of MARKET_IDS) if (x.values[m] === undefined) x.values[m] = 0;
    delete x.value;
  }

  // Поля «по рынкам».
  const pm = defaultPerMarket(VEHICLE);
  out.perMarket = out.perMarket || {};
  for (const m of MARKET_IDS) out.perMarket[m] = { ...pm[m], ...(out.perMarket[m] || {}) };
  if (!c.perMarket) {
    if (c.servicePackage !== undefined) out.perMarket.by.servicePackage = +c.servicePackage;
    if (c.marketMin !== undefined) for (const m of MARKET_IDS) out.perMarket[m].marketMin = +c.marketMin;
  }
  delete out.servicePackage;
  delete out.marketMin;
  return out;
}

const isPerMarket = (f) => PER_MARKET_FIELDS.includes(f);
const getField = (c, f) => (isPerMarket(f) ? c.perMarket[c.market][f] : c[f]);
function setField(c, f, v) {
  if (isPerMarket(f)) c.perMarket[c.market][f] = v; else c[f] = v;
}
// Плоское состояние для расчёта: поля выбранного рынка подставлены наверх.
const effective = (c) => ({ ...c, ...c.perMarket[c.market] });

// ---------- рендер ----------
function renderCalcSelect() {
  const sel = $("#calcSelect");
  sel.innerHTML = "";
  for (const [id, c] of Object.entries(db.calcs)) {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = (c.name || "Без названия") + " · " + (MARKETS[c.market]?.short === "Грузии" ? "Грузия" : MARKETS[c.market]?.short || "РБ");
    if (id === db.currentId) o.selected = true;
    sel.append(o);
  }
}

function renderMarket() {
  const m = cur().market;
  $$(".market-switch button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.market === m)));
  const fuel = cur().fuel;
  $$("[data-markets], [data-fuels]").forEach((el) => {
    const okM = !el.dataset.markets || el.dataset.markets.split(" ").includes(m);
    const okF = !el.dataset.fuels || el.dataset.fuels.split(" ").includes(fuel);
    el.hidden = !(okM && okF);
  });
  $$(".mk").forEach((el) => { el.textContent = MARKETS[m].short; });
  // Мощность нужна только РФ, но показываем и для электро/гибрида как справку — достаточно РФ.
}

function fillServiceSelect() {
  const c = cur();
  const sel = $("#serviceSelect");
  sel.innerHTML = "";
  for (const p of SERVICE_PACKAGES.filter((x) => x.markets.includes(c.market))) {
    const o = document.createElement("option");
    o.value = p.price;
    o.textContent = p.price ? `$${p.price} — ${p.title}` : p.title;
    sel.append(o);
  }
  const v = getField(c, "servicePackage");
  if (![...sel.options].some((o) => +o.value === +v)) setField(c, "servicePackage", +sel.options[0].value);
  sel.value = getField(c, "servicePackage");
}

function renderServiceText() {
  const c = cur();
  const p = SERVICE_PACKAGES.find((x) => x.markets.includes(c.market) && x.price === +getField(c, "servicePackage"));
  $("#serviceText").textContent = p ? p.text : "";
}

function renderFields() {
  const c = cur();
  $$("[data-field]").forEach((el) => {
    if (el.id === "serviceSelect") return;
    const v = getField(c, el.dataset.field);
    el.value = v ?? "";
  });
  fillServiceSelect();
  renderServiceText();
}

const KIND_HINT = {
  auction: "тарифы 2026",
  shipping: "вводится в параметрах",
  repair: "вводится в параметрах",
  service: "выбирается в параметрах",
  customs: "",
  util: "",
};

function renderCosts() {
  const c = cur();
  const tb = $("#costRows");
  tb.innerHTML = "";
  for (const item of c.costs) {
    const tr = document.createElement("tr");
    tr.dataset.id = item.id;
    if (item.kind) {
      tr.className = "auto";
      tr.innerHTML = `<td class="lbl"><span class="lbl-text"></span><span class="badge"></span></td><td class="num"><span class="auto-val"></span></td><td></td>`;
      tr.querySelector(".lbl-text").textContent = item.label;
      tr.querySelector(".badge").textContent = KIND_HINT[item.kind] ? "авто · " + KIND_HINT[item.kind] : "";
    } else {
      tr.innerHTML = `<td><input class="c-label" type="text" aria-label="Наименование"></td>
        <td class="num"><input class="c-value" type="number" step="10" inputmode="decimal" aria-label="Сумма"></td>
        <td><button type="button" class="icon c-del" title="Удалить строку">✕</button></td>`;
      tr.querySelector(".c-label").value = item.label;
      const v = item.values[c.market];
      tr.querySelector(".c-value").value = v ?? "";
      tr.classList.toggle("zero", !+v);
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
  const c = cur();
  const r = compute(effective(c));
  for (const row of r.rows) {
    if (!row.kind) continue;
    const tr = document.querySelector(`tr[data-id="${row.id}"]`);
    if (!tr) continue;
    tr.querySelector(".auto-val").textContent = money(row.amount);
    tr.classList.toggle("zero", !row.amount);
    if (row.note) tr.querySelector(".badge").textContent = "авто · " + row.note;
  }
  const badge = document.querySelector('tr[data-id="auction"] .badge');
  if (badge) {
    const b = auctionFeeBreakdown(+c.lotPrice || 0, c.platform, c.bidType);
    const names = PLATFORM_FIXED[c.platform] || PLATFORM_FIXED.Copart;
    badge.textContent = `авто · сбор ${money(b.buyer)} + ставка ${money(b.bid)} + ` +
      names.map(([n, v]) => `${n} ${money(v)}`).join(" + ");
  }
  $("#lotOut").textContent = money(r.lot);
  $("#totalOut").textContent = money(r.total);
  $("#rTotal").textContent = money(r.total);
  $("#rMarkup").textContent = money(r.markup);
  $("#rFinal").textContent = money(r.finalPrice);
  setSigned($("#rMargin"), r.marginVsMarket);
  setSigned($("#rMaxBid"), r.maxBidSheet);
  $("#rBreakEven").textContent = money(r.breakEvenBid);
  $("#customsWarn").textContent = r.warnings.join(" ");
  $("#customsWarn").hidden = !r.warnings.length;
  document.title = (c.name ? c.name + " — " : "") + (VEHICLE === "moto" ? "Просчёт мотоцикла" : "Просчёт машины");
}

function renderAll() {
  renderCalcSelect();
  renderMarket();
  renderFields();
  renderCosts();
  recalc();
}

// ---------- курсы валют ----------
async function fetchRates(manual) {
  const info = $("#rateInfo");
  info.textContent = "(загрузка…)";
  const c = cur();
  let ok = 0;
  try {
    const res = await fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD");
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const rate = data?.rates?.USD;
    if (!rate) throw new Error("no rate");
    if (manual || c.eurUsdAuto !== false) { c.eurUsd = rate; c.eurUsdAuto = true; }
    info.textContent = `(ЕЦБ, ${new Date(data.date).toLocaleDateString("ru-RU")})`;
    ok++;
  } catch { /* ниже сообщим */ }
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const { RUB, GEL, BYN } = data?.rates || {};
    if (!RUB || !GEL || !BYN) throw new Error("no rate");
    if (manual || c.fxAuto !== false) { c.usdRub = RUB; c.usdGel = GEL; c.usdByn = BYN; c.fxAuto = true; }
    $("#fxInfo").textContent = `(${new Date(data.time_last_update_unix * 1000).toLocaleDateString("ru-RU")})`;
    ok++;
  } catch {
    $("#fxInfo").textContent = "(не удалось обновить, введите вручную)";
  }
  if (!ok) info.textContent = "(не удалось обновить, введите вручную)";
  renderFields();
  recalc();
  save();
}

// ---------- события ----------
const NUMERIC = new Set(["repairCost", "shippingPoti", "servicePackage", "lotPrice", "engineCc", "powerHp", "age",
  "eurUsd", "usdRub", "usdGel", "usdByn", "markupPct", "marketMin"]);

document.addEventListener("input", (e) => {
  const el = e.target;
  const c = cur();

  if (el.dataset.field) {
    const f = el.dataset.field;
    setField(c, f, NUMERIC.has(f) ? (el.value === "" ? "" : +el.value) : el.value);
    if (f === "prodDate") {
      c.age = carAge(c.prodDate);
      $('[data-field="age"]').value = c.age;
    }
    if (f === "eurUsd") c.eurUsdAuto = false;
    if (f === "usdRub" || f === "usdGel" || f === "usdByn") c.fxAuto = false;
    if (f === "name") renderCalcSelect();
    if (f === "fuel") renderMarket();
    if (f === "servicePackage") renderServiceText();
  } else if (el.classList.contains("c-label") || el.classList.contains("c-value")) {
    const tr = el.closest("tr");
    const item = c.costs.find((x) => x.id === tr.dataset.id);
    if (el.classList.contains("c-label")) item.label = el.value;
    else {
      item.values[c.market] = el.value === "" ? "" : +el.value;
      tr.classList.toggle("zero", !+el.value);
    }
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
  const mb = t.closest(".market-switch button");
  if (mb) {
    cur().market = mb.dataset.market;
    renderAll(); save();
  }
});

$("#btnAddCost").onclick = () => {
  const costs = cur().costs;
  const m = cur().market;
  // Новая строка платится только на текущем рынке; на других — 0, можно поправить.
  const item = { id: uid(), label: "", values: { by: 0, ru: 0, ge: 0 } };
  item.values[m] = 0;
  const at = costs.findIndex((x) => x.kind === "repair");
  if (at >= 0) costs.splice(at, 0, item); else costs.push(item);
  renderCosts(); recalc(); save();
  document.querySelector(`tr[data-id="${item.id}"] .c-label`)?.focus();
};

$("#btnResetCosts").onclick = () => {
  if (!confirm("Заменить список затрат на значения по умолчанию (для всех рынков)?")) return;
  cur().costs = defaultCosts();
  renderCosts(); recalc(); save();
};

$("#calcSelect").onchange = (e) => {
  db.currentId = e.target.value;
  renderAll(); save();
};

$("#btnNew").onclick = () => {
  const id = uid();
  const prev = cur();
  const c = defaultCalc();
  c.name = "Расчёт " + (Object.keys(db.calcs).length + 1);
  c.market = prev.market;
  Object.assign(c, { eurUsd: prev.eurUsd, usdRub: prev.usdRub, usdGel: prev.usdGel, usdByn: prev.usdByn });
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
(function fillFuel() {
  const sel = $('[data-field="fuel"]');
  for (const [k, v] of Object.entries(FUELS)) {
    const o = document.createElement("option");
    o.value = k; o.textContent = v;
    sel.append(o);
  }
})();
importFromHash();
renderAll();
fetchRates(false);
$("#btnRate").onclick = () => fetchRates(true);
$("#btnFx").onclick = () => fetchRates(true);
