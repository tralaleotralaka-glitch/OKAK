package ai.okak.app.core

/** Одна реплика диалога для контекста AI-модели. */
data class ChatTurn(val role: String, val content: String)

/** Ответ бота. intent — тип ответа, source — local или llm. */
data class Reply(
    val text: String,
    val intent: String,
    val source: String,
    val elapsedMs: Long = 0L,
)
