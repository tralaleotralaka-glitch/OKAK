package ai.okak.app.core

import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.acos
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.log10
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan

/** Результат математического модуля. */
sealed class MathOutcome {
    data class Answer(val text: String) : MathOutcome()

    /** Уравнения, производные и интегралы: без символьного движка их решает AI-модель. */
    object NeedsAi : MathOutcome()

    object None : MathOutcome()
}

/**
 * Математика без внешних библиотек.
 *
 * Выражения разбираются собственным парсером (рекурсивный спуск), функции и константы
 * берутся из белого списка — произвольный код не выполняется.
 */
object MathSolver {
    private const val MAX_INPUT = 300

    private val PERCENT_RE = Regex("(\\d+(?:[.,]\\d+)?)\\s*(?:%|процент[а-я]*)\\s*от\\s*(\\d+(?:[.,]\\d+)?)")
    private val COMMAND_RE = Regex(
        "сколько будет|сколько равно|чему равн[а-я]*|чему равен|посчита[а-я]*|вычисл[а-я]*|" +
            "реши[а-я]*|найди[а-я]*|помоги[а-я]*|подскажи|пожалуйста|скажи|равно|равняется|ответ|по-твоему"
    )
    private val TRIGGER_RE = Regex(
        "сколько будет|сколько равно|чему равн|посчита|вычисл|реши|уравнени|производн|интеграл|" +
            "корен|квадратн|факториал|процент|степен|умнож|делит|плюс|минус|синус|косинус|тангенс|" +
            "логарифм|модул|упрости|разложи|раскрой|sqrt|cbrt|factorial|\\bsin|\\bcos|\\btan|\\blog|" +
            "\\bln\\b|\\blg\\b|\\bpi\\b|="
    )
    private val SYMBOLIC_RE = Regex("производн|интеграл|упрости|разложи|раскрой скобки")
    private val PURE_MATH_RE = Regex("^[\\d\\s+\\-*/^().,%=×÷x!]+$")
    private val CHUNK_RE = Regex("[a-z0-9.()\\s+\\-*/^%,!=]*\\d[a-z0-9.()\\s+\\-*/^%,!=]*")
    private val MATH_CHUNK_RE = Regex("[+\\-*/^(]|sqrt|cbrt|sin|cos|tan|log|ln|lg|factorial|pi|=")
    private val FUNCTION_NAMES_RE = Regex("sqrt|cbrt|sin|cos|tan|asin|acos|atan|exp|ln|lg|log|abs|factorial|round|pi")
    private val LATIN_LETTER_RE = Regex("[a-z]")
    private val DIGITS_RE = Regex("\\d")

    /** Замены русских слов на математическую запись. Порядок важен. */
    private val WORD_REPLACEMENTS: List<Pair<Regex, String>> = listOf(
        Regex("кубическ[а-я]*\\s+корен[а-я]*\\s+из\\s*\\(([^()]*)\\)") to "cbrt($1)",
        Regex("кубическ[а-я]*\\s+корен[а-я]*\\s+из\\s*(-?\\d+(?:[.,]\\d+)?)") to "cbrt($1)",
        Regex("(?:квадратн[а-я]*\\s+)?корен[а-я]*\\s+из\\s*\\(([^()]*)\\)") to "sqrt($1)",
        Regex("(?:квадратн[а-я]*\\s+)?корен[а-я]*\\s+из\\s*(-?\\d+(?:[.,]\\d+)?)") to "sqrt($1)",
        Regex("натуральн[а-я]*\\s+логарифм[а-я]*\\s*(?:от\\s*)?") to "ln",
        Regex("логарифм[а-я]*\\s*(?:от\\s*)?") to "log",
        Regex("факториал[а-я]*\\s*(?:от\\s*)?(\\d+)") to "factorial($1)",
        Regex("(\\d+)\\s*!") to "factorial($1)",
        Regex("косинус[а-я]*\\s*") to "cos",
        Regex("синус[а-я]*\\s*") to "sin",
        Regex("тангенс[а-я]*\\s*") to "tan",
        Regex("модул[а-я]*\\s*") to "abs",
        Regex("число пи|(?<![а-я])пи(?![а-я])") to "pi",
        Regex("в квадрате") to "^2",
        Regex("в кубе") to "^3",
        Regex("(?:возвести в |в )?степен[а-я]*") to "^",
        Regex("(?:по)?умнож[а-я]*(?:\\s+на)?") to "*",
        Regex("(?:раз|по)?делит[а-я]*(?:\\s+на)?") to "/",
        Regex("(?<![а-я])плюс(?![а-я])|прибав[а-я]*(?:\\s+на)?") to "+",
        Regex("(?<![а-я])минус(?![а-я])|отним[а-я]*(?:\\s+на)?|вычест[а-я]*(?:\\s+на)?") to "-",
        Regex("[×хx](?=\\s*\\d)|(?<=\\d\\s)[×хx](?=\\s*[\\d(])") to "*",
        Regex("[×⋅·]") to "*",
        Regex("÷") to "/",
        Regex("[–—]") to "-",
    )

