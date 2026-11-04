import { RU_UTIL_EV, RU_UTIL_ICE } from "./ru_util_table.js?v=11";
// Чистая логика расчёта — по формулам Google-таблицы «Просчет машины»
// (сборы аукциона обновлены до тарифов 2026, растаможка исправлена — см. ниже).

// Сборы аукциона — тарифы 2026 для покупателя без дилерской лицензии, оплата переводом.
// Источники (сторонние копии официальных таблиц, сверено 04.11.2026):
//   help.abetter.bid «Copart U.S. Auction Fees» (обновлено 23.03.2026),
//   sakaemlogistics.com «Copart fees» (09.2026) и «IAAI fees» (10.2026).
// У Copart и IAAI сейчас одинаковые таблицы сбора покупателя и сбора за онлайн-ставку.

// [верхняя граница цены лота, сбор покупателя]; выше последней ступени — 7.5% от цены.
const BUYER_FEE = [
  [49.99, 25], [99.99, 45], [199.99, 80], [299.99, 130], [349.99, 137.5],
  [399.99, 145], [449.99, 175], [499.99, 185], [549.99, 205], [599.99, 210],
  [699.99, 240], [799.99, 270], [899.99, 295], [999.99, 320], [1199.99, 375],
  [1299.99, 395], [1399.99, 410], [1499.99, 430], [1599.99, 445], [1699.99, 465],
  [1799.99, 485], [1999.99, 510], [2399.99, 535], [2499.99, 570], [2999.99, 610],
  [3499.99, 655], [3999.99, 705], [4499.99, 725], [4999.99, 750], [5499.99, 775],
  [5999.99, 800], [6499.99, 825], [6999.99, 845], [7499.99, 880], [7999.99, 900],
  [8499.99, 925], [9999.99, 945], [14999.99, 1000],
];
const BUYER_FEE_TOP_PCT = 0.075; // от $15 000

// Сбор за онлайн-ставку: [верхняя граница, ставка заранее, ставка вживую]
const BID_FEE = [
  [99.99, 0, 0], [499.99, 40, 50], [999.99, 55, 65], [1499.99, 75, 85],
  [1999.99, 85, 95], [3999.99, 100, 110], [5999.99, 110, 125], [7999.99, 125, 145],
  [Infinity, 140, 160],
];

// Фиксированные сборы площадки.
export const PLATFORM_FIXED = {
  Copart: [["Gate fee", 95], ["Environmental fee", 15], ["Оформление тайтла", 20]],
  IAAI: [["Service fee", 105], ["Environmental fee", 15], ["Title handling", 20]],
};

export function auctionFeeBreakdown(lot, platform, bidType = "pre") {
  const tier = BUYER_FEE.find(([max]) => lot <= max);
  const buyer = tier ? tier[1] : lot * BUYER_FEE_TOP_PCT;
  const b = BID_FEE.find(([max]) => lot <= max);
  const bid = bidType === "live" ? b[2] : b[1];
  const fixed = (PLATFORM_FIXED[platform] || PLATFORM_FIXED.Copart).reduce((a, [, v]) => a + v, 0);
  return { buyer, bid, fixed, total: buyer + bid + fixed };
}

export function auctionFee(lot, platform, bidType = "pre") {
  return auctionFeeBreakdown(lot, platform, bidType).total;
}

// ======================================================================
// Растаможка и утильсбор по рынкам. Сверено с нормативными текстами 05.11.2026:
//  ЕТТ — Решение Совета ЕЭК №107 (alta.ru/tamdoc/17sr0107);
//  РФ: сбор за оформление — ПП №1637 в ред. №1638 (с 01.01.2026);
//      утильсбор — ПП №1291 в ред. №1713 (с 01.12.2025);
//  РБ: утильсбор — ПСМ №195 от 23.04.2026 (ред. №380); льгота 50% — Указ №140;
//  Грузия: Налоговый кодекс, ст. 188, 194, 197, 199 (ред. закона N1477 от 02.04.2026).
// Пометка [вторичный] — источник не официальный, сверить перед сделкой.
// ======================================================================

