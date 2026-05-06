async function gigachatStub({ query, contextDocs }) {
  const context = contextDocs
    .map((doc, i) => `${i + 1}. ${doc.title} (${doc.tags.join(", ")})`)
    .join("\n");

  // TODO: Здесь заменить заглушку на реальный вызов GigaChat API через fetch:
  // 1) сформировать prompt из query + contextDocs,
  // 2) отправить POST-запрос к endpoint GigaChat,
  // 3) обработать JSON-ответ и вернуть текст модели.
  // Примерно тут должен быть: const response = await fetch("https://.../chat/completions", { ... });

  return [
    "[GigaChat Stub] Ответ сформирован локально.",
    `Запрос: ${query}`,
    "Найденный контекст:",
    context || "Контекст не найден."
  ].join("\n");
}

module.exports = {
  gigachatStub
};
