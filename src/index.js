// src/index.js — исправлен поток: после апсейла бот спрашивает адрес, а не финиширует
const { extractEntities } = require("./search");
const { getState, updateState, clearState } = require("./state");
const { generateResponse } = require("./gigachat");
const fs = require("fs");
const path = require("path");

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "../config.json"), "utf8"));
const MENU = config.menu;
const PICKUP = config.pickup_address || "ул. Гагарина, 10 (ТЦ «Салют»), 10:00–22:00";
const DELIVERY = config.delivery_settings || { price: 200, free_threshold: 1000 };
const lastOrder = new Map();

const MENU_NAMES = Object.values(MENU).flat().map(i => i.name).join(', ');

const V = {
  greet: "Привет! Меню показать или сразу оформим?",
  menu: (txt) => `Вот что есть:\n${txt}\n🚚 Доставка по городу: ${DELIVERY.price}₽ (бесплатно от ${DELIVERY.free_threshold}₽)\nНапишите, что добавить.`,
  taken: (txt) => `Записал: ${txt}. Всё верно? (да/изменить) Если ок — доставка или самовывоз?`,
  pickup: (addr) => `Ок, самовывоз. Ждём на ${addr}. Как оплатите: онлайн, картой или наличными?`,
  delivery: "На какой адрес везти?",
  address: "Адрес записал. Оплата: онлайн сейчас, картой курьеру или наличными?",
  payment: (pay) => `Понял, оплата ${pay}. Оставьте номер:`,
  phone: (tot, items, loc, pay) => `Номер записал. Сверим (${tot}₽):\n${items}\n${loc}\nОплата: ${pay}\n\nВсё верно? (да/нет)`,
  correctionPrompt: `Как изменить заказ? (разделяйте запятыми)\n• Изменить кол-во: «Пепперони 2» (станет ровно 2)\n• Удалить: «убрать Кола» (исчезнет)\n• Если товар указан и на замену, и на удаление — останется новое кол-во\n\n📋 Меню: ${MENU_NAMES}`,
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
    if (!i?.name) return;
    let c = "Прочее";
    if (/пицц|маргарит|диабло|пепперон/.test(i.name.toLowerCase())) c = "Пиццы";
    else if (/паст|карбонар|классич/.test(i.name.toLowerCase())) c = "Паста";
    else if (/кол|сок|напит/.test(i.name.toLowerCase())) c = "Напитки";
    if (!g[c]) g[c] = []; g[c].push(`${i.name} × ${i.qty}`);
  });
  return Object.entries(g).map(([k, v]) => `${k}:\n${v.map(x => `  • ${x}`).join("\n")}`).join("\n");
}

function calcItems(items) {
  let t = 0;
  for (const cat of Object.values(MENU)) {
    if (!Array.isArray(cat)) continue;
    for (const p of cat) {
      if (!p?.name) continue;
      const m = items?.find(i => i?.name?.toLowerCase() === p.name.toLowerCase());
      if (m) t += p.price * m.qty;
    }
  } return t;
}

function calcTotal(items, fulfillment) {
  const itemSum = calcItems(items);
  if (fulfillment === "delivery" && itemSum < DELIVERY.free_threshold) return itemSum + DELIVERY.price;
  return itemSum;
}

