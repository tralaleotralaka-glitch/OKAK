package ai.okak.app.core

import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Маршрутизатор ответов. Порядок: small talk → время → математика → столицы → база знаний → Gemini.
 * Локальные ответы занимают миллисекунды. Запрос к модели ограничен таймаутом,
 * поэтому весь ответ укладывается в бюджет BUDGET_MS (меньше 7 секунд).
 */
class Brain(private val knowledge: KnowledgeBase) {

    private val zone: ZoneId = ZoneId.of(TimeInfo.DEFAULT_ZONE)

    suspend fun reply(message: String, history: List<ChatTurn>, llm: GeminiClient?): Reply {
        val started = System.nanoTime()
        val msg = message.trim().take(MAX_MESSAGE)

        val local = withContext(Dispatchers.Default) { routeLocal(msg) }
        when (local.intent) {
            NEEDS_AI -> {
                // Уравнения и производные: без ключа — подсказка, с ключом — отправляем модели.
                if (llm == null) {
                    return Reply(AI_HINT, "fallback", "local", elapsedMs(started))
                }
            }
            NO_LOCAL_ANSWER -> Unit // локальных знаний не хватило: пробуем модель, если она есть
            else -> return local.withElapsed(started)
        }

        if (llm == null) {
            return Reply("$FALLBACK $KEY_HINT", "fallback", "local", elapsedMs(started))
        }
        val remaining = BUDGET_MS - elapsedMs(started)
        val timeout = minOf(LLM_TIMEOUT_MS, remaining - 200)
        if (timeout < 1000) {
            return Reply(FALLBACK, "fallback", "local", elapsedMs(started), note = "Gemini: нет времени на запрос")
        }
        return when (val result = llm.ask(msg, history, nowText(), timeout)) {
            is LlmResult.Ok -> Reply(result.text, "llm", "llm", elapsedMs(started))
            is LlmResult.Failed -> Reply(
                FALLBACK, "fallback", "local", elapsedMs(started),
                note = "Gemini: ${result.reason}",
            )
        }
    }

    private fun routeLocal(msg: String): Reply {
        val now = ZonedDateTime.now(zone)
        SmallTalk.answer(msg, now)?.let { return Reply(it, "smalltalk", "local") }
        if (msg.isBlank()) return Reply("Напишите вопрос — я постараюсь помочь.", "smalltalk", "local")

        TimeInfo.answer(msg, now)?.let { return Reply(it, "time", "local") }

        when (val outcome = MathSolver.answer(msg)) {
            is MathOutcome.Answer -> return Reply(outcome.text, "math", "local")
            is MathOutcome.NeedsAi -> return Reply("", NEEDS_AI, "local")
            MathOutcome.None -> Unit
        }

        Capitals.answer(msg)?.let { return Reply(it, "capital", "local") }
        knowledge.search(msg)?.let { return Reply(it.answer, "knowledge", "local") }
        return Reply("", NO_LOCAL_ANSWER, "local")
    }

    private fun Reply.withElapsed(started: Long): Reply = copy(elapsedMs = elapsedMs(started))

    private fun elapsedMs(started: Long): Long = (System.nanoTime() - started) / 1_000_000

    private fun nowText(): String =
        ZonedDateTime.now(zone).format(DateTimeFormatter.ofPattern("dd.MM.yyyy, HH:mm")) + " (${TimeInfo.DEFAULT_ZONE})"

    companion object {
        const val BUDGET_MS = 6000L
        const val LLM_TIMEOUT_MS = 5000L
        const val MAX_MESSAGE = 2000
        const val NEEDS_AI = "needs_ai"
        const val NO_LOCAL_ANSWER = "no_local_answer"
        const val AI_HINT =
            "Решение уравнений и производных доступно в AI-режиме. Добавьте ключ Gemini в настройках — и я решу это."
        const val FALLBACK =
            "Пока не знаю точного ответа на этот вопрос. Попробуйте переформулировать его или спросите о времени, " +
                "дате, математике, истории, науке или географии."
        const val KEY_HINT = "Для ответов на любые вопросы добавьте ключ Gemini в настройках."
    }
}
