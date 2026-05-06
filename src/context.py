import os
import glob

def load_knowledge_base(folder_path="knowledge_base"):
    """Загружает содержимое всех файлов из папки knowledge_base в одну строку"""
    context = ""
    
    # Ищем все .md файлы в папке
    files = glob.glob(os.path.join(folder_path, "*.md"))
    
    for file_path in files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                filename = os.path.basename(file_path)
                context += f"\n--- Файл: {filename} ---\n"
                context += f.read()
        except Exception as e:
            print(f"Ошибка чтения файла {file_path}: {e}")
            
    return context

def find_relevant_context(query: str, full_context: str) -> str:
    """
    Простой поиск: возвращает куски текста, где упоминаются ключевые слова из запроса.
    В будущем здесь можно будет использовать Fuse.js логику или векторный поиск.
    """
    # Разбиваем запрос на слова
    keywords = query.lower().split()
    
    # Если контекст слишком большой, можно возвращать только релевантные части.
    # Пока для простоты отдаем весь контекст, так как файлы маленькие.
    # Если файлов станет много, здесь добавим фильтрацию.
    
    return full_context