const num = (x) => (Number.isFinite(+x) ? +x : 0);
const usd = (v) => "$" + Math.round(v).toLocaleString("ru-RU");
const rub = (v) => Math.round(v).toLocaleString("ru-RU") + " ₽";
const HP_TO_KW = 0.73549875;
// Год платежа → колонка таблиц утильсбора РФ (2026…2030+).
const utilYear = () => String(Math.min(2030, Math.max(2026, new Date().getFullYear())));

// --- ЕТТ ЕАЭС для физлиц (РБ и РФ, кроме чистых электромобилей) ---
const UNDER3 = [
  [8500, 0.54, 2.5], [16700, 0.48, 3.5], [42300, 0.48, 5.5],
  [84500, 0.48, 7.5], [169000, 0.48, 15], [Infinity, 0.48, 20],
];
const PER_CC = [
  [1000, 1.5, 3], [1500, 1.7, 3.2], [1800, 2.5, 3.5],
  [2300, 2.7, 4.8], [3000, 3, 5], [Infinity, 3.6, 5.7],
];

function ettEur({ age, cc, priceEur }) {
  if (age < 3) {
    const [, pct, perCc] = UNDER3.find(([max]) => priceEur <= max);
    return Math.max(priceEur * pct, cc * perCc);
  }
  const [, r35, r5] = PER_CC.find(([max]) => cc <= max);
  return cc * (age <= 5 ? r35 : r5);
}

// --- РФ ---
const RU_CLEARANCE = [
  [200000, 1231], [450000, 2462], [1200000, 4924], [2700000, 13541],
  [4200000, 18465], [5500000, 21344], [10000000, 49240], [Infinity, 73860],
];
// Акциз на электромобили 2026, ₽ за л.с. (на всю мощность) [вторичный].
const RU_EV_EXCISE = [[90, 0], [150, 64], [200, 613], [300, 1004], [400, 1711], [500, 1771], [Infinity, 1829]];
const RU_VAT = 0.22; // с 01.01.2026
const RU_UTIL_BASE = 20000;
const RU_PERSONAL = [0.17, 0.26]; // 3 400 / 5 200 ₽

function ruUtil(s) {
  const age = num(s.age), cc = num(s.engineCc), hp = num(s.powerHp);
  const kw = hp * HP_TO_KW;
  const ev = s.fuel === "electric";
  const idx = age < 3 ? 0 : 1;
  const personal = s.ruImporter === "personal";
  const y = utilYear();
  const fee = (k) => RU_UTIL_BASE * k;

  if (!hp) return { rub: fee(RU_PERSONAL[idx]), note: "укажите мощность — пока посчитан льготный" };

  if (ev) {
    if (personal && kw <= 58.84) return { rub: fee(RU_PERSONAL[idx]), note: `льготный (электро ≤ 80 л.с.): ${rub(fee(RU_PERSONAL[idx]))}` };
    const k = RU_UTIL_EV.find(([max]) => kw <= max)[1][y][idx];
    return { rub: fee(k), note: `электро ${hp} л.с., коэф. ${k}: ${rub(fee(k))}` };
  }
  if (personal && kw <= 117.68 && cc <= 3000) {
    return { rub: fee(RU_PERSONAL[idx]), note: `льготный для физлица (≤ 160 л.с., ≤ 3000 см³): ${rub(fee(RU_PERSONAL[idx]))}` };
  }
  const table = RU_UTIL_ICE.find(([max]) => cc <= max)[1];
  const k = table.find(([max]) => kw <= max)[1][y][idx];
  const why = !personal ? "для перепродажи" : hp > 160 ? "> 160 л.с." : "> 3000 см³";
  return { rub: fee(k), note: `по шкале ${y} г. (${why}), коэф. ${k}: ${rub(fee(k))}` };
}

