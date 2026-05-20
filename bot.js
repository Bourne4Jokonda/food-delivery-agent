// bot.js — стабильный запуск + FAQ + защита от дублей
require('dotenv').config();
const { VK } = require('vk-io');
const { processMessage } = require('./src/index');
const { generateResponse } = require('./src/gigachat');
const fs = require('fs');
const path = require('path');

// 📖 Читаем бизнес-настройки из config (НЕ из .env!)
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const DELIVERY = config.delivery_settings || { price: 200, free_threshold: 1000 };

const vk = new VK({
  token: process.env.VK_TOKEN,
  ignoreOutbox: true,
  pollingGroupId: process.env.VK_GROUP_ID ? Number(process.env.VK_GROUP_ID) : undefined,
  pollingInterval: 5000
});

const seenMessages = new Map();
const MAX_AGE = 30000;
setInterval(() => {
  const now = Date.now();
  for (const [id, time] of seenMessages.entries()) if (now - time > MAX_AGE) seenMessages.delete(id);
}, 60000);

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 📚 FAQ: отвечает на вопросы о доставке в любой момент
const faqPatterns = [
  { regex: /доставк.*платн|сколько.*доставк|цена.*доставк/i, answer: `Доставка — ${DELIVERY.price}₽. Бесплатно от ${DELIVERY.free_threshold}₽.` },
  { regex: /адрес.*доставк|куда.*доставл|зоны.*доставк/i, answer: `Доставляем по городу. Точные зоны уточняйте у оператора.` },
  { regex: /время.*доставк|как.*долго|быстро.*доставк/i, answer: `Обычно 30–60 мин. Время подтвердим после оформления.` },
  { regex: /оплат.*доставк|доставк.*оплат/i, answer: `Оплата доставки включается в общий чек: онлайн, картой или наличными.` }
];

vk.updates.on('message_new', async (context) => {
  if (context.isOutbox) return;
  const msgId = context.id || context.payload?.message_id;
  if (!msgId) return;
  if (seenMessages.has(msgId)) return;
  seenMessages.set(msgId, Date.now());

  const userId = context.senderId;
  const text = context.text || '';

  try {
    // 1️⃣ Проверяем FAQ (работает даже после завершения заказа)
    for (const { regex, answer } of faqPatterns) {
      if (regex.test(text)) {
        await delay(1000);
        await context.send(answer);
        return;
      }
    }

    // 2️⃣ Основной поток бота
    await delay(1500); // ⏱️ Пауза 1.5 сек перед ответом
    const coreResponse = await processMessage(userId, text);
    let finalReply = coreResponse?.toString()?.trim();
    if (!finalReply || finalReply.length < 2) finalReply = "😕 Не могу ответить. Напишите «меню» или «начать».";

    if (finalReply.startsWith('{')) {
      try {
        const orderData = JSON.parse(finalReply);
        const prompt = `Заказ оформлен. Данные: ${JSON.stringify(orderData, null, 2)}. Короткое подтверждение (2 предложения).`;
        let friendlyReply = await generateResponse(prompt, 3000);
        if (!friendlyReply || friendlyReply.length < 10) {
          const items = orderData.items?.map(i => `${i.name}×${i.qty}`).join(', ') || 'товары';
          friendlyReply = `✅ Заказ принят! Готовим ${items}. Скоро свяжемся.`;
        }
        await context.send(friendlyReply);
        console.log(`✅ Заказ оформлен (User: ${userId})`);
      } catch {
        await context.send("✅ Заказ принят! Скоро свяжемся.");
      }
    } else {
      await context.send(finalReply);
    }
  } catch (error) {
    console.error('❌ Bot error:', error.message);
    await context.send('😕 Ошибка. Напишите «начать».');
  }
});

// 🚀 Гарантированный запуск с удержанием процесса
vk.updates.start()
  .then(() => {
    console.log('🤖 Бот ВКонтакте запущен! Жду сообщений...');
    process.stdin.resume(); // 🔑 Держит процесс活ым
  })
  .catch(err => {
    console.error('❌ Ошибка запуска:', err.message);
    console.log('💡 Проверь токен в .env и включён ли Long Poll в настройках группы.');
  });

process.on('SIGINT', () => { console.log('\n👋 Остановлен.'); process.exit(0); });