// 🚀 УМНЫЙ АПСЕЙЛ: ищет 1 товар, пару товаров или самый дорогой
function findUpsellItem(diff) {
  const allItems = Object.values(MENU).flat().filter(i => i && i.name && i.price);
  if (!allItems.length) return null;

  // 1. Ищем один товар, покрывающий разницу
  const validSingles = allItems.filter(i => i.price >= diff);
  if (validSingles.length) {
    validSingles.sort((a, b) => a.price - b.price);
    const best = validSingles[0];
    return { items: [{ ...best, qty: 1 }], text: `${best.name} за ${best.price}₽` };
  }

  // 2. Ищем пару товаров
  let bestPair = null;
  let minPairPrice = Infinity;
  for (let i = 0; i < allItems.length; i++) {
    for (let j = i + 1; j < allItems.length; j++) {
      const a = allItems[i], b = allItems[j];
      const pairSum = a.price + b.price;
      if (pairSum >= diff && pairSum < minPairPrice) {
        minPairPrice = pairSum;
        bestPair = [a, b];
      }
    }
  }
  if (bestPair) {
    const total = bestPair[0].price + bestPair[1].price;
    return { items: bestPair.map(i => ({ ...i, qty: 1 })), text: `${bestPair[0].name} и ${bestPair[1].name} за ${total}₽` };
  }

  // 3. Фоллбэк: самый дорогой
  allItems.sort((a, b) => b.price - a.price);
  const maxItem = allItems[0];
  return { items: [{ ...maxItem, qty: 1 }], text: `${maxItem.name} за ${maxItem.price}₽ (подберётесь ближе к бесплатной)` };
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
        if (/только\s*пицц/.test(input)) { const key = Object.keys(MENU).find(k => k.toLowerCase().includes('пицц')); if (key) cats = { [key]: MENU[key] }; }
        else if (/только\s*паст/.test(input)) { const key = Object.keys(MENU).find(k => k.toLowerCase().includes('паст')); if (key) cats = { [key]: MENU[key] }; }
        let m = "";
        for (const [k, v] of Object.entries(cats)) { if (Array.isArray(v)) m += `${k}:\n${v.map(i => `  • ${i.name} — ${i.price}₽`).join("\n")}\n\n`; }
        return await polish(V.menu(m.trim()));
      }

      const p = extractEntities(text);
      if (p.items?.length) {
        let newItems;
        if (d.correction) {
          const chunks = text.split(/[,;]+/).map(c => c.trim()).filter(Boolean);
          const setQty = {};
          const removeList = [];
          chunks.forEach(chunk => {
            const lower = chunk.toLowerCase();
            const isRemoveCmd = lower.includes('убрать') || lower.includes('удалить') || lower.includes('без ');
            const found = extractEntities(chunk);
            found.items.forEach(item => {
              if (isRemoveCmd) removeList.push(item.name);
              else setQty[item.name] = item.qty;
            });
          });
          const finalRemove = new Set(removeList.filter(name => setQty[name] === undefined));
          newItems = (d.items || []).map(item => {
            if (setQty[item.name] !== undefined) return { ...item, qty: setQty[item.name] };
            if (finalRemove.has(item.name)) return { ...item, qty: 0 };
            return item;
          }).filter(i => i.qty > 0);
          Object.keys(setQty).forEach(name => { if (!newItems.find(i => i.name === name)) newItems.push({ name, qty: setQty[name] }); });
        } else {
          newItems = mergeItems(d.items, p.items);
        }

        if (d.correction) {
          const loc = d.fulfillment === "delivery" ? `Доставка: ${d.address || ''}` : `Самовывоз: ${PICKUP}`;
          const finalTotal = calcTotal(newItems, d.fulfillment);
          const itemSum = calcItems(newItems);
          let statusMsg = "";
          let pendingUpsell = null;

          if (d.fulfillment === "delivery") {
            if (itemSum < DELIVERY.free_threshold) {
              const diff = DELIVERY.free_threshold - itemSum;
              const upsellData = findUpsellItem(diff);
              if (upsellData) {
                pendingUpsell = upsellData;
                statusMsg = `\n⚠️ Сумма товаров ${itemSum}₽. Доставка по городу — ${DELIVERY.price}₽. Не хватает ${diff}₽ до бесплатной. Добавить ${upsellData.text}? (да/нет/добавить)`;
              } else {
                statusMsg = `\n⚠️ Доставка по городу — ${DELIVERY.price}₽`;
              }
            } else {
              statusMsg = `\n✅ У вас сейчас доставка по городу бесплатная!`;
            }
          }
          updateState(userId, { step: "confirm", data: { ...d, items: newItems, correction: false, pending_upsell_item: pendingUpsell } });
          return `Обновил. Итого: ${finalTotal}₽:\n${fmt(newItems)}\n${loc}\nОплата: ${payTxt[d.payment_method] || 'Онлайн'}${statusMsg}\n\nВсё верно? (да/нет)`;
        }

        updateState(userId, { step: "fulfillment", data: { ...d, items: newItems } });
        return await polish(V.taken(newItems.map(i => `${i.name} × ${i.qty}`).join(", ")));
      }
      return V.fallback;
    }

    // === ШАГ 2: Доставка/Самовывоз ===
    if (state.step === "fulfillment") {
      if (/нет|не\s|измен|поправ|состав|друг|ошиб/.test(input)) { updateState(userId, { step: "items", data: { ...d, correction: true } }); return await polish(V.correctionPrompt); }
      if (input.includes("сам") || /самовывоз|забер/.test(input)) { updateState(userId, { step: "payment", data: { ...d, fulfillment: "pickup", address: PICKUP } }); return await polish(V.pickup(PICKUP)); }
      if (/доставк|привез|курьер/.test(input)) {
        const itemSum = calcItems(d.items || []);
        if (itemSum < DELIVERY.free_threshold) {
          const needed = DELIVERY.free_threshold - itemSum;
          const upsellData = findUpsellItem(needed);
          if (upsellData) {
            updateState(userId, { step: "delivery_check", data: { ...d, fulfillment: "delivery", upsell_item: upsellData, needed_amount: needed } });
            return `До бесплатной доставки не хватает ${needed}₽. Добавить ${upsellData.text}? (да/нет/добавить)`;
          }
        }
        updateState(userId, { step: "address", data: { ...d, fulfillment: "delivery" } }); return await polish("У вас сейчас доставка по городу бесплатная! " + V.delivery);
      }
      return "Уточните: доставка или самовывоз?";
    }

    // === ШАГ 2.5: Апсейл доставки (ИСПРАВЛЕНО: возврат к адресу) ===
    if (state.step === "delivery_check") {
      const p = extractEntities(text);
      const hasItemRequest = p.items?.length > 0;

      // Если согласился добавить
      if (/^\s*да\s*$|добавить|добавь|хочу|возьми|ок|беру/.test(input) || hasItemRequest) {
        const itemsToAdd = hasItemRequest ? p.items : d.upsell_item.items;
        const updatedItems = mergeItems(d.items, itemsToAdd);
        const finalTotal = calcTotal(updatedItems, "delivery");
        const itemSum = calcItems(updatedItems);

        // ✅ ИСПРАВЛЕНИЕ: Переходим в ШАГ "address" (ввод адреса), а не в "confirm"
        updateState(userId, {
          step: "address",
          data: {
            ...d,
            items: updatedItems,
            fulfillment: "delivery",
            correction: false
          }
        });

        const statusMsg = itemSum >= DELIVERY.free_threshold
          ? `\n✅ У вас сейчас доставка по городу бесплатная!`
          : `\n⚠️ Доставка по городу — ${DELIVERY.price}₽`;

        const names = itemsToAdd.map(i => i.name).join(', ');

        // Показываем итог и сразу спрашиваем адрес
        return `Добавил ${names}! Итого: ${finalTotal}₽:\n${fmt(updatedItems)}\nОплата: ${payTxt[d.payment_method] || 'Онлайн'}${statusMsg}\n\nНа какой адрес везти заказ?`;
      }

      // Если отказался — идем к вводу адреса без добавления
      updateState(userId, { step: "address", data: { ...d, fulfillment: "delivery" } });
      return await polish(V.delivery);
    }

    // === ШАГ 3: Адрес ===
    if (state.step === "address") {
      if (/\?|бесплат|сколько/.test(input)) return "Доставка по городу 200₽, бесплатно от 1000₽. На какой адрес?";
      if (input.length < 5) return "Адрес короткий. Улица и дом.";
      updateState(userId, { step: "payment", data: { ...d, address: text.trim() } }); return await polish(V.address);
    }

    // === ШАГ 4: Оплата ===
    if (state.step === "payment") {
      if (/^(1|2|3|онлайн|налич|карт|безнал)/.test(input) || /оплат/.test(input)) {
        let pay = "card_online", txt = "онлайн";
        if (/2|налич/.test(input)) { pay = "cash"; txt = "наличные"; } else if (/3|карт/.test(input)) { pay = "card_cash"; txt = "картой"; }
        updateState(userId, { step: "phone", data: { ...d, payment_method: pay } }); return await polish(V.payment(txt));
      }
      return "Не понял. Онлайн, картой или наличными?";
    }

    // === ШАГ 5: Телефон ===
    if (state.step === "phone") {
      if (text.replace(/\D/g, "").length < 10) return "Номер короткий. +7...";
      const finalTotal = calcTotal(d.items, d.fulfillment);
      const itemSum = calcItems(d.items);
      let pendingUpsell = null;
      if (d.fulfillment === "delivery" && itemSum < DELIVERY.free_threshold) {
        const diff = DELIVERY.free_threshold - itemSum;
        const upsellData = findUpsellItem(diff);
        if (upsellData) pendingUpsell = upsellData;
      }
      updateState(userId, { step: "confirm", data: { ...d, phone: text.trim(), pending_upsell_item: pendingUpsell } });
      const loc = d.fulfillment === "delivery" ? `Доставка: ${d.address || ''}` : `Самовывоз: ${PICKUP}`;
      return V.phone(finalTotal, fmt(d.items), loc, payTxt[d.payment_method] || "Онлайн");
    }

    // === ШАГ 6: Подтверждение ===
    if (state.step === "confirm") {
      // 🚀 ПРИОРИТЕТ: Обработка апсейла на финише
      if (d.pending_upsell_item) {
        const proposedNames = d.pending_upsell_item.items.map(i => i.name.toLowerCase());
        const isMatch = proposedNames.some(name => input.includes(name)) ||
          /^\s*да\s*$|добавить|добавь|хочу|ок|беру|возьми|давай/.test(input);

        if (isMatch) {
          const itemsToAdd = d.pending_upsell_item.items;
          const updatedItems = mergeItems(d.items, itemsToAdd);
          const finalTotal = calcTotal(updatedItems, d.fulfillment);
          const itemSum = calcItems(updatedItems);
          const loc = d.fulfillment === "delivery" ? `Доставка: ${d.address || ''}` : `Самовывоз: ${PICKUP}`;
          const statusMsg = itemSum >= DELIVERY.free_threshold ? `\n✅ У вас сейчас доставка по городу бесплатная!` : `\n⚠️ Доставка по городу — ${DELIVERY.price}₽`;

          updateState(userId, { step: "confirm", data: { ...d, items: updatedItems, pending_upsell_item: null } });
          const names = itemsToAdd.map(i => i.name).join(', ');
          return `Добавил ${names}! Итого: ${finalTotal}₽:\n${fmt(updatedItems)}\n${loc}\nОплата: ${payTxt[d.payment_method] || 'Онлайн'}${statusMsg}\n\nВсё верно? (да/нет)`;
        }
      }

      if (/^\s*да\s*$|подтверждаю/.test(input)) {
        clearState(userId); lastOrder.set(userId, now);
        return JSON.stringify({ items: d.items || [], fulfillment: d.fulfillment || "delivery", address: d.address || "", payment_method: d.payment_method || "card_online", phone: d.phone || "", total: calcTotal(d.items, d.fulfillment), timestamp: new Date().toISOString() });
      }
      if (/^\s*нет\s*$|изменить/.test(input)) {
        updateState(userId, { step: "confirm", data: { ...d, pending_upsell_item: null } });
        return "Что правим: состав, адрес или оплата?";
      }
      if (/состав|товар|пицц|паст|кол|сок|убери/.test(input)) {
        updateState(userId, { step: "items", data: { ...d, correction: true, pending_upsell_item: null } });
        return await polish(V.correctionPrompt);
      }
      if (/адрес|доставк/.test(input)) { updateState(userId, { step: "address", data: { ...d, correction: true } }); return await polish("Новый адрес?"); }
      if (/оплат|карт|налич/.test(input)) { updateState(userId, { step: "payment", data: { ...d, correction: true } }); return await polish("Как изменить оплату?"); }
      if (/^\s*отмена\s*$/.test(input)) { clearState(userId); return "Отменил. «начать» для нового."; }
      return "Что правим: состав, адрес или оплата?";
    }

    return /спасибо|ок/.test(input) ? "Всегда рады! 🍕" : V.fallback;
  } catch (e) { console.error("❌", e.message); return "😕 Ошибка. «начать»"; }
}

module.exports = { processMessage };