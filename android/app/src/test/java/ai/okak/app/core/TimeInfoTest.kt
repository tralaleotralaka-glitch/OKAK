package ai.okak.app.core

import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TimeInfoTest {

    private val now = ZonedDateTime.of(2026, 10, 8, 12, 30, 0, 0, ZoneId.of("Europe/Moscow"))

    @Test
    fun currentTime() {
        val text = TimeInfo.answer("который час?", now)!!
        assertTrue(text, text.contains("12:30:00"))
        assertTrue(text, text.contains("Europe/Moscow"))
    }

    @Test
    fun currentDate() {
        val text = TimeInfo.answer("Какое сегодня число", now)!!
        assertTrue(text, text.contains("8 октября 2026 года"))
    }

    @Test
    fun daysUntilNewYear() {
        val text = TimeInfo.answer("сколько дней до нового года", now)!!
        assertTrue(text, text.contains("осталось"))
    }

    @Test
    fun weekdayOfDate() {
        val text = TimeInfo.answer("какой день недели 25 декабря 2026", now)!!
        assertTrue(text, text.contains("пятница"))
    }

    @Test
    fun unrelatedQuestion() {
        assertNull(TimeInfo.answer("кто такой Пушкин", now))
    }

    @Test
    fun pluralFormForOneDay() {
        assertEquals(
            "До 9 октября 2026 года осталось 1 день.",
            TimeInfo.answer("сколько дней до 9 октября 2026", now),
        )
    }
}
