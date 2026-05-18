// src/index.js — линейная машина состояний + безопасное редактирование
const { extractEntities } = require("./search");
const { getState, updateState, clearState } = require("./state");
const { generateResponse } = require("./gigachat");
const fs = require("fs");
const path = require("path");

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "../config.json"), "utf8"));
const MENU = config.menu;
const PICKUP = config.pickup_address || "ул. Гагарина, 10 (ТЦ «Салют»), 10:00–22:00";
const lastOrder = new Map();

const V = {
  greet: "Привет! Меню показать или сразу оформим?",
  menu: (txt) => `Вот что есть:\n${txt}\nНапишите, что добавить.`,
  taken: (txt) => `Записал: ${txt}. Всё верно? (да/изменить) Если ок — доставка или самовывоз?`,
  pickup: (addr) => `Ок, самовывоз. Ждём на ${addr}. Как оплатите: онлайн, картой или наличными?`,
  delivery: "Хорошо, доставка. На какой адрес везти?",
  address: "Адрес записал. Оплата: онлайн сейчас, картой курьеру или наличными?",
  payment: (pay) => `Понял, оплата ${pay}. Оставьте номер:`,
  phone: (tot, items, loc, pay) => `Номер записал. Сверим (${tot}₽):\n${items}\n${loc}\nОплата: ${pay}\n\nВсё верно? (да/нет)`,
  fallback: "Не расслышал. Напишите «меню» или «Пепперони 2 штуки»."
};

const payTxt = { card_online: "Онлайн", cash: "Наличные", card_cash: "Картой при получении" };

async function polish(text) {
  try { const r = await generateResponse(`Сделай короче и живее: "${text}"`, 2500); return r?.trim() || text; }
  catch { return text; }
}

function mergeItems(base, updates) {
  const merged = [...(base || [])];
  updates.forEach(u => {
    const idx = merged.findIndex(m => m.name === u.name);
    if (idx >= 0) merged[idx].qty += u.qty; else merged.push(u);
  });
  return merged.filter(i => i.qty > 0);
}

function fmt(items) {
  if (!items?.length) return "Пусто";
  const g = {};
  items.forEach(i => {
    let c = "Прочее";
    if (/пицц|маргарит|диабло|пепперон/.test(i.name.toLowerCase())) c = "Пиццы";
    else if (/паст|карбонар|классич/.test(i.name.toLowerCase())) c = "Паста";
    else if (/кол|сок|напит/.test(i.name.toLowerCase())) c = "Напитки";
    if (!g[c]) g[c] = []; g[c].push(`${i.name} × ${i.qty}`);
  });
  return Object.entries(g).map(([k, v]) => `${k}:\n${v.map(x => `  • ${x}`).join("\n")}`).join("\n");
}

function calc(items) {
  let t = 0;
  for (const cat of Object.values(MENU)) for (const p of cat) {
    const m = items?.find(i => i.name.toLowerCase() === p.name.toLowerCase());
    if (m) t += p.price * m.qty;
  } return t || 0;
}

