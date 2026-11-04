// Значения по умолчанию. Исходные суммы — из Google-таблицы (рынок РБ).

export const MARKETS = {
  by: { label: "Беларусь", short: "РБ" },
  ru: { label: "Россия", short: "РФ" },
  ge: { label: "Грузия", short: "Грузии" },
};

export const FUELS = {
  petrol: "Бензин",
  diesel: "Дизель",
  hybrid: "Гибрид (бензин + электро)",
  electric: "Электро",
};

// Ручные статьи: суммы на каждый рынок. 0 — статья на этом рынке не платится.
export const MANUAL_DEFAULTS = {
  c2: { label: "Услуги льготника", by: 500, ru: 0, ge: 0 },
  c3: { label: "Сборы порта", by: 110, ru: 110, ge: 110 },
  c4: { label: "Доставка автомобиля с Поти до Батуми", by: 70, ru: 70, ge: 70 },
  c5: { label: "Оплата за сервис заказа автомобиля", by: 200, ru: 200, ge: 200 },
  c6: { label: "Реэкспорт", by: 240, ru: 240, ge: 0 },
  c7: { label: "Доставка до места продажи (топливо)", by: 300, ru: 300, ge: 0 },
  c8: { label: "Брокер", by: 400, ru: 400, ge: 0 },
  c9: { label: "GPS пломба (транзит через РФ)", by: 300, ru: 0, ge: 0 },
  c10: { label: "Страховка в РФ", by: 30, ru: 30, ge: 0 },
  c11: { label: "Страховка в РБ", by: 15, ru: 0, ge: 0 },
  c12: { label: "Стоянка на границе", by: 15, ru: 15, ge: 0 },
  c13: { label: "Платные дороги в РБ на 15 дней", by: 35, ru: 0, ge: 0 },
  c15: { label: "Таможенные сборы", by: 40, ru: 0, ge: 0 },
  c16: { label: "Услуги таможни", by: 90, ru: 90, ge: 0 },
  c17: { label: "Услуга СВХ", by: 60, ru: 60, ge: 0 },
};

const manual = (id) => {
  const d = MANUAL_DEFAULTS[id];
  return { id, label: d.label, values: { by: d.by, ru: d.ru, ge: d.ge } };
};

export function defaultCosts() {
  return [
    { id: "auction", label: "Сборы аукциона", kind: "auction" },
    { id: "shipping", label: "Доставка до Поти", kind: "shipping" },
    manual("c2"), manual("c3"), manual("c4"), manual("c5"), manual("c6"), manual("c7"),
    manual("c8"), manual("c9"), manual("c10"), manual("c11"), manual("c12"), manual("c13"),
    { id: "customs", label: "Растаможка", kind: "customs" },
    { id: "util", label: "Утильсбор", kind: "util" },
    manual("c15"), manual("c16"), manual("c17"),
    { id: "service", label: "Пакет услуг сопровождения", kind: "service" },
    { id: "repair", label: "Примерная цена восстановления", kind: "repair" },
  ];
}

// Пакеты услуг сопровождения: цена, что входит и на каких рынках доступен.
export const SERVICE_PACKAGES = [
  { price: 500, markets: ["by", "ru"], title: "Базовый",
    text: "Приёмка машины в Грузии, постановка на ремонт, дефектовка, поиск запчастей, сопровождение в оформлении реэкспорта." },
  { price: 1000, markets: ["by", "ru"], title: "До Владикавказа",
    text: "Всё из пакета за $500 + подготовка документов для реэкспорта и вывоз машины на территорию России до Владикавказа." },
  { price: 2000, markets: ["by", "ru"], title: "Под ключ до Минска",
    text: "Всё из пакета за $1000 + перегон до Минска, сопровождение на зоне растаможки, постановка машины на учёт." },
  { price: 500, markets: ["ge"], title: "Базовый (Грузия)",
    text: "Приёмка машины в Грузии, постановка на ремонт, дефектовка, поиск запчастей, помощь с растаможкой в Грузии." },
  { price: 0, markets: ["by", "ru", "ge"], title: "Без пакета", text: "Услуги сопровождения не нужны." },
];

// Поля, у которых на каждом рынке своё значение.
export const PER_MARKET_FIELDS = ["servicePackage", "marketMin"];

export function defaultPerMarket() {
  return {
    by: { servicePackage: 2000, marketMin: 47000 },
    ru: { servicePackage: 1000, marketMin: 47000 },
    ge: { servicePackage: 500, marketMin: 47000 },
  };
}

export function defaultCalc() {
  return {
    name: "Новый расчёт",
    market: "by",
    lotPrice: 23000,
    platform: "Copart",
    bidType: "pre",
    fuel: "petrol",
    engineCc: 2000,
    powerHp: 150,
    eurUsd: 1.1237,
    eurUsdAuto: true,
    usdRub: 81,
    usdGel: 2.7,
    fxAuto: true,
    prodDate: "2017-09-01",
    age: 4,
    benefit: "Льготник",
    ruImporter: "personal",
    shippingPoti: 2000,
    repairCost: 3000,
    markupPct: 30,
    perMarket: defaultPerMarket(),
    notes: "",
    costs: defaultCosts(),
  };
}
