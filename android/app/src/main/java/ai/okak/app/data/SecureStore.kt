package ai.okak.app.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Хранилище ключа Gemini. Значения шифруются через Android Keystore (EncryptedSharedPreferences).
 * Ключ не попадает в APK, в репозиторий и в логи.
 *
 * Если файл повреждён (например, после переустановки или смены ключа Keystore), он удаляется
 * и создаётся заново — пользователю нужно ввести ключ ещё раз. Причина сбоя доступна в [lastError].
 */
class SecureStore(context: Context) {

    private val app = context.applicationContext
    private val prefs: SharedPreferences?

    /** Текст последней ошибки хранилища для показа пользователю, либо null. */
    var lastError: String? = null
        private set

    init {
        prefs = openPrefs()
    }

    /** true, если хранилище открылось и ключ можно сохранить. */
    val isAvailable: Boolean get() = prefs != null

    fun getApiKey(): String? {
        val p = prefs ?: return null
        return try {
            p.getString(KEY_API, null)?.takeIf { it.isNotBlank() }
        } catch (e: Exception) {
            lastError = "Сохранённый ключ не читается. Введите его заново."
            null
        }
    }

    fun hasApiKey(): Boolean = getApiKey() != null

    /** Ключ для отображения: первые и последние 4 символа, остальное скрыто. */
    fun maskedKey(): String? = getApiKey()?.let { k ->
        if (k.length <= 8) "••••" else "${k.take(4)}••••${k.takeLast(4)}"
    }

    /** Сохраняет ключ синхронно. Возвращает текст ошибки или null при успехе. */
    fun saveApiKey(key: String): String? {
        val p = prefs ?: return lastError ?: "Хранилище ключей недоступно на этом устройстве."
        val trimmed = key.trim()
        if (trimmed.isEmpty()) return "Ключ пустой."
        return try {
            if (p.edit().putString(KEY_API, trimmed).commit()) {
                lastError = null
                null
            } else {
                "Не удалось записать ключ в хранилище."
            }
        } catch (e: Exception) {
            "Не удалось сохранить ключ: ${e.javaClass.simpleName}"
        }
    }

    fun clearApiKey() {
        try {
            prefs?.edit()?.remove(KEY_API)?.commit()
        } catch (e: Exception) {
            lastError = "Не удалось удалить ключ."
        }
    }

    private fun openPrefs(): SharedPreferences? = try {
        createPrefs()
    } catch (first: Exception) {
        try {
            app.deleteSharedPreferences(FILE)
            createPrefs()
        } catch (second: Exception) {
            lastError = "Хранилище ключей недоступно: ${second.javaClass.simpleName}"
            null
        }
    }

    private fun createPrefs(): SharedPreferences {
        val masterKey = MasterKey.Builder(app)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        return EncryptedSharedPreferences.create(
            app,
            FILE,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    companion object {
        private const val FILE = "okak_secure_prefs"
        private const val KEY_API = "gemini_api_key"
    }
}
