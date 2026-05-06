import sys
import os
import json
import re

# Добавляем папку src в путь импортов
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from llm import GigaChatAgent
from context import load_knowledge_base, find_relevant_context

# 🔥 Загружаем системный промпт из файла
config_dir = os.path.join(os.path.dirname(__file__), '..', 'config')
prompt_file = os.path.join(config_dir, 'system_prompt.txt')

with open(prompt_file, 'r', encoding='utf-8') as f:
    system_prompt = f.read()

def extract_json_from_text(text: str) -> dict | None:
    """Ищет первый валидный JSON-объект в тексте ответа"""
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            return None
    return None

def split_response(response: str):
    """Разделяет ответ на текст для клиента и JSON для системы"""
    match = re.search(r'\{.*\}', response, re.DOTALL)
    if match:
        json_str = match.group()
        text_part = response.replace(json_str, "").strip()
        return text_part, json_str
    return response, None

def main():
    print("🚀 Запуск AI-Агента доставки еды...")
    
    try:
        agent = GigaChatAgent()
        print("✅ GigaChat подключен!")
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        return

    print("📚 Загрузка базы знаний...")
    full_knowledge = load_knowledge_base()
    print(f"✅ Загружено {len(full_knowledge)} символов\n")

    dialogue_history = []
    order_saved = False  # Флаг защиты от повторного сохранения
    
    print("="*60)
    print("Напиши 'выход' для завершения, 'сброс' чтобы начать заново")
    print("="*60 + "\n")

    while True:
        try:
            user_input = input("👤 Вы: ").strip()
            
            if user_input.lower() in ['выход', 'exit', 'q']:
                print("👋 До встречи!")
                break
            
            if user_input.lower() == 'сброс':
                dialogue_history = []
                order_saved = False
                print("🔄 Диалог сброшен!\n")
                continue

            context = find_relevant_context(user_input, full_knowledge)
            print("🤖 Агент печатает...")
            
            response = agent.get_response(
                system_prompt=system_prompt,
                user_message=user_input,
                context=context,
                history=dialogue_history
            )

            # 🔥 Разделяем ответ на текст и JSON
            user_text, json_data = split_response(response)
            print(f"🤖 Агент: {user_text}\n")

            # 💾 Сохраняем историю
            dialogue_history.append(("user", user_input))
            dialogue_history.append(("assistant", response))

            # 🔍 Извлекаем JSON только если заказ ещё не сохранён
            if json_data and not order_saved:
                try:
                    order_dict = json.loads(json_data)
                    print("💾 ЗАКАЗ СОХРАНЁН В СИСТЕМУ:", json.dumps(order_dict, ensure_ascii=False, indent=2))
                    order_saved = True  # Блокируем повторное сохранение
                except json.JSONDecodeError:
                    pass

        except KeyboardInterrupt:
            print("\n👋 До встречи!")
            break
        except Exception as e:
            print(f"❌ Ошибка: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    main()