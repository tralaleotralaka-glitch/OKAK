package ai.okak.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
    primary = Color(0xFF3D5AFE),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDDE3FF),
    onPrimaryContainer = Color(0xFF001257),
    secondary = Color(0xFF00897B),
    background = Color(0xFFF4F6FF),
    onBackground = Color(0xFF191C2B),
    surface = Color.White,
    onSurface = Color(0xFF191C2B),
    surfaceVariant = Color(0xFFE6E9F8),
    onSurfaceVariant = Color(0xFF474B5E),
    error = Color(0xFFB3261E),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF8C9EFF),
    onPrimary = Color(0xFF001A80),
    primaryContainer = Color(0xFF243BBF),
    onPrimaryContainer = Color(0xFFDDE3FF),
    secondary = Color(0xFF4DB6AC),
    background = Color(0xFF0E1020),
    onBackground = Color(0xFFE3E6F5),
    surface = Color(0xFF171A2E),
    onSurface = Color(0xFFE3E6F5),
    surfaceVariant = Color(0xFF232743),
    onSurfaceVariant = Color(0xFFB9BDD6),
    error = Color(0xFFF2B8B5),
)

@Composable
fun OkakTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    MaterialTheme(
        colorScheme = if (dark) DarkColors else LightColors,
        content = content,
    )
}

/** Фоновый градиент экрана: мягкий переход от цвета primary к фону. */
fun backgroundBrush(dark: Boolean): Brush =
    if (dark) {
        Brush.verticalGradient(listOf(Color(0xFF1A1F3D), Color(0xFF0E1020)))
    } else {
        Brush.verticalGradient(listOf(Color(0xFFDDE3FF), Color(0xFFF4F6FF)))
    }
