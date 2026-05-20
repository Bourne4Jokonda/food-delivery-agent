// test-gigachat.js — версия с отладкой заголовка
require('dotenv').config();
const crypto = require('crypto');

// ⚠️ Только для тестов!
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

let CLIENT_ID = (process.env.GIGACHAT_CLIENT_ID || '').trim();
let CLIENT_SECRET = (process.env.GIGACHAT_CLIENT_SECRET || '').trim();
const AUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';

console.log('🔑 CLIENT_ID:', CLIENT_ID ? 'указан' : '❌ ПУСТО');
console.log('🔑 CLIENT_SECRET:', CLIENT_SECRET ? 'указан' : '❌ ПУСТО');

// Показываем, как будет выглядеть заголовок (без самого секрета)
const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
console.log('🔐 Authorization (начало):', `Basic ${auth}`.slice(0, 50) + '...');

async function test() {
  try {
    console.log('\n📡 Отправляю запрос...');
    const res = await fetch(AUTH_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'RqUID': crypto.randomUUID(),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'scope=GIGACHAT_API_B2B'
    });
    
    console.log('📊 Статус:', res.status, res.statusText);
    const text = await res.text();
    console.log('📄 Ответ:', text);
    
    if (res.ok && text.includes('access_token')) {
      console.log('✅ УСПЕХ! Токен получен 🎉');
    }
  } catch (e) {
    console.error('❌ Ошибка:', e.message);
  }
}
test();