function ruCustoms(s) {
  const eurUsd = num(s.eurUsd) || 1, usdRub = num(s.usdRub) || 1;
  const valueUsd = num(s.lotPrice);
  const clearanceRub = RU_CLEARANCE.find(([max]) => valueUsd * usdRub <= max)[1];
  const clearance = clearanceRub / usdRub;
  if (s.fuel === "electric") {
    const hp = num(s.powerHp);
    const duty = valueUsd * 0.15;
    const exciseRub = hp * RU_EV_EXCISE.find(([max]) => hp <= max)[1];
    const excise = exciseRub / usdRub;
    const vat = (valueUsd + duty + excise) * RU_VAT;
    return {
      amount: duty + excise + vat + clearance,
      note: `электро: пошлина 15% ${usd(duty)} + акциз ${rub(exciseRub)} + НДС 22% ${usd(vat)} + сбор ${rub(clearanceRub)}`,
    };
  }
  const eur = ettEur({ age: num(s.age), cc: num(s.engineCc), priceEur: valueUsd / eurUsd });
  return { amount: eur * eurUsd + clearance, note: `ЕТТ ${Math.round(eur).toLocaleString("ru-RU")} € + сбор за оформление ${rub(clearanceRub)}` };
}

// --- РБ ---
const BY_UTIL_BYN = [624.92, 1282.02]; // до 3 лет / старше 3 лет, физлицо, любой тип двигателя

function byCustoms(s) {
  const eurUsd = num(s.eurUsd) || 1;
  const k = s.benefit === "Льготник" ? 0.5 : 1;
  const disc = k < 1 ? ", −50% льготник" : "";
  if (s.fuel === "electric") {
    // Пошлина: 0% по льготе для электромобилей, либо 15%, если льгота не действует.
    // НДС: физлица освобождены, если машине ≤ 5 лет (Указ №428 — до 31.12.2028).
    const value = num(s.lotPrice);
    const zero = s.byEvDuty !== "15";
    const duty = zero ? 0 : value * 0.15;
    const vat = num(s.age) <= 5 ? 0 : (value + duty) * 0.2;
    return {
      amount: (duty + vat) * k,
      note: `электро: пошлина ${zero ? "0% (льгота)" : "15% " + usd(duty)}${vat ? ` + НДС 20% ${usd(vat)}` : ", без НДС (≤ 5 лет)"}${disc}`,
    };
  }
  const eur = ettEur({ age: num(s.age), cc: num(s.engineCc), priceEur: num(s.lotPrice) / eurUsd });
  return { amount: eur * eurUsd * k, note: `ЕТТ ${Math.round(eur).toLocaleString("ru-RU")} € → $ по курсу${disc}` };
}

function byUtil(s) {
  const usdByn = num(s.usdByn) || 1;
  const byn = BY_UTIL_BYN[num(s.age) < 3 ? 0 : 1];
  return { amount: byn / usdByn, note: `${byn.toLocaleString("ru-RU")} BYN (ПСМ №195)` };
}

// --- Грузия ---
const GE_FEES_GEL = 480; // таможня 150 + декларация 50 + экспертиза 30 + регистрация и номера 200 + транзит 50 [вторичный]

// Возраст по-грузински: год оформления − год выпуска.
function geAge(s) {
  const d = s.prodDate ? new Date(s.prodDate) : null;
  return d && !isNaN(d) ? new Date().getFullYear() - d.getFullYear() : num(s.age);
}

function geCustoms(s) {
  const usdGel = num(s.usdGel) || 1;
  const cc = num(s.engineCc);
  const age = geAge(s);
  if (s.fuel === "electric") {
    return { amount: GE_FEES_GEL / usdGel, note: `электро: без акциза и импортного налога, сборы ≈ ${GE_FEES_GEL} GEL` };
  }
  let rate = age <= 6 ? 1.5 : 4.5;
  let hyb = "";
  if (s.fuel === "hybrid" && age <= 6) { rate = 0.6; hyb = " (гибрид −60%)"; }
  const excise = cc * rate;
  const importTax = 0.05 * cc * (1 + 0.05 * age);
  const gel = excise + importTax + GE_FEES_GEL;
  return {
    amount: gel / usdGel,
    note: `акциз ${cc} см³ × ${rate} GEL${hyb} = ${Math.round(excise)} + импортный налог ${Math.round(importTax)} + сборы ≈ ${GE_FEES_GEL} GEL (возраст ${age})`,
  };
}

