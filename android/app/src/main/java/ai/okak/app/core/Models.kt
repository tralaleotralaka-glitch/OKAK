package ai.okak.app.core

/** Одна реплика диалога для контекста AI-модели. */
data class ChatTurn(val role: String, val content: String)

/** Ответ бота. intent — тип ответа, source — local или llm. */
data class Reply(
    val text: String,
    val intent: String,
    val source: String,
    val elapsedMs: Long = 0L,
    /** Короткая пояснительная приписка под ответом, например причина сбоя Gemini. */
    val note: String = "",
)

/** Результат запроса к модели: либо текст, либо понятная причина сбоя. */
sealed class LlmResult {
    data class Ok(val text: String) : LlmResult()
    data class Failed(val reason: String) : LlmResult()
}
