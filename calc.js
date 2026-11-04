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
// Растаможка и утильсбор по рынкам. Ставки 2026 года — по состоянию знаний
// на середину 2026; места, где ставка может отличаться, помечены «ПРОВЕРИТЬ».
// ======================================================================

const num = (x) => (Number.isFinite(+x) ? +x : 0);
const usd = (v) => "$" + Math.round(v).toLocaleString("ru-RU");

// --- ЕТТ ЕАЭС для физлиц (одинаково для РБ и РФ) ---
// Младше 3 лет: % от стоимости в €, но не меньше X € за см³.
const UNDER3 = [
  [8500, 0.54, 2.5], [16700, 0.48, 3.5], [42300, 0.48, 5.5],
  [84500, 0.48, 7.5], [169000, 0.48, 15], [Infinity, 0.48, 20],
];
// 3–5 лет и старше 5 лет: € за см³ по объёму.
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
// Таможенный сбор за оформление, ₽, по таможенной стоимости в ₽ (ПРОВЕРИТЬ индексацию 2026).
const RU_CLEARANCE = [
  [200000, 1067], [450000, 2134], [1200000, 4269], [2700000, 11746],
  [4200000, 16524], [5500000, 21344], [7000000, 27540], [Infinity, 30000],
];
// Акциз на электромобили, ₽ за л.с. (ПРОВЕРИТЬ ставку 2026).
const RU_EV_EXCISE = [[90, 0], [150, 63], [200, 608], [300, 993], [400, 1694], [500, 1755], [Infinity, 1811]];
const RU_VAT = 0.22; // НДС в РФ с 01.01.2026
const RU_UTIL_BASE = 20000;
// Утильсбор «коммерческий» (перепродажа, юрлица, а также физлица при > 160 л.с.):
// коэффициенты × 20 000 ₽, [до 3 лет, старше 3 лет] (ПРОВЕРИТЬ индексацию 2026 и шкалу по мощности).
const RU_UTIL_COMMERCIAL = [
  [1000, 9.01, 23.0], [2000, 33.37, 58.7], [3000, 93.77, 141.97],
  [3500, 107.67, 165.84], [Infinity, 137.11, 180.24],
];
const RU_UTIL_EV_COMMERCIAL = [33.37, 58.7];

function ruUtil(s, rub) {
  const age = num(s.age), cc = num(s.engineCc), hp = num(s.powerHp);
  const ev = s.fuel === "electric";
  const old = age >= 3;
  const personalOk = s.ruImporter === "personal" && hp > 0 && hp <= 160 && (ev || cc <= 3000);
  if (personalOk) {
    const k = old ? 0.26 : 0.17;
    return { rub: RU_UTIL_BASE * k, note: `льготный для физлица (≤160 л.с.): ${(RU_UTIL_BASE * k).toLocaleString("ru-RU")} ₽` };
  }
  const k = ev ? RU_UTIL_EV_COMMERCIAL[old ? 1 : 0]
    : RU_UTIL_COMMERCIAL.find(([max]) => cc <= max)[old ? 2 : 1];
  const why = s.ruImporter !== "personal" ? "для перепродажи" : hp > 160 ? "мощность > 160 л.с." : !hp ? "не указана мощность" : "объём > 3000 см³";
  return { rub: RU_UTIL_BASE * k, note: `коммерческий (${why}): ${Math.round(RU_UTIL_BASE * k).toLocaleString("ru-RU")} ₽` };
}

