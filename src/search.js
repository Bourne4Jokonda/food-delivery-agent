// src/search.js — устойчивый парсинг с суммированием вхождений
module.exports = {
  extractEntities: (text) => {
    const lower = text.toLowerCase();
    const e = { items: [], payment: null, fulfillment: 'delivery', address: null, phone: null };

    // Ключевые слова с допуском на опечатки/окончания
    const products = [
      { keys: ['пепперони', 'пеперони', 'пипперон'], name: 'Пепперони' },
      { keys: ['маргарита', 'маргарит'], name: 'Маргарита' },
      { keys: ['диабло'], name: 'Диабло' },
      { keys: ['карбонара', 'карбонар'], name: 'Карбонара' },
      { keys: ['классическая', 'классик'], name: 'Классическая' },
      { keys: ['кола', 'колы', 'кока-кола'], name: 'Кола' },
      { keys: ['сок', 'сока', 'соки'], name: 'Сок' }
    ];

    products.forEach(p => {
      let totalQty = 0;
      p.keys.forEach(key => {
        // Паттерн: (число)? [пробелы] слово [возможное окончание] [пробелы] (число)?
        const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(\\d+)?\\s*${safeKey}\\w*\\s*(\\d+)?`, 'gi');
        let match;
        while ((match = regex.exec(lower)) !== null) {
          const q1 = match[1] ? parseInt(match[1]) : 0;
          const q2 = match[2] ? parseInt(match[2]) : 0;
          totalQty += q1 || q2 || 1;
        }
      });
      if (totalQty > 0) e.items.push({ name: p.name, qty: totalQty });
    });

    // Оплата и доставка
    if (/онлайн|предоплат/.test(lower)) e.payment = 'card_online';
    else if (/наличн|налом|кеш/.test(lower)) e.payment = 'cash';
    else if (/при получени|картой курьер/.test(lower)) e.payment = 'card_cash';
    if (/самовывоз|забер[уёя]|\bсам\b/.test(lower)) e.fulfillment = 'pickup';

    return e;
  }
};