// ======================================================================
// Мотоциклы (ТН ВЭД 8711). Сверено 05.11.2026:
//  ЕАЭС: Решение ЕЭК №107, прил. 2, табл. 2, п. 1 — для мотоциклов НЕ ЕТТ, а совокупный платёж
//        (пошлина по ЕТ ТН ВЭД + национальные налоги); ставки пошлины — ЕТ ТН ВЭД 8711.
//  РФ: акциз — НК РФ ст. 193 (ред. 425-ФЗ), > 150 л.с.: 613 ₽/л.с. в 2026; НДС 22%; утильсбора нет (ПП №1291 — M/N/O).
//  РБ: НДС 20%, акциза нет, утильсбора нет (ПСМ №195 — нет категории L); льгота 50% (Указ №140) действует.
//  Грузия: акциз — НК ст. 188, п. 1, строка 4¹ (GEL/см³ по возрасту); НДС освобождён (ст. 173 «ზ»);
//          импортного налога нет; электро — без акциза (ст. 194 «ლ»).
// ======================================================================

// Пошлина ЕТ ТН ВЭД: до 250 см³ — 14%, 250–800 см³ — 15%, свыше 800 см³ — 10%, электро — 14%.
function motoDutyRate(s) {
  if (s.fuel === "electric") return 0.14;
  const cc = num(s.engineCc);
  return cc <= 250 ? 0.14 : cc <= 800 ? 0.15 : 0.10;
}

// Акциз РФ на мотоциклы > 150 л.с., ₽ за л.с. (на всю мощность).
const RU_MOTO_EXCISE = { 2026: 613, 2027: 638, 2028: 664 };
const ruMotoExciseRate = () => RU_MOTO_EXCISE[Math.min(2028, Math.max(2026, new Date().getFullYear()))];

function motoRuCustoms(s) {
  const usdRub = num(s.usdRub) || 1;
  const value = num(s.lotPrice);
  const rate = motoDutyRate(s);
  const duty = value * rate;
  const hp = num(s.powerHp);
  const exciseRub = hp > 150 ? hp * ruMotoExciseRate() : 0;
  const excise = exciseRub / usdRub;
  const vat = (value + duty + excise) * RU_VAT;
  const clearanceRub = RU_CLEARANCE.find(([max]) => value * usdRub <= max)[1];
  return {
    amount: duty + excise + vat + clearanceRub / usdRub,
    note: `пошлина ${Math.round(rate * 100)}% ${usd(duty)}${excise ? ` + акциз ${rub(exciseRub)}` : ""} + НДС 22% ${usd(vat)} + сбор ${rub(clearanceRub)}`,
  };
}

function motoByCustoms(s) {
  const value = num(s.lotPrice);
  const rate = motoDutyRate(s);
  const duty = value * rate;
  const vat = (value + duty) * 0.2;
  const k = s.benefit === "Льготник" ? 0.5 : 1;
  return {
    amount: (duty + vat) * k,
    note: `пошлина ${Math.round(rate * 100)}% ${usd(duty)} + НДС 20% ${usd(vat)}${k < 1 ? ", −50% льготник" : ""}`,
  };
}

// Грузия: акциз по возрасту (год оформления − год выпуска), GEL за см³.
const GE_MOTO_EXCISE = [[0, 1.5], [1, 1.3], [5, 0.7], [9, 0.8], [10, 1.0], [11, 1.3], [12, 1.5], [13, 1.8], [14, 2.1], [Infinity, 2.4]];

function motoGeCustoms(s) {
  const usdGel = num(s.usdGel) || 1;
  if (s.fuel === "electric") {
    return { amount: GE_FEES_GEL / usdGel, note: `электро: без акциза, сборы ≈ ${GE_FEES_GEL} GEL` };
  }
  const cc = num(s.engineCc);
  const age = Math.max(0, geAge(s));
  const rate = GE_MOTO_EXCISE.find(([max]) => age <= max)[1];
  const excise = cc * rate;
  return {
    amount: (excise + GE_FEES_GEL) / usdGel,
    note: `акциз ${cc} см³ × ${rate} GEL = ${Math.round(excise)} + сборы ≈ ${GE_FEES_GEL} GEL (возраст ${age}), без НДС`,
  };
}

