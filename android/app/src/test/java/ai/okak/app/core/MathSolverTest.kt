package ai.okak.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MathSolverTest {

    private fun ans(text: String): String? =
        (MathSolver.answer(text) as? MathOutcome.Answer)?.text

    @Test
    fun formatsNumbers() {
        assertEquals("1 024", TextUtil.formatNumber(1024.0))
        assertEquals("2,5", TextUtil.formatNumber(2.5))
        assertEquals("3", TextUtil.formatNumber(3.0))
    }

    @Test
    fun arithmetic() {
        assertEquals("2+2 = 4", ans("сколько будет 2+2"))
        assertEquals("15 · 3 − 4 = 41", ans("Посчитай 15 * 3 - 4"))
        assertEquals("2 · 3.5 = 7", ans("сколько будет 2 умножить на 3,5"))
        assertEquals("10 / 4 = 2,5", ans("10 разделить на 4"))
        assertTrue(ans("2 в степени 10")!!.contains("1 024"))
    }

    @Test
    fun rootsAndFunctions() {
        assertEquals("√16 = 4", ans("корень из 16"))
        assertEquals("∛27 = 3", ans("кубический корень из 27"))
        assertEquals("factorial(5) = 120", ans("факториал 5"))
    }

    @Test
    fun percent() {
        assertEquals("15% от 200 = 30", ans("сколько будет 15% от 200"))
    }

    @Test
    fun divisionByZero() {
        assertEquals("На ноль делить нельзя.", ans("10 / 0"))
    }

    @Test
    fun equationsNeedAi() {
        assertTrue(MathSolver.answer("реши уравнение x^2 - 5x + 6 = 0") is MathOutcome.NeedsAi)
        assertTrue(MathSolver.answer("производная от x^3 + 2x") is MathOutcome.NeedsAi)
        assertTrue(MathSolver.answer("интеграл от 2x") is MathOutcome.NeedsAi)
    }

    @Test
    fun notMath() {
        assertTrue(MathSolver.answer("в 2020 году") is MathOutcome.None)
        assertTrue(MathSolver.answer("кто такой Пушкин") is MathOutcome.None)
    }

    @Test
    fun injectionIsNotExecuted() {
        // Произвольный код не выполняется: парсер отклоняет неизвестные слова.
        assertTrue(MathSolver.answer("1+System.exit(0)") is MathOutcome.None)
        assertEquals("Слишком большая степень.", ans("сколько будет 2^100000"))
    }

    @Test(expected = MathError::class)
    fun hugeExponentThrows() {
        MathSolver.evaluate("2^100000")
    }

    @Test
    fun parserPrecedence() {
        assertEquals(14.0, MathSolver.evaluate("2+3*4"), 1e-9)
        assertEquals(-8.0, MathSolver.evaluate("-2^3"), 1e-9)
        assertEquals(20.0, MathSolver.evaluate("2(3+7)"), 1e-9)
    }
}