    /** Точка входа: возвращает ответ, признак «нужен AI» или None, если это не математика. */
    fun answer(message: String): MathOutcome {
        val raw = TextUtil.normalize(message)
        if (raw.length > MAX_INPUT) return MathOutcome.None

        PERCENT_RE.find(raw)?.let { m ->
            val a = m.groupValues[1].replace(',', '.').toDouble()
            val b = m.groupValues[2].replace(',', '.').toDouble()
            val result = TextUtil.formatNumber(a * b / 100)
            return MathOutcome.Answer("${TextUtil.formatNumber(a)}% от ${TextUtil.formatNumber(b)} = $result")
        }

        val text = preprocess(raw)
        val triggered = TRIGGER_RE.containsMatchIn(raw) || TRIGGER_RE.containsMatchIn(text)
        val pure = PURE_MATH_RE.matches(text) && DIGITS_RE.containsMatchIn(text) &&
            text.any { it in "+-*/^" }
        if (!triggered && !pure) return MathOutcome.None

        // Символьные задачи: нужна формула, а не обычные слова («что такое интеграл»).
        if (SYMBOLIC_RE.containsMatchIn(raw)) {
            return if (looksLikeFormula(stripCommands(text))) MathOutcome.NeedsAi else MathOutcome.None
        }

        val chunk = bestChunk(text) ?: return MathOutcome.None
        if (chunk.contains('=') && hasVariable(chunk)) return MathOutcome.NeedsAi

        val expr = chunk.substringBefore('=').trim()
        if (expr.isEmpty() || !DIGITS_RE.containsMatchIn(expr)) return MathOutcome.None

        return try {
            val value = evaluate(expr)
            val note = if (Regex("sin|cos|tan").containsMatchIn(expr)) {
                " (аргументы тригонометрических функций — в радианах)"
            } else {
                ""
            }
            MathOutcome.Answer("${prettyExpr(expr)} = ${TextUtil.formatNumber(value)}$note")
        } catch (e: MathError) {
            if (triggered || pure) MathOutcome.Answer(e.message ?: "Ошибка вычисления.") else MathOutcome.None
        }
    }

    /** Вычисляет числовое выражение. Бросает MathError с понятным сообщением. */
    fun evaluate(expr: String): Double {
        if (expr.length > MAX_INPUT) throw MathError("Выражение слишком длинное.")
        return ExprParser(expr).parseAll()
    }

    private fun preprocess(raw: String): String {
        var text = raw.replace(Regex("(\\d),(\\d)"), "$1.$2")
        for ((pattern, replacement) in WORD_REPLACEMENTS) {
            text = pattern.replace(text, replacement)
        }
        text = COMMAND_RE.replace(text, " ")
        text = text.replace("?", " ")
        return text.replace(SPACES_RE, " ").trim()
    }

    private val SPACES_RE = Regex("\\s+")

    private fun stripCommands(text: String): String =
        text.replace(Regex("производн[а-я]*|интеграл[а-я]*|упрости|разложи[а-я]*|от(?=\\s|$)|по x|\\bdx\\b"), " ")
            .replace(SPACES_RE, " ").trim(' ', ':', ',', '.')

    private fun looksLikeFormula(body: String): Boolean =
        body.isNotEmpty() && Regex("[a-z0-9]").containsMatchIn(body) && !Regex("[а-я]").containsMatchIn(body)

    private fun hasVariable(chunk: String): Boolean =
        LATIN_LETTER_RE.containsMatchIn(FUNCTION_NAMES_RE.replace(chunk, ""))

    private fun bestChunk(text: String): String? {
        val chunks = CHUNK_RE.findAll(text)
            .map { it.value.trim().trimEnd('=').trim() }
            .filter { it.isNotEmpty() && (MATH_CHUNK_RE.containsMatchIn(it) || it.all { c -> c.isDigit() }) }
            .toList()
        return chunks.maxByOrNull { it.length }
    }

    private fun prettyExpr(expr: String): String {
        var out = expr.replace("**", "^").replace("*", "·").replace("pi", "π")
        out = Regex("sqrt\\((-?[\\d.]+)\\)").replace(out, "√$1")
        out = Regex("cbrt\\((-?[\\d.]+)\\)").replace(out, "∛$1")
        out = Regex("\\s*\\^\\s*").replace(out, "^")
        out = out.replace(SPACES_RE, " ").trim()
        return out.replace(Regex("(?<=\\S) - (?=\\S)"), " − ")
    }
}

class MathError(message: String) : Exception(message)

private const val MAX_EXPONENT = 2000.0

/**
 * Безопасный парсер выражений: числа, + - * / ^, скобки, неявное умножение (2(3+4), 2pi),
 * функции и константы из белого списка. Всё остальное — ошибка.
 */