function customs(s) {
  if (s.vehicle === "moto") {
    if (s.market === "ru") return motoRuCustoms(s);
    if (s.market === "ge") return motoGeCustoms(s);
    return motoByCustoms(s);
  }
  if (s.market === "ru") return ruCustoms(s);
  if (s.market === "ge") return geCustoms(s);
  return byCustoms(s);
}

function util(s) {
  if (s.vehicle === "moto") return { amount: 0, note: "для мотоциклов не платится" };
  if (s.market === "ru") {
    const r = ruUtil(s);
    return { amount: r.rub / (num(s.usdRub) || 1), note: r.note };
  }
  if (s.market === "ge") return { amount: 0, note: "в Грузии не платится" };
  return byUtil(s);
}

// Совместимость: растаможка РБ как раньше.
export function customsDuty({ age, engineCc, eurUsd, benefit, lotPrice }) {
  return byCustoms({ age, engineCc, eurUsd, benefit, lotPrice, fuel: "petrol" }).amount;
}

export function carAge(prodDate, today = new Date()) {
  if (!prodDate) return 0;
  const d = new Date(prodDate);
  if (isNaN(d)) return 0;
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return Math.max(0, age);
}

// Сумма строки затрат (+ пояснение для автоматических строк).
export function costDetail(item, s) {
  switch (item.kind) {
    case "service": return { amount: num(s.servicePackage) };
    case "shipping": return { amount: num(s.shippingPoti) };
    case "repair": return { amount: num(s.repairCost) };
    case "auction": return { amount: auctionFee(num(s.lotPrice), s.platform, s.bidType) };
    case "customs": return customs(s);
    case "util": return util(s);
    default: return { amount: num(item.values ? item.values[s.market || "by"] : item.value) };
  }
}

export const costValue = (item, s) => costDetail(item, s).amount;

export function compute(s) {
  const lot = num(s.lotPrice);
  const warnings = [];
  const rows = s.costs.map((c) => {
    const d = costDetail(c, s);
    if (d.warn) warnings.push(d.warn);
    return { ...c, amount: d.amount, note: d.note };
  });
  if (s.market === "ru" && !num(s.powerHp)) warnings.push(s.vehicle === "moto"
    ? "Для РФ укажите мощность в л.с. — свыше 150 л.с. платится акциз."
    : "Для РФ укажите мощность в л.с. — от неё зависит утильсбор.");
  if (s.market === "ru" && s.fuel === "hybrid") warnings.push("Гибрид в РФ: пошлина по объёму двигателя; для утильсбора укажите суммарную мощность ДВС + электромотора.");
  if (s.market === "ru" && s.fuel === "electric") warnings.push("Электро в РФ: укажите 30-минутную мощность электромотора в л.с.");
  const otherCosts = rows.reduce((a, r) => a + r.amount, 0); // всё, кроме самого лота
  const total = lot + otherCosts;
  const pct = num(s.markupPct) / 100;
  const markup = total * pct;
  const finalPrice = total + markup;
  const market = num(s.marketMin);
  const maxBidSheet = market - (otherCosts + markup);        // формула исходной таблицы
  const marginVsMarket = market - total;
  return { rows, warnings, lot, otherCosts, total, markup, finalPrice, market, maxBidSheet, marginVsMarket,
    breakEvenBid: breakEvenBid(s) };
}

// Ставка, при которой «итоговая цена с наценкой» ровно равна рыночной цене.
// Учитывает, что сборы, растаможка и наценка тоже растут вместе со ставкой.
function breakEvenBid(s) {
  const market = num(s.marketMin);
  const pct = num(s.markupPct) / 100;
  const priceAt = (bid) => {
    const st = { ...s, lotPrice: bid };
    const other = st.costs.reduce((a, c) => a + costValue(c, st), 0);
    return (bid + other) * (1 + pct);
  };
  if (priceAt(0) > market) return 0;
  let lo = 0, hi = Math.max(market, 1);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (priceAt(mid) <= market) lo = mid; else hi = mid;
  }
  return Math.floor(lo);
}