function ruCustoms(s) {
  const eurUsd = num(s.eurUsd) || 1, usdRub = num(s.usdRub) || 1;
  const valueUsd = num(s.lotPrice);
  const valueRub = valueUsd * usdRub;
  const clearanceRub = RU_CLEARANCE.find(([max]) => valueRub <= max)[1];
  if (s.fuel === "electric") {
    const hp = num(s.powerHp);
    const duty = valueUsd * 0.15;
    const exciseRub = hp * RU_EV_EXCISE.find(([max]) => hp <= max)[1];
    const excise = exciseRub / usdRub;
    const vat = (valueUsd + duty + excise) * RU_VAT;
    const total = duty + excise + vat + clearanceRub / usdRub;
    return { amount: total, note: `электро: пошлина 15% ${usd(duty)} + акциз ${usd(excise)} + НДС 22% ${usd(vat)} + сбор ${clearanceRub.toLocaleString("ru-RU")} ₽` };
  }
  const eur = ettEur({ age: num(s.age), cc: num(s.engineCc), priceEur: valueUsd / eurUsd });
  const duty = eur * eurUsd;
  return { amount: duty + clearanceRub / usdRub, note: `ЕТТ ${Math.round(eur).toLocaleString("ru-RU")} € + сбор за оформление ${clearanceRub.toLocaleString("ru-RU")} ₽` };
}

// --- РБ ---
const BY_UTIL_USD = 430; // сумма из исходной таблицы

function byCustoms(s) {
  const eurUsd = num(s.eurUsd) || 1;
  const k = s.benefit === "Льготник" ? 0.5 : 1;
  if (s.fuel === "electric") {
    return { amount: 0, note: "электро: льгота РБ — без пошлины (ПРОВЕРИТЬ, действует ли в 2026)", warn: "Для электромобиля в РБ растаможка взята как 0 по льготе на электромобили — проверьте, что льгота действует на дату ввоза." };
  }
  const eur = ettEur({ age: num(s.age), cc: num(s.engineCc), priceEur: num(s.lotPrice) / eurUsd });
  return { amount: eur * eurUsd * k, note: `ЕТТ ${Math.round(eur).toLocaleString("ru-RU")} € → $ по курсу${k < 1 ? ", −50% льготник" : ""}` };
}

// --- Грузия ---
// Акциз: GEL за см³ по возрасту (ПРОВЕРИТЬ по Налоговому кодексу Грузии, ст. 188).
const GE_EXCISE_PER_CC = [
  [1, 1.5], [2, 1.4], [3, 1.4], [4, 1.2], [5, 1.0], [6, 0.95], [7, 1.1],
  [8, 1.25], [9, 1.35], [10, 1.5], [11, 1.6], [12, 1.7], [13, 1.8], [14, 1.9], [Infinity, 2.5],
];
const GE_DECLARATION_GEL = 150; // оформление декларации/таможенные услуги (ПРОВЕРИТЬ)

function geCustoms(s) {
  const usdGel = num(s.usdGel) || 1;
  if (s.fuel === "electric") {
    return { amount: GE_DECLARATION_GEL / usdGel, note: `электро: без акциза, только оформление ${GE_DECLARATION_GEL} GEL` };
  }
  const age = num(s.age), cc = num(s.engineCc);
  const rate = GE_EXCISE_PER_CC.find(([max]) => age < max)[1];
  let gel = cc * rate;
  let extra = "";
  if (s.fuel === "hybrid") { gel *= 0.4; extra = ", гибрид −60%"; }
  const amount = (gel + GE_DECLARATION_GEL) / usdGel;
  return { amount, note: `акциз ${cc} см³ × ${rate} GEL${extra} = ${Math.round(gel).toLocaleString("ru-RU")} GEL + оформление ${GE_DECLARATION_GEL} GEL` };
}

function customs(s) {
  if (s.market === "ru") return ruCustoms(s);
  if (s.market === "ge") return geCustoms(s);
  return byCustoms(s);
}

function util(s) {
  if (s.market === "ru") {
    const r = ruUtil(s, num(s.usdRub) || 1);
    return { amount: r.rub / (num(s.usdRub) || 1), note: r.note };
  }
  if (s.market === "ge") return { amount: 0, note: "в Грузии не платится" };
  return { amount: BY_UTIL_USD, note: "сумма из таблицы" };
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
  if (s.market === "ru" && !num(s.powerHp)) warnings.push("Для РФ укажите мощность в л.с. — от неё зависит утильсбор.");
  if (s.market === "ru" && s.fuel === "hybrid") warnings.push("Гибрид в РФ посчитан как бензиновый по объёму двигателя.");
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
