function mapPaymentChoice(paymentChoice) {
  const normalized = (paymentChoice || "").trim().toLowerCase();

  if (["1", "онлайн", "картой"].includes(normalized)) {
    return { code: "card_online", label: "Онлайн-картой" };
  }

  if (["2", "наличными", "наличкой"].includes(normalized)) {
    return { code: "cash", label: "Наличными курьеру" };
  }

  if (["3", "сбп", "перевод"].includes(normalized)) {
    return { code: "card_cash", label: "Перевод СБП" };
  }

  return null;
}

function submitOrder(context, query, paymentChoice, orderDraft = {}) {
  const payment =
    mapPaymentChoice(paymentChoice) ||
    (orderDraft.payment_method
      ? { code: orderDraft.payment_method, label: orderDraft.payment_label || orderDraft.payment_method }
      : null);

  if (!payment) {
    return { error: "Выберите: 1 (онлайн), 2 (наличные), 3 (СБП)." };
  }

  const orderPayload = {
    items: orderDraft.items || [],
    fulfillment: orderDraft.fulfillment || "delivery",
    address: orderDraft.fulfillment === "pickup" ? "самовывоз" : (orderDraft.address || ""),
    payment_method: payment.code,
    phone: orderDraft.phone || "",
    timestamp: new Date().toISOString(),
    query,
    context: (context || []).map((item) => ({
      title: item.title,
      content: item.content,
      tags: item.tags,
      source: item.source
    }))
  };

  console.log("[Make webhook mock] payload:");
  console.log(JSON.stringify(orderPayload, null, 2));

  return `✅ Заказ принят. Оплата: ${payment.label}. Ожидайте подтверждение.`;
}

module.exports = {
  mapPaymentChoice,
  submitOrder
};
