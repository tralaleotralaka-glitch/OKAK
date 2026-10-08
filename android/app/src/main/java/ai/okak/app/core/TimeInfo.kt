package ai.okak.app.core

import java.time.DateTimeException
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

/** Время, дата, дни до события и дни недели на русском. Часовой пояс — Europe/Moscow. */
object TimeInfo {
    const val DEFAULT_ZONE = "Europe/Moscow"
    private val zone: ZoneId = ZoneId.of(DEFAULT_ZONE)

    private val WEEKDAYS = listOf("понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье")
    private val MONTHS_GEN = listOf(
        "января", "февраля", "марта", "апреля", "мая", "июня",
        "июля", "августа", "сентября", "октября", "ноября", "декабря",
    )
    private val MONTH_PREFIX = mapOf(
        "янв" to 1, "фев" to 2, "мар" to 3, "апр" to 4, "мая" to 5, "май" to 5, "июн" to 6,
        "июл" to 7, "авг" to 8, "сен" to 9, "окт" to 10, "ноя" to 11, "дек" to 12,
    )

    private class Holiday(val month: Int, val day: Int, val label: String)

    private val HOLIDAYS = linkedMapOf(
        "нового года" to Holiday(1, 1, "Нового года"),
        "новый год" to Holiday(1, 1, "Нового года"),
        "рождеств" to Holiday(1, 7, "Рождества"),
        "8 марта" to Holiday(3, 8, "8 марта"),
        "дня победы" to Holiday(5, 9, "Дня Победы"),
        "9 мая" to Holiday(5, 9, "9 мая"),
        "дня россии" to Holiday(6, 12, "Дня России"),
        "дня знаний" to Holiday(9, 1, "Дня знаний"),
        "хэллоуин" to Holiday(10, 31, "Хэллоуина"),
        "хеллоуин" to Holiday(10, 31, "Хэллоуина"),
    )

    private val TIME_RE = Regex(
        "который час|текущее время|время сейчас|точное время|" +
            "сколько (сейчас )?времени\\??$|какое (сейчас )?время\\??$|^время$"
    )
    private val DATE_RE = Regex(
        "какое (сегодня |сейчас )?число|какая (сегодня |сейчас )?дата|какой (сегодня |сейчас )?день\\??$|" +
            "что за день|сегодняшн[а-я]* (дата|число|день)|дата сегодня|число сегодня|сегодня (какое )?число|" +
            "какой день недели|текущая дата|сегодняшняя дата|какое сегодня|какое сейчас число|" +
            "(какой|какого) (сейчас |сегодня )?год( сейчас| сегодня| на дворе)?\\??$|текущий год"
    )
    private val CITY_TIME_RE = Regex("(?:время|час|сколько времени|который час)\\s+(?:в|во|на)\\s+([а-я\\- ]+)")
    private val DATE_IN_TEXT_RE = Regex("(\\d{1,2})\\s+(янв|фев|мар|апр|мая|май|июн|июл|авг|сен|окт|ноя|дек)[а-я]*(?:\\s+(\\d{4}))?")
    private val DOTTED_DATE_RE = Regex("(\\d{1,2})[./](\\d{1,2})[./](\\d{4})")
    private val DAYS_WORD_RE = Regex("сколько (дней|осталось)")
    private val UNTIL_YEAR_RE = Regex("(^|\\s)до(\\s|$).*\\d{4}")
    private val YEAR_ONLY_RE = Regex("год( сейчас| сегодня| на дворе)?\\??$")

