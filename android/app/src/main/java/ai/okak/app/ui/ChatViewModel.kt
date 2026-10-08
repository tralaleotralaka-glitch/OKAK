package ai.okak.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import ai.okak.app.core.Brain
import ai.okak.app.core.ChatTurn
import ai.okak.app.core.GeminiClient
import ai.okak.app.core.KnowledgeBase
import ai.okak.app.core.Reply
import ai.okak.app.data.SecureStore
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class ChatMessage(
    val id: String = UUID.randomUUID().toString(),
    val text: String,
    val fromUser: Boolean,
    /** Подпись под ответом бота: источник и время. Пусто для пользователя. */
    val meta: String = "",
)

data class ChatUiState(
    val messages: List<ChatMessage> = emptyList(),
    val busy: Boolean = false,
    val aiEnabled: Boolean = false,
    val keyStoreAvailable: Boolean = true,
)

/** Состояние чата. Вся логика ответов — в core.Brain; здесь только UI-состояние и ключ. */
class ChatViewModel(application: Application) : AndroidViewModel(application) {

    private val store = SecureStore(application)
    private var brain: Brain? = null

    private val _state = MutableStateFlow(
        ChatUiState(
            messages = emptyList(),
            aiEnabled = store.hasApiKey(),
            keyStoreAvailable = store.isAvailable,
        ),
    )
    val state: StateFlow<ChatUiState> = _state.asStateFlow()

    private suspend fun brain(): Brain = brain ?: withContext(Dispatchers.IO) {
        Brain(KnowledgeBase.load(getApplication()))
    }.also { brain = it }

    fun send(raw: String) {
        val text = raw.trim()
        if (text.isEmpty() || _state.value.busy) return
        val history = _state.value.messages.map { ChatTurn(if (it.fromUser) "user" else "assistant", it.text) }
        append(ChatMessage(text = text, fromUser = true))
        _state.value = _state.value.copy(busy = true)

        viewModelScope.launch {
            val reply: Reply = try {
                val llm = store.getApiKey()?.let { GeminiClient(it) }
                brain().reply(text, history.takeLast(MAX_HISTORY), llm)
            } catch (e: Exception) {
                Reply(
                    "Произошла внутренняя ошибка. Попробуйте ещё раз.",
                    "error", "local",
                )
            }
            append(ChatMessage(text = reply.text, fromUser = false, meta = metaFor(reply)))
            _state.value = _state.value.copy(busy = false)
        }
    }

    fun saveApiKey(key: String): Boolean {
        val ok = store.saveApiKey(key)
        _state.value = _state.value.copy(aiEnabled = store.hasApiKey(), keyStoreAvailable = store.isAvailable)
        return ok
    }

    fun removeApiKey() {
        store.clearApiKey()
        _state.value = _state.value.copy(aiEnabled = false)
    }

    fun clearChat() {
        _state.value = _state.value.copy(messages = emptyList(), busy = false)
    }

    private fun append(message: ChatMessage) {
        _state.value = _state.value.copy(messages = _state.value.messages + message)
    }

    private fun metaFor(reply: Reply): String {
        val source = when (reply.source) {
            "llm" -> "Gemini"
            else -> "локально"
        }
        val time = if (reply.elapsedMs > 0) " · ${reply.elapsedMs} мс" else ""
        return "$source$time"
    }

    companion object {
        private const val MAX_HISTORY = 6
    }
}
