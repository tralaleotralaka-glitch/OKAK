package ai.okak.app.core

import java.time.ZonedDateTime

/** Small talk: приветствия, благодарности, «кто ты», помощь и шутки. */
object SmallTalk {
    const val HELP_TEXT =
        "Я OKAK — умный русскоязычный ассистент. Вот что я умею:\n" +
            "• Время и дата: «который час», «какое сегодня число», «сколько времени в Токио»\n" +
            "• Дни до события: «сколько дней до нового года», «сколько дней до 8 марта»\n" +
            "• Математика: «2+2*3», «корень из 144», «15% от 480», «2 в степени 10»\n" +
            "• Уравнения и производные: «реши x^2 - 5x + 6 = 0», «производная от x^3» (в AI-режиме)\n" +
            "• Знания: история, литература, наука, география, столицы стран\n" +
            "• Шутки: «расскажи анекдот»"

    private val JOKES = listOf(
        "Почему программисты путают Хэллоуин и Рождество? Потому что Oct 31 == Dec 25.",
        "— Сколько будет 2 + 2? — Зависит от того, в какой системе счисления ты спрашиваешь.",
        "Как называется игрок, который не умеет считать? Нулевой.",
        "Что сказал ноль восьмёрке? «Классный ремень!»",
        "Заходит математик в бар. Бармен спрашивает: «Что будете?» — «Ничего, я уже на пределе».",
        "Почему компьютер простудился? Потому что сидел рядом с открытым окном… и Windows.",
    )

    private val GREET_WORDS = setOf(
        "привет", "здравствуй", "здравствуйте", "хай", "хеллоу", "hello", "hi", "приветик", "добрый", "доброе",
    )
    private val BYE_WORDS = setOf("пока", "бай", "прощай", "увидимся")
    private val WHO_PHRASES = listOf(
        "кто ты", "ты кто", "как тебя зовут", "как тебя называть", "твое имя", "как ты называешься", "who are you",
    )
    private val HELP_PHRASES = listOf(
        "что ты умеешь", "что умеешь", "что ты можешь", "что можешь", "помощь", "help",
        "команды", "возможности", "что ты знаешь",
    )
    private val HOW_PHRASES = listOf("как дела", "как ты", "как жизнь", "как поживаешь", "как настроение")
    private val JOKE_STEMS = listOf("шутк", "анекдот", "смешн", "рассмеш", "пошути")
    private val THANKS_STEMS = listOf("спасибо", "благодарю", "thanks")

    fun answer(message: String, now: ZonedDateTime): String? {
        val text = TextUtil.normalize(message).trim(' ', '!', '?', '.', ',')
        if (text.isEmpty()) {
            return "Напишите вопрос — я постараюсь помочь. Например: «который час» или «корень из 81»."
        }
        val first = text.split(' ').first()
        if (first in GREET_WORDS) return "${greeting(now)}! Чем могу помочь? 🙂"
        if (THANKS_STEMS.any { text.contains(it) }) {
            return listOf("Пожалуйста! Обращайтесь ещё 🙂", "Рад помочь!", "Всегда пожалуйста.").random()
        }
        if (first in BYE_WORDS || text.startsWith("до свидания") || text.startsWith("до встречи") ||
            text.startsWith("спокойной ночи")
        ) {
            return "До встречи! Возвращайтесь с новыми вопросами. 👋"
        }
        if (WHO_PHRASES.any { text.contains(it) }) {
            return "Меня зовут OKAK. Я отвечаю на вопросы по-русски: знаю время и дату, считаю математику, " +
                "решаю уравнения и рассказываю о многих областях знаний."
        }
        if (HELP_PHRASES.any { text.contains(it) }) return HELP_TEXT
        if (HOW_PHRASES.any { text.contains(it) }) {
            return listOf(
                "Отлично, спасибо! Готов к вопросам. А у вас как?",
                "Всё хорошо, работаю в полную мощность. Чем займёмся?",
            ).random()
        }
        if (JOKE_STEMS.any { text.contains(it) }) return JOKES.random()
        return null
    }

    private fun greeting(now: ZonedDateTime): String = when (now.hour) {
        in 5..11 -> "Доброе утро"
        in 12..17 -> "Добрый день"
        in 18..22 -> "Добрый вечер"
        else -> "Доброй ночи"
    }
}
