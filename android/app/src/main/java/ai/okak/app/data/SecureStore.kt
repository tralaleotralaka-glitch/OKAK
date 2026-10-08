package ai.okak.app.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Хранилище ключа Gemini. Значения шифруются через Android Keystore (EncryptedSharedPreferences).
 * Ключ не попадает в APK, в репозиторий и в логи.
 */
class SecureStore(context: Context) {

    private val prefs: SharedPreferences? = try {
        val masterKey = MasterKey.Builder(context.applicationContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context.applicationContext,
            FILE,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    } catch (e: Exception) {
        // Keystore недоступен (редкие прошивки): приложение работает в локальном режиме.
        null
    }

    /** true, если хранилище открылось и ключ можно сохранить. */
    val isAvailable: Boolean get() = prefs != null

    fun getApiKey(): String? = prefs?.getString(KEY_API, null)?.takeIf { it.isNotBlank() }

    fun hasApiKey(): Boolean = getApiKey() != null

    /** Сохраняет ключ. Возвращает false, если хранилище недоступно. */
    fun saveApiKey(key: String): Boolean {
        val p = prefs ?: return false
        val trimmed = key.trim()
        if (trimmed.isEmpty()) {
            p.edit().remove(KEY_API).apply()
        } else {
            p.edit().putString(KEY_API, trimmed).apply()
        }
        return true
    }

    fun clearApiKey() {
        prefs?.edit()?.remove(KEY_API)?.apply()
    }

    companion object {
        private const val FILE = "okak_secure_prefs"
        private const val KEY_API = "gemini_api_key"
    }
}
