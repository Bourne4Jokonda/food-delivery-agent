import os
from dotenv import load_dotenv
from gigachat import GigaChat
from gigachat.models import Chat, Messages

# Загружаем ключи из .env
load_dotenv()

class GigaChatAgent:
    def __init__(self):
        self.credentials = os.getenv("GIGACHAT_AUTH_KEY")
        self.model = os.getenv("GIGACHAT_MODEL", "GigaChat:latest")

        if not self.credentials:
            raise ValueError("❌ Не найден GIGACHAT_AUTH_KEY в файле .env")

        self.client = GigaChat(
            credentials=self.credentials,
            model=self.model,
            verify_ssl_certs=False
        )

    def get_response(self, system_prompt: str, user_message: str, context: str = "", history: list = None) -> str:
        """
        Отправляет запрос в GigaChat с историей диалога
        history: список кортежей [(role, message), ...]
        """
        try:
            full_prompt = f"""
            {system_prompt}
            
            База знаний:
            {context}
            """

            # Формируем сообщения с историей
            messages = [
                {"role": "system", "content": full_prompt}
            ]
            
            # Добавляем историю диалога
            if history:
                for role, msg in history[-6:]:  # Берём последние 6 сообщений, чтобы не перегружать
                    messages.append({"role": role, "content": msg})
            
            # Текущее сообщение пользователя
            messages.append({"role": "user", "content": user_message})

            # Создаём объект Chat для отправки
            chat_request = Chat(
                messages=[Messages(role=m["role"], content=m["content"]) for m in messages],
                model=self.model
            )

            response = self.client.chat(chat_request)
            return response.choices[0].message.content

        except Exception as e:
            print(f"❌ Ошибка GigaChat: {e}")
            return "Извините, сейчас я не могу ответить. Попробуйте позже."