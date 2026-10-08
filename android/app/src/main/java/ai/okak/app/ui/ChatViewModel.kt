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
    /** Подпись под ответом бота: источник, время и причина сбоя Gemini (если была). */
    val meta: String = "",
)

data class ChatUiState(
    val messages: List<ChatMessage> = emptyList(),
    val busy: Boolean = false,
    /** true, если ключ сохранён и читается. */
    val aiEnabled: Boolean = false,
    /** Ключ в замаскованном виде, например «AIza••••wxyz». */
    val keyMask: String? = null,
    /** Ошибка хранилища ключей для показа в настройках. */
    val storeError: String? = null,
)

/** Состояние чата. Вся логика ответов — в core.Brain; здесь только UI-состояние и ключ. */
class ChatViewModel(application: Application) : AndroidViewModel(application) {

    private val store = SecureStore(application)
    private var brain: Brain? = null

    private val _state = MutableStateFlow(keyState(ChatUiState()))
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
                Reply("Произошла внутренняя ошибка. Попробуйте ещё раз.", "error", "local")
            }
            append(ChatMessage(text = reply.text, fromUser = false, meta = metaFor(reply)))
            _state.value = keyState(_state.value).copy(busy = false)
        }
    }

    /** Сохраняет ключ. Возвращает текст ошибки или null при успехе. */
    fun saveApiKey(key: String): String? {
        val error = store.saveApiKey(key)
        _state.value = keyState(_state.value)
        return error ?: if (store.hasApiKey()) null else "Ключ не удалось прочитать после сохранения."
    }

    fun removeApiKey() {
        store.clearApiKey()
        _state.value = keyState(_state.value)
    }

    fun clearChat() {
        _state.value = _state.value.copy(messages = emptyList(), busy = false)
    }

    private fun keyState(base: ChatUiState): ChatUiState {
        val key = store.getApiKey()
        return base.copy(
            aiEnabled = key != null,
            keyMask = store.maskedKey(),
            storeError = store.lastError,
        )
    }

    private fun append(message: ChatMessage) {
        _state.value = _state.value.copy(messages = _state.value.messages + message)
    }

    private fun metaFor(reply: Reply): String {
        val source = if (reply.source == "llm") "Gemini 3.1 Flash-Lite" else "локально"
        val time = if (reply.elapsedMs > 0) " · ${reply.elapsedMs} мс" else ""
        val note = if (reply.note.isNotEmpty()) " · ${reply.note}" else ""
        return "$source$time$note"
    }

    companion object {
        private const val MAX_HISTORY = 6
    }
}