    /** Возвращает ответ про время или дату либо null, если вопрос не про это. */
    fun answer(message: String, now: ZonedDateTime = ZonedDateTime.now(zone)): String? {
        val text = TextUtil.normalize(message).trimEnd('?', '!', '.', ' ')

        CITY_TIME_RE.find(text)?.let { m ->
            val city = findCity(m.groupValues[1])
            if (city != null) {
                val local = ZonedDateTime.now(ZoneId.of(city.zone))
                return "В ${city.label} сейчас ${fmtTime(local)}, ${weekday(local.toLocalDate()).lowercase()}, " +
                    "${fmtDate(local.toLocalDate())} (${tzLabel(local)})."
            }
        }

        if (DAYS_WORD_RE.containsMatchIn(text) || UNTIL_YEAR_RE.containsMatchIn(text)) {
            val today = now.toLocalDate()
            val target = parseDate(text, today)
            if (target != null) return daysUntilAnswer(target, text, today)
        }

        if (text.contains("день недели") || text.contains("какой день")) {
            parseDate(text, now.toLocalDate())?.let { target ->
                return "${capitalize(fmtDate(target))} — это ${WEEKDAYS[target.dayOfWeek.value - 1]}."
            }
        }

        if (TIME_RE.containsMatchIn(text)) {
            return "Сейчас ${fmtTime(now)} (${tzLabel(now)}, часовой пояс $DEFAULT_ZONE). " +
                "Сегодня ${weekday(now.toLocalDate()).lowercase()}, ${fmtDate(now.toLocalDate())}."
        }

        if (DATE_RE.containsMatchIn(text)) {
            val today = now.toLocalDate()
            if (YEAR_ONLY_RE.containsMatchIn(text) && !text.contains("число") && !text.contains("дата")) {
                return "Сейчас ${today.year} год."
            }
            return "Сегодня ${weekday(today).lowercase()}, ${fmtDate(today)}. " +
                "Сейчас ${fmtTime(now)} (${tzLabel(now)})."
        }
        return null
    }

    private fun parseDate(text: String, today: LocalDate): LocalDate? {
        DOTTED_DATE_RE.find(text)?.let { m ->
            return try {
                LocalDate.of(m.groupValues[3].toInt(), m.groupValues[2].toInt(), m.groupValues[1].toInt())
            } catch (e: DateTimeException) {
                null
            }
        }
        DATE_IN_TEXT_RE.find(text)?.let { m ->
            val month = MONTH_PREFIX[m.groupValues[2]] ?: return null
            val hasYear = m.groupValues[3].isNotEmpty()
            val year = if (hasYear) m.groupValues[3].toInt() else today.year
            return try {
                val candidate = LocalDate.of(year, month, m.groupValues[1].toInt())
                if (!hasYear && candidate.isBefore(today)) candidate.plusYears(1) else candidate
            } catch (e: DateTimeException) {
                null
            }
        }
        for ((key, holiday) in HOLIDAYS) {
            if (text.contains(key)) {
                val candidate = LocalDate.of(today.year, holiday.month, holiday.day)
                return if (candidate.isBefore(today)) candidate.plusYears(1) else candidate
            }
        }
        return null
    }

    private fun daysUntilAnswer(target: LocalDate, text: String, today: LocalDate): String {
        val delta = java.time.temporal.ChronoUnit.DAYS.between(today, target).toInt()
        val holidayLabel = HOLIDAYS.entries.firstOrNull { (key, h) ->
            h.month > 0 && text.contains(key) && key.none { it.isDigit() }
        }?.value?.label
        val label = if (holidayLabel != null) "$holidayLabel (${fmtDate(target)})" else fmtDate(target)
        return when {
            delta > 0 -> "До $label осталось $delta ${daysWord(delta)}."
            delta == 0 -> "Сегодня — $label! 🎉"
            else -> "${capitalize(label)} уже прошло ${-delta} ${daysWord(-delta)}."
        }
    }

    private fun findCity(text: String): CityRef? =
        GeneratedData.CITIES.firstOrNull { text.contains(it.stem) }?.let { CityRef(it.zone, it.label) }

    private class CityRef(val zone: String, val label: String)

    private fun fmtDate(d: LocalDate): String = "${d.dayOfMonth} ${MONTHS_GEN[d.monthValue - 1]} ${d.year} года"

    private fun fmtTime(dt: ZonedDateTime): String = dt.format(DateTimeFormatter.ofPattern("HH:mm:ss"))

    private fun weekday(d: LocalDate): String = WEEKDAYS[d.dayOfWeek.value - 1].replaceFirstChar { it.uppercase() }

    private fun tzLabel(dt: ZonedDateTime): String {
        val total = dt.offset.totalSeconds / 60
        val sign = if (total >= 0) "+" else "-"
        val h = Math.abs(total) / 60
        val m = Math.abs(total) % 60
        return "UTC$sign%02d:%02d".format(h, m)
    }

    private fun capitalize(s: String): String = s.replaceFirstChar { it.uppercase() }

    private fun daysWord(n: Int): String {
        val a = Math.abs(n)
        return when {
            a % 10 == 1 && a % 100 != 11 -> "день"
            a % 10 in 2..4 && a % 100 !in 12..14 -> "дня"
            else -> "дней"
        }
    }
}
