require('dotenv').config();
const { VK } = require('vk-io');
const { processMessage } = require('./src/index');
const { generateResponse } = require('./src/gigachat');

const vk = new VK({ token: process.env.VK_TOKEN });
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

vk.updates.on('message_new', async (context) => {
  if (context.isOutbox) return;
  const userId = context.senderId;
  const text = context.text || '';

  try {
    await delay(1500);
    const coreResponse = await processMessage(userId, text);
    await delay(500);

    let finalReply = coreResponse?.toString()?.trim();
    if (!finalReply || finalReply.length < 2) finalReply = " Не могу ответить. Напишите «меню» или «начать».";

    if (finalReply.startsWith('{')) {
      try {
        const orderData = JSON.parse(finalReply);
        const prompt = `Заказ оформлен. Данные: ${JSON.stringify(orderData, null, 2)}. 
        Напиши короткое подтверждение (2 предложения). Упомяни состав, тип получения и адрес. Без эмодзи-спама.`;
        
        let friendlyReply = await generateResponse(prompt, 3000);
        if (!friendlyReply || friendlyReply.length < 10) {
          const items = orderData.items?.map(i => `${i.name}×${i.qty}`).join(', ') || 'товары';
          const type = orderData.fulfillment === 'delivery' ? 'Доставим' : 'Ждём вас';
          const addr = orderData.address || 'по указанному адресу';
          friendlyReply = `✅ Заказ принят! Готовим ${items}. ${type} на ${addr}. Приятного аппетита!`;
        }
        await context.send(friendlyReply);
        console.log(`✅ Заказ от ID:${userId} оформлен`);
      } catch {
        await context.send("✅ Заказ принят! Скоро свяжемся.");
      }
    } else {
      await context.send(finalReply);
    }
  } catch (error) {
    console.error('❌ Ошибка в боте:', error.message);
    await context.send('😕 Что-то пошло не так. Напишите «начать», чтобы попробовать снова.');
  }
});

vk.updates.start().then(() => console.log('🤖 Бот ВКонтакте запущен! Жду сообщений...')).catch(console.error);