private class ExprParser(private val s: String) {
    private var pos = 0

    fun parseAll(): Double {
        val v = parseExpr()
        skipWs()
        if (pos < s.length) throw MathError("Не удалось разобрать выражение.")
        return v
    }

    private fun skipWs() {
        while (pos < s.length && s[pos].isWhitespace()) pos++
    }

    private fun peek(): Char {
        skipWs()
        return if (pos < s.length) s[pos] else '\u0000'
    }

    private fun parseExpr(): Double {
        var v = parseTerm()
        while (true) {
            when (peek()) {
                '+' -> { pos++; v += parseTerm() }
                '-' -> { pos++; v -= parseTerm() }
                else -> return v
            }
        }
    }

    private fun parseTerm(): Double {
        var v = parseUnary()
        while (true) {
            val c = peek()
            when {
                c == '*' -> { pos++; v *= parseUnary() }
                c == '/' -> {
                    pos++
                    val d = parseUnary()
                    if (d == 0.0) throw MathError("На ноль делить нельзя.")
                    v /= d
                }
                c == '(' || c == '.' || c.isLetterOrDigit() -> v *= parseUnary()
                else -> return v
            }
        }
    }

    private fun parseUnary(): Double = when (peek()) {
        '-' -> { pos++; -parseUnary() }
        '+' -> { pos++; parseUnary() }
        else -> parsePower()
    }

    private fun parsePower(): Double {
        val base = parsePrimary()
        if (peek() == '^') {
            pos++
            val exp = parseUnary()
            return power(base, exp)
        }
        return base
    }

    private fun power(base: Double, exp: Double): Double {
        if (abs(exp) > MAX_EXPONENT) throw MathError("Слишком большая степень.")
        if (base == 0.0 && exp < 0) throw MathError("На ноль делить нельзя.")
        val r = base.pow(exp)
        if (r.isNaN()) throw MathError("Результат не является действительным числом.")
        if (r.isInfinite()) throw MathError("Число получилось слишком большим.")
        return r
    }

    private fun parsePrimary(): Double {
        val c = peek()
        if (c == '(') {
            pos++
            val v = parseExpr()
            if (peek() != ')') throw MathError("Не хватает закрывающей скобки.")
            pos++
            return v
        }
        if (c.isDigit() || c == '.') return parseNumber()
        if (c.isLetter()) {
            val start = pos
            while (pos < s.length && (s[pos].isLetterOrDigit() || s[pos] == '_')) pos++
            val name = s.substring(start, pos).lowercase()
            if (peek() == '(') return callFunction(name, parseArgs())
            return when (name) {
                "pi" -> Math.PI
                "e" -> Math.E
                "x", "y", "z", "t" -> throw MathError("В выражении есть переменная — для такого нужно уравнение.")
                else -> throw MathError("Я не умею работать с этим словом в формуле.")
            }
        }
        throw MathError("Не удалось разобрать выражение.")
    }

    private fun parseNumber(): Double {
        val start = pos
        while (pos < s.length && (s[pos].isDigit() || s[pos] == '.')) pos++
        return s.substring(start, pos).toDoubleOrNull() ?: throw MathError("Не удалось разобрать число.")
    }

    private fun parseArgs(): List<Double> {
        pos++ // открывающая скобка
        val args = mutableListOf<Double>()
        if (peek() != ')') {
            args.add(parseExpr())
            while (peek() == ',') {
                pos++
                args.add(parseExpr())
            }
        }
        if (peek() != ')') throw MathError("Не хватает закрывающей скобки.")
        pos++
        return args
    }

    private fun callFunction(name: String, args: List<Double>): Double {
        fun one(): Double {
            if (args.size != 1) throw MathError("Неверное число аргументов у функции $name.")
            return args[0]
        }
        val r = when (name) {
            "sqrt" -> sqrt(one())
            "cbrt" -> Math.cbrt(one())
            "sin" -> sin(one())
            "cos" -> cos(one())
            "tan" -> tan(one())
            "asin" -> asin(one())
            "acos" -> acos(one())
            "atan" -> atan(one())
            "exp" -> exp(one())
            "ln" -> ln(one())
            "lg" -> log10(one())
            "log" -> if (args.size == 2) ln(args[0]) / ln(args[1]) else log10(one())
            "abs" -> abs(one())
            "factorial" -> factorial(one())
            else -> throw MathError("Я не умею работать с функцией $name.")
        }
        if (r.isNaN()) throw MathError("Значение вне области определения функции.")
        if (r.isInfinite()) throw MathError("Число получилось слишком большим.")
        return r
    }

    private fun factorial(n: Double): Double {
        if (n != floor(n) || n < 0 || n > 170) {
            throw MathError("Факториал определён для целых чисел от 0 до 170.")
        }
        var r = 1.0
        for (i in 2..n.toInt()) r *= i
        return r
    }
}
