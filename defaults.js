// Значения по умолчанию — взяты из Google-таблицы.
export function defaultCosts() {
  return [
    { id: "auction", label: "Сборы аукциона", kind: "auction" },
    { id: "shipping", label: "Доставка до Поти", kind: "shipping" },
    { id: "c2", label: "Услуги льготника", value: 500 },
    { id: "c3", label: "Сборы порта", value: 110 },
    { id: "c4", label: "Доставка автомобиля с Поти до Батуми", value: 70 },
    { id: "c5", label: "Оплата за сервис заказа автомобиля", value: 200 },
    { id: "c6", label: "Реэкспорт", value: 240 },
    { id: "c7", label: "Доставка до Минска (топливо)", value: 300 },
    { id: "c8", label: "Брокер", value: 400 },
    { id: "c9", label: "GPS пломба", value: 300 },
    { id: "c10", label: "Страховка в РФ", value: 30 },
    { id: "c11", label: "Страховка в РБ", value: 15 },
    { id: "c12", label: "Стоянка на границе", value: 15 },
    { id: "c13", label: "Платные дороги в РБ на 15 дней", value: 35 },
    { id: "customs", label: "Растаможка", kind: "customs" },
    { id: "c14", label: "Утильсбор", value: 430 },
    { id: "c15", label: "Таможенные сборы", value: 40 },
    { id: "c16", label: "Услуги таможни", value: 90 },
    { id: "c17", label: "Услуга СВХ", value: 60 },
    { id: "service", label: "Пакет услуг сопровождения", kind: "service" },
    { id: "repair", label: "Примерная цена восстановления", kind: "repair" },
  ];
}

// Пакеты услуг сопровождения: цена и что входит.
export const SERVICE_PACKAGES = [
  { price: 500, title: "Базовый",
    text: "Приёмка машины в Грузии, постановка на ремонт, дефектовка, поиск запчастей, сопровождение в оформлении реэкспорта." },
  { price: 1000, title: "До Владикавказа",
    text: "Всё из пакета за $500 + подготовка документов для реэкспорта и вывоз машины на территорию России до Владикавказа." },
  { price: 2000, title: "Под ключ до Минска",
    text: "Всё из пакета за $1000 + перегон до Минска, сопровождение на зоне растаможки, постановка машины на учёт." },
  { price: 0, title: "Без пакета", text: "Услуги сопровождения не нужны." },
];

export function defaultCalc() {
  return {
    name: "Новый расчёт",
    lotPrice: 23000,
    platform: "Copart",
    bidType: "pre",
    engineCc: 2000,
    eurUsd: 1.1237,
    eurUsdAuto: true,
    prodDate: "2017-09-01",
    age: 4,
    benefit: "Льготник",
    shippingPoti: 2000,
    repairCost: 3000,
    servicePackage: 2000,
    markupPct: 30,
    marketMin: 47000,
    notes: "",
    costs: defaultCosts(),
  };
}
