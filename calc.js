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

// Пошлина для авто младше 3 лет (ЕТТ ЕАЭС): % от стоимости в евро, но не меньше X € за см³.
// [верхняя граница стоимости в €, процент, минимум € за см³]
const UNDER3 = [
  [8500, 0.54, 2.5], [16700, 0.48, 3.5], [42300, 0.48, 5.5],
  [84500, 0.48, 7.5], [169000, 0.48, 15], [Infinity, 0.48, 20],
];

// Растаможка (ячейка B17), исправленная:
// — ставки за см³ в евро, поэтому результат переводится в доллары по курсу EUR/USD;
// — для авто младше 3 лет берётся % от цены лота в евро (в таблице по ошибке стоял курс E5).
// Возвращает сумму в долларах.
export function customsDuty({ age, engineCc, eurUsd, benefit, lotPrice }) {
  const cc = engineCc;
  const rate = eurUsd > 0 ? eurUsd : 1;
  let v; // в евро
  if (age < 3) {
    const priceEur = (lotPrice || 0) / rate;
    const [, pct, perCc] = UNDER3.find(([max]) => priceEur <= max);
    v = Math.max(priceEur * pct, cc * perCc);
  } else if (age <= 5) {
    v = cc <= 1000 ? cc * 1.5 : cc <= 1500 ? cc * 1.7 : cc <= 1800 ? cc * 2.5
      : cc <= 2300 ? cc * 2.7 : cc <= 3000 ? cc * 3 : cc * 3.6;
  } else {
    v = cc <= 1000 ? cc * 3 : cc <= 1500 ? cc * 3.2 : cc <= 1800 ? cc * 3.5
      : cc <= 2300 ? cc * 4.8 : cc <= 3000 ? cc * 5 : cc * 5.7;
  }
  return v * rate * (benefit === "Льготник" ? 0.5 : 1);
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

const num = (x) => (Number.isFinite(+x) ? +x : 0);

export function costValue(item, s) {
  if (item.kind === "service") return num(s.servicePackage);
  if (item.kind === "shipping") return num(s.shippingPoti);
  if (item.kind === "repair") return num(s.repairCost);
  if (item.kind === "auction") return auctionFee(num(s.lotPrice), s.platform, s.bidType);
  if (item.kind === "customs") return customsDuty({
    age: num(s.age), engineCc: num(s.engineCc), eurUsd: num(s.eurUsd), benefit: s.benefit,
    lotPrice: num(s.lotPrice),
  });
  return num(item.value);
}

export function compute(s) {
  const lot = num(s.lotPrice);
  const rows = s.costs.map((c) => ({ ...c, amount: costValue(c, s) }));
  const otherCosts = rows.reduce((a, r) => a + r.amount, 0); // всё, кроме самого лота
  const total = lot + otherCosts;                            // B33 — себестоимость в РБ
  const pct = num(s.markupPct) / 100;
  const markup = total * pct;                                // B34
  const finalPrice = total + markup;                         // B35
  const market = num(s.marketMin);                           // B36
  const maxBidSheet = market - (otherCosts + markup);        // B37 — как в таблице
  const marginVsMarket = market - total;                     // B41
  return { rows, lot, otherCosts, total, markup, finalPrice, market, maxBidSheet, marginVsMarket,
    breakEvenBid: breakEvenBid(s) };
}

// Ставка, при которой «итоговая цена с наценкой» ровно равна рыночной цене.
// Учитывает, что сбор аукциона и наценка тоже растут вместе со ставкой.
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
