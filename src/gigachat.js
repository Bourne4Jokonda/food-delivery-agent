// src/gigachat.js — стабильные запросы к ИИ
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const crypto = require('crypto');

const CID = process.env.GIGACHAT_CLIENT_ID;
const CSECRET = process.env.GIGACHAT_CLIENT_SECRET;
let token = null, expires = 0;

async function getToken() {
  if (token && Date.now() < expires) return token;
  if (!CID || !CSECRET) return null;
  const auth = Buffer.from(`${CID}:${CSECRET}`).toString('base64');
  try {
    const res = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'RqUID': crypto.randomUUID(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'scope=GIGACHAT_API_B2B'
    });
    const d = await res.json();
    if (d.access_token) { token = d.access_token; expires = Date.now() + 25*60*1000; return token; }
  } catch { return null; }
  return null;
}

module.exports = {
  generateResponse: async (prompt, timeoutMs = 3000) => {
    const t = await getToken();
    if (!t) return null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` },
        body: JSON.stringify({ model: 'GigaChat', messages: [{ role: 'user', content: prompt }], temperature: 0.6 }),
        signal: ctrl.signal
      });
      clearTimeout(timer);
      const d = await res.json();
      return d.choices?.[0]?.message?.content?.trim();
    } catch { return null; }
  }
};