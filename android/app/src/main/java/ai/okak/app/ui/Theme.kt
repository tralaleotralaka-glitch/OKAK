package ai.okak.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/** Тёмная схема с чёрным фоном. Светлая тема отключена: фон всегда чёрный. */
private val OkakDark = darkColorScheme(
    primary = Color(0xFF8C9EFF),
    onPrimary = Color(0xFF0A0F2E),
    primaryContainer = Color(0xFF1F2A66),
    onPrimaryContainer = Color(0xFFDDE3FF),
    secondary = Color(0xFF4DB6AC),
    onSecondary = Color.Black,
    background = Color.Black,
    onBackground = Color(0xFFF2F2F2),
    surface = Color(0xFF111111),
    onSurface = Color(0xFFF2F2F2),
    surfaceVariant = Color(0xFF1C1C1E),
    onSurfaceVariant = Color(0xFFA8A8B0),
    outline = Color(0xFF3A3A3E),
    error = Color(0xFFF2B8B5),
)

@Composable
fun OkakTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = OkakDark, content = content)
}
