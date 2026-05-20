// src/search.js — надёжный парсинг с поддержкой "убрать"
module.exports = {
  extractEntities: (text) => {
    const lower = text.toLowerCase().replace(/[.,!?:;]/g, ' ');
    const e = { items: [], payment: null, fulfillment: 'delivery', address: null, phone: null };

    const products = [
      { keys: ['пепперони', 'пеперони', 'пипперон'], name: 'Пепперони' },
      { keys: ['маргарита', 'مارгарит'], name: 'Маргарита' },
      { keys: ['диабло'], name: 'Диабло' },
      { keys: ['карбонара', 'карбонар'], name: 'Карбонара' },
      { keys: ['классическая', 'классик'], name: 'Классическая' },
      { keys: ['кола', 'колы', 'кока-кола'], name: 'Кола' },
      { keys: ['сок', 'сока', 'соки'], name: 'Сок' }
    ];

    products.forEach(p => {
      let totalQty = 0;
      const aliases = p.keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      // Ищем: (число)? [пробел] (минус)? [название] [пробел] (число)?
      const regex = new RegExp(`(\\d+)?\\s*(-?)\\s*(?:${aliases})\\w*\\s*(\\d+)?`, 'gi');
      let match;
      
      while ((match = regex.exec(lower)) !== null) {
        if (!match[0].trim()) continue;
        let qty = (parseInt(match[1]) || parseInt(match[3])) || 1;
        if (match[2] === '-') qty = -qty;
        totalQty += qty;
      }
      if (totalQty !== 0) e.items.push({ name: p.name, qty: totalQty });
    });

    if (/онлайн|предоплат/.test(lower)) e.payment = 'card_online';
    else if (/наличн|налом|кеш/.test(lower)) e.payment = 'cash';
    else if (/при получени|картой курьер/.test(lower)) e.payment = 'card_cash';
    if (/самовывоз|забер[уёя]|\bсам\b/.test(lower)) e.fulfillment = 'pickup';
    return e;
  }
};