async function processMessage(userId, text) {
  try {
    const state = getState(userId);
    const input = text.trim().toLowerCase();
    const now = Date.now();
    const d = state.data || {};

    if (lastOrder.has(userId) && now - lastOrder.get(userId) < 120000) {
      if (/спасибо|благодарю|ок|пока/.test(input)) return "Всегда рады помочь!";
      clearState(userId); lastOrder.delete(userId);
    }

    if (/привет|здравствуй|добр/.test(input) && state.step === "items" && !d.items?.length) return await polish(V.greet);
    if (/start|сброс|начать/.test(input)) { clearState(userId); return `Новый заказ? «меню» или сразу позиции. Самовывоз: ${PICKUP}`; }

    // === ШАГ 1: Товары ===
    if (state.step === "items") {
      if (input.includes("меню")) {
        let cats = MENU;
        if (/только\s*пицц/.test(input)) cats = { "🍕 Пиццы": MENU["🍕 Пиццы"] };
        else if (/только\s*паст/.test(input)) cats = { "🍝 Паста": MENU["🍝 Паста"] };
        let m = ""; for (const [k, v] of Object.entries(cats)) m += `${k}:\n${v.map(i => `  • ${i.name} — ${i.price}₽`).join("\n")}\n\n`;
        return await polish(V.menu(m.trim()));
      }
      if (/все.*по\s+1|кажд.*по\s+1/i.test(input)) {
        let tc = Object.keys(MENU);
        if (/пицц/.test(input)) tc = ["🍕 Пиццы"]; else if (/паст/.test(input)) tc = ["🍝 Паста"];
        const items = []; tc.forEach(c => { if (MENU[c]) MENU[c].forEach(p => items.push({ name: p.name, qty: 1 })); });
        if (items.length) { updateState(userId, { step: "fulfillment", data: { items } }); return await polish(V.taken(items.map(i => i.name).join(", "))); }
      }
      const p = extractEntities(text);
      if (p.items?.length) {
        if (/убрать|минус|без\s+/.test(input)) p.items.forEach(i => i.qty = -Math.abs(i.qty));
        
        const newItems = mergeItems(d.items, p.items);
        
        // Если редактируем на финальном этапе → остаёмся в confirm
        if (d.correction && state.step === "confirm") {
          updateState(userId, { step: "confirm", data: { ...d, items: newItems, correction: false } });
          return `Обновил. Сверим (${calc(newItems)}₽):\n${fmt(newItems)}\n${d.fulfillment === 'delivery' ? `Доставка: ${d.address||''}` : `Самовывоз: ${PICKUP}`}\nОплата: ${payTxt[d.payment_method] || 'Онлайн'}\n\nВсё верно? (да/нет)`;
        }
        // Иначе → линейно переходим к доставке
        updateState(userId, { step: "fulfillment", data: { ...d, items: newItems } });
        return await polish(V.taken(newItems.map(i => `${i.name} × ${i.qty}`).join(", ")));
      }
      return V.fallback;
    }

    // === ШАГ 2: Доставка/Самовывоз ===
    if (state.step === "fulfillment") {
      if (/изменить|поправить|состав|добавь|убери/.test(input)) {
        updateState(userId, { step: "items", data: { ...d, correction: true } });
        return await polish("Что добавить или убрать?");
      }
      if (input.includes("сам") || /самовывоз|забер/.test(input)) {
        updateState(userId, { step: "payment", data: { ...d, fulfillment: "pickup", address: PICKUP } });
        return await polish(V.pickup(PICKUP));
      }
      if (/доставк|привез|курьер/.test(input)) {
        updateState(userId, { step: "address", data: { ...d, fulfillment: "delivery" } });
        return await polish(V.delivery);
      }
      return "Уточните: доставка или самовывоз?";
    }

    // === ШАГ 3: Адрес ===
    if (state.step === "address") {
      if (/\?|бесплат|сколько/.test(input)) return "Доставка 200₽, бесплатно от 1000₽. На какой адрес?";
      if (input.length < 5) return "Адрес короткий. Улица и дом.";
      updateState(userId, { step: "payment", data: { ...d, address: text.trim() } });
      return await polish(V.address);
    }

    // === ШАГ 4: Оплата ===
    if (state.step === "payment") {
      if (/^(1|2|3|онлайн|налич|карт|безнал)/.test(input) || /оплат/.test(input)) {
        let pay = "card_online", txt = "онлайн";
        if (/2|налич/.test(input)) { pay = "cash"; txt = "наличные"; } else if (/3|карт/.test(input)) { pay = "card_cash"; txt = "картой"; }
        updateState(userId, { step: "phone", data: { ...d, payment_method: pay } });
        return await polish(V.payment(txt));
      }
      return "Не понял. Онлайн, картой или наличными?";
    }

    // === ШАГ 5: Телефон ===
    if (state.step === "phone") {
      if (text.replace(/\D/g, "").length < 10) return "Номер короткий. +7...";
      updateState(userId, { step: "confirm", data: { ...d, phone: text.trim() } });
      return V.phone(calc(d.items), fmt(d.items), d.fulfillment === 'delivery' ? `Доставка: ${d.address||''}` : `Самовывоз: ${PICKUP}`, payTxt[d.payment_method] || "Онлайн");
    }

    // === ШАГ 6: Подтверждение ===
    if (state.step === "confirm") {
      if (/^\s*да\s*$|подтверждаю/.test(input)) {
        clearState(userId); lastOrder.set(userId, now);
        return JSON.stringify({ items: d.items||[], fulfillment: d.fulfillment||"delivery", address: d.address||"", payment_method: d.payment_method||"card_online", phone: d.phone||"", total: calc(d.items), timestamp: new Date().toISOString() });
      }
      if (/^\s*нет\s*$|изменить/.test(input)) return "Что правим: состав, адрес или оплата?";
      if (/состав|товар|пицц|паст|кол|сок|добавь|убери/.test(input)) { updateState(userId, { step: "items", data: { ...d, correction: true } }); return await polish("Что добавить/убрать?"); }
      if (/адрес|доставк/.test(input)) { updateState(userId, { step: "address", data: { ...d, correction: true } }); return await polish("Новый адрес?"); }
      if (/оплат|карт|налич/.test(input)) { updateState(userId, { step: "payment", data: { ...d, correction: true } }); return await polish("Как изменить оплату?"); }
      if (/^\s*отмена\s*$/.test(input)) { clearState(userId); return "Отменил. «начать» для нового."; }
      return "Что правим: состав, адрес или оплата?";
    }

    return /спасибо|ок/.test(input) ? "Всегда рады! 🍕" : V.fallback;
  } catch (e) { console.error("❌", e.message); return "😕 Ошибка. «начать»"; }
}

module.exports = { processMessage };