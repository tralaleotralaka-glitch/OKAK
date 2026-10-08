package ai.okak.app.core

import java.math.BigDecimal
import java.math.MathContext

/** Утилиты для нормализации русского текста и форматирования чисел. */
object TextUtil {
    private val TOKEN_RE = Regex("[a-zа-я0-9]+")
    private val SPACES_RE = Regex("\\s+")

    fun normalize(text: String): String =
        text.trim().lowercase().replace('ё', 'е').replace(SPACES_RE, " ")

    fun tokens(text: String): List<String> =
        TOKEN_RE.findAll(normalize(text)).map { it.value }.toList()

    /**
     * Короткие основы (до 3 символов) требуют точного совпадения: «пи» не находит «писать».
     * Длинные совпадают по префиксу: «столиц» → «столицы», «столице».
     */
    fun stemMatches(stem: String, token: String): Boolean =
        if (stem.length <= 3) token == stem else token.startsWith(stem)

    /** Число для ответа: без хвостов, с пробелами в тысячах и запятой как разделителем. */
    fun formatNumber(value: Double): String {
        if (value.isNaN() || value.isInfinite()) return value.toString()
        if (value == Math.floor(value) && Math.abs(value) < 1e15) {
            return groupThousands(value.toLong().toString())
        }
        val plain = BigDecimal(value).round(MathContext(10)).stripTrailingZeros().toPlainString()
        val negative = plain.startsWith("-")
        val body = if (negative) plain.substring(1) else plain
        val intPart = body.substringBefore('.')
        val frac = if (body.contains('.')) body.substringAfter('.') else ""
        val result = groupThousands(intPart) + if (frac.isNotEmpty()) ",$frac" else ""
        return if (negative) "-$result" else result
    }

    private fun groupThousands(digits: String): String {
        val negative = digits.startsWith("-")
        val d = if (negative) digits.substring(1) else digits
        val sb = StringBuilder()
        d.reversed().forEachIndexed { i, c ->
            if (i > 0 && i % 3 == 0) sb.append(' ')
            sb.append(c)
        }
        val grouped = sb.reverse().toString()
        return if (negative) "-$grouped" else grouped
    }
}
