// Чистая логика расчёта — по формулам Google-таблицы «Просчет машины» (растаможка исправлена, см. ниже).

// Сбор аукциона. Каждая ступень: [верхняя граница цены лота, сбор площадки, доп. сбор].
// К каждой ступени прибавляются фиксированные 95 + 15 + 20 (как в таблице).
const COPART = [
  [49.99, 25, 0], [99.99, 45, 0], [199.99, 80, 29], [299.99, 130, 29],
  [349.99, 137.5, 29], [399.99, 145, 29], [499.99, 185, 39], [599.99, 205, 39],
  [699.99, 235, 39], [799.99, 260, 39], [899.99, 280, 39], [999.99, 305, 39],
  [1199.99, 355, 59], [1299.99, 380, 59], [1399.99, 400, 59], [1499.99, 410, 69],
  [1599.99, 420, 69], [1699.99, 440, 69], [1799.99, 450, 69], [1999.99, 465, 79],
  [2399.99, 500, 79], [2499.99, 525, 79], [2999.99, 550, 79], [3499.99, 650, 89],
  [3999.99, 700, 89], [4499.99, 725, 89], [4999.99, 750, 89], [5999.99, 775, 99],
  [6999.99, 800, 99], [7999.99, 825, 99], [8499.99, 850, 119], [9999.99, 850, 129],
];
const COPART_TOP = { pct: 0.075, extra: 129 }; // > 9999.99

const IAAI = [
  [49.99, 25, 0], [99.99, 45, 0], [199.99, 80, 40], [299.99, 130, 40],
  [349.99, 137, 40], [399.99, 145, 40], [449.99, 175, 40], [499.99, 185, 50],
  [549.99, 205, 50], [599.99, 210, 50], [699.99, 240, 50], [799.99, 270, 50],
  [899.99, 295, 50], [999.99, 320, 50], [1199.99, 375, 75], [1299.99, 395, 75],
  [1399.99, 410, 75], [1499.99, 430, 85], [1599.99, 445, 85], [1699.99, 465, 85],
  [1799.99, 485, 85], [1999.99, 510, 100], [2399.99, 535, 100], [2499.99, 570, 100],
  [2999.99, 610, 100], [3499.99, 655, 110], [3999.99, 705, 110], [4499.99, 725, 110],
  [4999.99, 750, 110], [5499.99, 775, 125], [5999.99, 800, 125], [6499.99, 825, 125],
  [6999.99, 845, 125], [7499.99, 880, 125], [7999.99, 900, 140], [8499.99, 925, 140],
  [9999.99, 945, 140], [14999.99, 1000, 140],
];
const IAAI_TOP = { pct: 0.075, extra: 140 }; // > 14999.99

const FIXED = 95 + 15 + 20;

export function auctionFee(lot, platform) {
  const [tiers, top] = platform === "Copart" ? [COPART, COPART_TOP] : [IAAI, IAAI_TOP];
  for (const [max, fee, extra] of tiers) {
    if (lot <= max) return fee + extra + FIXED;
  }
  return lot * top.pct + top.extra + FIXED;
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
  if (item.kind === "auction") return auctionFee(num(s.lotPrice), s.platform);
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
