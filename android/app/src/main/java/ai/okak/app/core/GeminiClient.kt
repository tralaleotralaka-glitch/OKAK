package ai.okak.app.core

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI

/**
 * Клиент Gemini через OpenAI-совместимый эндпоинт Google.
 * Ключ передаётся в заголовке Authorization (HTTPS) и никогда не попадает в логи и ответы.
 */
class GeminiClient(private val apiKey: String, private val model: String = DEFAULT_MODEL) {

    /**
     * Возвращает текст ответа или причину сбоя (сеть, таймаут, HTTP-ошибка). Не бросает исключений.
     *
     * HttpURLConnection не прерывается корутинами, поэтому запрос идёт в отдельном потоке,
     * а ожидание ограничено withTimeoutOrNull: при истечении времени управление сразу
     * возвращается локальному движку. Поток завершится сам по connect/read-таймаутам.
     */
    suspend fun ask(
        question: String,
        history: List<ChatTurn>,
        nowText: String,
        timeoutMs: Long,
    ): LlmResult {
        val result = CompletableDeferred<LlmResult>()
        val worker = Thread {
            val outcome = try {
                LlmResult.Ok(call(question, history, nowText, timeoutMs.toInt()))
            } catch (e: GeminiException) {
                LlmResult.Failed(e.message ?: "ошибка")
            } catch (e: Exception) {
                LlmResult.Failed("сеть недоступна")
            }
            result.complete(outcome)
        }
        worker.isDaemon = true
        worker.start()
        return withTimeoutOrNull(timeoutMs) { result.await() }
            ?: LlmResult.Failed("таймаут ${timeoutMs / 1000} с")
    }

    private fun call(question: String, history: List<ChatTurn>, nowText: String, timeoutMs: Int): String {
        val messages = JSONArray()
        messages.put(JSONObject().put("role", "system").put("content", systemPrompt(nowText)))
        history.takeLast(6).forEach { turn ->
            if ((turn.role == "user" || turn.role == "assistant") && turn.content.isNotBlank()) {
                messages.put(JSONObject().put("role", turn.role).put("content", turn.content.take(1000)))
            }
        }
        messages.put(JSONObject().put("role", "user").put("content", question.take(2000)))

        val body = JSONObject()
            .put("model", model)
            .put("messages", messages)
            .put("max_tokens", 350)
            .put("temperature", 0.4)
            // Gemini 3.1 Flash-Lite: minimal — быстрый ответ, укладывается в лимит 5 с.
            .put("reasoning_effort", "minimal")

        val conn = URI.create(ENDPOINT).toURL().openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = timeoutMs
            conn.readTimeout = timeoutMs
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            conn.setRequestProperty("Authorization", "Bearer $apiKey")
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }

            val code = conn.responseCode
            if (code !in 200..299) {
                val detail = conn.errorStream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
                    ?.let { errorMessage(it) }
                throw GeminiException(listOfNotNull("HTTP $code", detail).joinToString(": "))
            }
            val text = conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            val content = JSONObject(text)
                .getJSONArray("choices").getJSONObject(0)
                .getJSONObject("message").getString("content")
                .trim()
            if (content.isEmpty()) throw GeminiException("пустой ответ")
            return content
        } finally {
            conn.disconnect()
        }
    }

    /** Достаёт сообщение об ошибке из тела ответа Google (без ключа и лишних деталей). */
    private fun errorMessage(body: String): String? = try {
        JSONObject(body).getJSONObject("error").getString("message")
            .replace(Regex("\\s+"), " ").take(120)
    } catch (e: Exception) {
        null
    }

    private fun systemPrompt(nowText: String): String =
        "Ты — OKAK, умный русскоязычный ассистент. Отвечай по-русски, точно и по делу. " +
            "Обычно достаточно 2–5 предложений; формулы пиши понятно. Уравнения и производные решай пошагово. " +
            "Если не уверен в факте — честно скажи об этом, не выдумывай. Текущая дата и время: $nowText."

    companion object {
        const val ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
        const val DEFAULT_MODEL = "gemini-3.1-flash-lite"
    }
}

/** Ошибка запроса к Gemini с понятной причиной для пользователя. */
class GeminiException(message: String) : Exception(message)
