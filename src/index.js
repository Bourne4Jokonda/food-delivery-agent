const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { searchChunks, extractEntities } = require("./search");
// const { gigachatStub } = require("./llm"); // Заглушка, пока не подключим реальный API

const rootDir = path.resolve(__dirname, "..");
const configPath = path.join(rootDir, "config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

async function runInteractive() {
  console.log('🤖 Агент доставки запущен. Введите запрос или "exit" для выхода.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(res => rl.question(q, res));
  
  let order = { items: [], payment: null, fulfillment: 'delivery', address: null, phone: null };

  while (true) {
    // Если заказ пустой, спрашиваем товар
    if (order.items.length === 0) { 
      const input = await ask('Вы> ');
      if (input.toLowerCase() === 'exit') break;
      
      const parsed = extractEntities(input);
      // Сохраняем распознанные данные
      Object.keys(parsed).forEach(k => { 
        if (parsed[k] !== null && (Array.isArray(parsed[k]) ? parsed[k].length > 0 : true)) {
          order[k] = parsed[k];
        }
      });
      continue; 
    }

    // 1. Доставка или самовывоз
    if (!order.fulfillment) { 
      const fmt = await ask('🚚 Доставка или самовывоз? ');
      order.fulfillment = fmt.toLowerCase().includes('самов') ? 'pickup' : 'delivery'; 
      continue; 
    }

    // 2. Адрес (только если доставка)
    if (order.fulfillment === 'delivery' && !order.address) { 
      order.address = await ask('📍 Адрес доставки: '); 
      continue; 
    }

    // 3. Оплата
    if (!order.payment) { 
      const pay = await ask('💳 Оплата: 1 (онлайн), 2 (наличные), 3 (картой при получении)? ');
      const p = pay.trim();
      if (p === '2') order.payment = 'cash';
      else if (p === '3') order.payment = 'card_cash';
      else order.payment = 'card_online'; // По умолчанию онлайн
      continue; 
    }

    // 4. Телефон (с проверкой длины!)
    if (!order.phone) { 
      const ph = await ask('📞 Ваш телефон (+7...): ');
      // Простая проверка: убираем всё кроме цифр, должно быть >= 10 цифр
      const digits = ph.replace(/\D/g, '');
      if (digits.length >= 10) {
        order.phone = ph.trim();
      } else {
        console.log(' Номер слишком короткий. Попробуйте снова.');
        continue;
      }
    }

    // === ФИНАЛЬНАЯ СВОДКА ===
    const paymentText = {
      'card_online': 'Онлайн',
      'cash': 'Наличные',
      'card_cash': 'Картой при получении'
    };

    console.log('\n📋 === СВОДКА ЗАКАЗА ===');
    console.log(`🍕 Товары: ${order.items.map(i => `${i.name} (x${i.qty})`).join(', ')}`);
    console.log(`🚚 Получение: ${order.fulfillment === 'delivery' ? `Доставка (${order.address})` : 'Самовывоз'}`);
    console.log(`💳 Оплата: ${paymentText[order.payment] || order.payment}`);
    console.log(`📞 Телефон: ${order.phone}`);
    console.log('========================\n');
    
    const confirm = await ask('✅ Подтвердить заказ? (да/нет) ');
    if (confirm.toLowerCase().startsWith('д')) {
      const payload = { 
        items: order.items,
        fulfillment: order.fulfillment,
        address: order.fulfillment === 'delivery' ? order.address : null,
        payment_method: order.payment,
        phone: order.phone,
        timestamp: new Date().toISOString() 
      };
      console.log('\n📤 [JSON для Игоря]:', JSON.stringify(payload, null, 2));
      console.log('✅ Заявка принята. Менеджер свяжется с вами.\n');
      
      // Полный сброс для нового заказа
      order = { items: [], payment: null, fulfillment: 'delivery', address: null, phone: null };
    } else {
      console.log('❌ Заказ отменён.\n');
      order = { items: [], payment: null, fulfillment: 'delivery', address: null, phone: null };
    }
  }
  rl.close();
  console.log(' Агент остановлен.');
}

runInteractive();