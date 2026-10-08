"""Тесты OKAK: python3 -m unittest discover -s tests -v"""

import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from okak.engine import Brain  # noqa: E402
from okak.knowledge import KnowledgeBase, answer_capital, default_knowledge  # noqa: E402
from okak.mathsolver import MathError, answer_math_question, evaluate  # noqa: E402
from okak.smalltalk import answer_smalltalk  # noqa: E402
from okak.textutil import format_number, normalize  # noqa: E402
from okak.timeinfo import answer_time_question  # noqa: E402
from datetime import datetime  # noqa: E402


class TextUtilTests(unittest.TestCase):
    def test_normalize_yo(self):
        self.assertEqual(normalize("Ёлка  Ёж"), "елка еж")

    def test_format_number(self):
        self.assertEqual(format_number(1024), "1 024")
        self.assertEqual(format_number(2.5), "2,5")
        self.assertEqual(format_number(3.0), "3")


class MathTests(unittest.TestCase):
    def ans(self, text):
        return answer_math_question(text)

    def test_arithmetic(self):
        self.assertEqual(self.ans("сколько будет 2+2"), "2+2 = 4")
        self.assertEqual(self.ans("Посчитай 15 * 3 - 4"), "15 · 3 − 4 = 41")
        self.assertEqual(self.ans("сколько будет 2 умножить на 3,5"), "2 · 3.5 = 7")
        self.assertEqual(self.ans("10 разделить на 4"), "10 / 4 = 2,5")
        self.assertIn("1 024", self.ans("2 в степени 10"))

    def test_roots_and_functions(self):
        self.assertEqual(self.ans("корень из 16"), "√16 = 4")
        self.assertEqual(self.ans("кубический корень из 27"), "∛27 = 3")
        self.assertEqual(self.ans("факториал 5"), "factorial(5) = 120")

    def test_percent(self):
        self.assertEqual(self.ans("сколько будет 15% от 200"), "15% от 200 = 30")

    def test_division_by_zero_message(self):
        self.assertEqual(self.ans("10 / 0"), "На ноль делить нельзя.")

    def test_equations(self):
        self.assertEqual(self.ans("реши уравнение x^2 - 5x + 6 = 0"), "Корни уравнения: x₁ = 2; x₂ = 3")
        self.assertEqual(self.ans("реши 2x + 3 = 7"), "x = 2")
        self.assertEqual(self.ans("реши x^2 + 1 = 0"), "Корни уравнения: x₁ = -i; x₂ = i")

    def test_calculus(self):
        self.assertEqual(self.ans("производная от x^3 + 2x"), "f'(x) = 3·x^2 + 2")
        self.assertEqual(self.ans("интеграл от 2x"), "∫ 2·x dx = x^2 + C")

    def test_not_math(self):
        self.assertIsNone(self.ans("в 2020 году"))
        self.assertIsNone(self.ans("1-2 дня"))  # есть слова — не считаем
        self.assertIsNone(self.ans("кто такой Пушкин"))

    def test_injection_is_blocked(self):
        for attack in ('__import__("os").system("echo hi")', "реши __import__('os')", "open('/etc/passwd')"):
            result = self.ans(attack)
            self.assertTrue(result is None or "недопустим" in result or "слов" in result or "формул" in result, attack)

    def test_evaluate_rejects_names(self):
        with self.assertRaises(MathError):
            evaluate("__import__")

    def test_huge_power_guard(self):
        self.assertIn("Слишком", self.ans("сколько будет 2^100000"))


class TimeTests(unittest.TestCase):
    def test_time_and_date(self):
        self.assertIn("Сейчас", answer_time_question("который час?"))
        self.assertIn("Сегодня", answer_time_question("Какое сегодня число"))
        self.assertIn("2026", answer_time_question("какой год сейчас?"))

    def test_other_city(self):
        self.assertIn("Токио", answer_time_question("Сколько времени в Токио"))

    def test_days_until(self):
        self.assertIn("осталось", answer_time_question("сколько дней до нового года"))
        self.assertIn("2030", answer_time_question("сколько дней до 1 января 2030"))

    def test_weekday(self):
        self.assertIn("пятница", answer_time_question("какой день недели 25 декабря 2026"))

    def test_no_false_positive(self):
        self.assertIsNone(answer_time_question("какой год основана Москва"))
        self.assertIsNone(answer_time_question("кто такой Пушкин"))


class KnowledgeTests(unittest.TestCase):
    def setUp(self):
        self.kb = default_knowledge()

    def test_known_facts(self):
        self.assertIn("Пушкин", self.kb.search("Кто такой Пушкин?").answer)
        self.assertIn("Гагарин", self.kb.search("расскажи про Гагарина").answer)
        self.assertIn("Python", self.kb.search("Что такое python").answer)
        self.assertIn("ДНК", self.kb.search("Что такое ДНК").answer)
        self.assertIn("Война и мир", self.kb.search("кто написал войну и мир").answer)

    def test_unknown(self):
        self.assertIsNone(self.kb.search("кто изобрел велосипед в каменном веке"))

    def test_capitals(self):
        self.assertEqual(answer_capital("столица Франции"), "Столица Франции — Париж.")
        self.assertEqual(answer_capital("Какая столица Турции?"), "Столица Турции — Анкара.")
        self.assertIsNone(answer_capital("столица"))

    def test_kb_is_populated(self):
        self.assertGreaterEqual(len(self.kb.entries), 60)
        for entry in self.kb.entries:
            self.assertTrue(entry["keywords"] and entry["answer"], entry)

    def test_custom_entries(self):
        kb = KnowledgeBase([{"keywords": ["тест фраза"], "answer": "ok"}])
        self.assertEqual(kb.search("это тест фраза").answer, "ok")
        self.assertIsNone(kb.search("тест"))


class SmalltalkTests(unittest.TestCase):
    def test_basics(self):
        now = datetime(2026, 10, 8, 14, 0)
        self.assertIn("Добрый день", answer_smalltalk("привет", now))
        self.assertIn("OKAK", answer_smalltalk("кто ты?", now))
        self.assertIn("умею", answer_smalltalk("что ты умеешь", now))
        self.assertIsNone(answer_smalltalk("сколько слонов в Африке", now))


class BrainTests(unittest.TestCase):
    def setUp(self):
        self.brain = Brain(llm=None)

    def test_routing(self):
        self.assertEqual(self.brain.reply("привет").intent, "smalltalk")
        self.assertEqual(self.brain.reply("который час").intent, "time")
        self.assertEqual(self.brain.reply("корень из 81").intent, "math")
        self.assertEqual(self.brain.reply("столица Италии").intent, "capital")
        self.assertEqual(self.brain.reply("Кто такой Пушкин").intent, "knowledge")
        self.assertEqual(self.brain.reply("кто изобрел велосипед в каменном веке").intent, "fallback")

    def test_empty_message(self):
        self.assertEqual(self.brain.reply("   ").intent, "smalltalk")

    def test_response_time_under_seven_seconds(self):
        questions = ["который час", "корень из 144", "Кто такой Пушкин", "столица Японии",
                     "неизвестный вопрос про что-то", "реши x^2 - 9 = 0"]
        for q in questions:
            started = time.monotonic()
            reply = self.brain.reply(q)
            elapsed = time.monotonic() - started
            self.assertLess(elapsed, 7.0, q)
            self.assertLess(reply.elapsed_ms, 7000, q)

    def test_llm_timeout_is_bounded(self):
        class SlowLLM:
            timeout = 5.0

            def ask(self, question, history, now_text, timeout):
                time.sleep(min(timeout, 0.2))
                return None  # имитируем недоступность модели

        brain = Brain(llm=SlowLLM(), budget_s=6.0)
        started = time.monotonic()
        reply = brain.reply("вопрос, которого нет в базе, про квантовую хромодинамику")
        self.assertEqual(reply.intent, "fallback")
        self.assertLess(time.monotonic() - started, 7.0)

    def test_llm_answer_used_for_unknown(self):
        class FakeLLM:
            timeout = 5.0

            def ask(self, question, history, now_text, timeout):
                assert 1.0 <= timeout <= 5.0
                return "Ответ от модели"

        reply = Brain(llm=FakeLLM()).reply("вопрос вне базы про квантовую хромодинамику")
        self.assertEqual((reply.intent, reply.source, reply.text), ("llm", "llm", "Ответ от модели"))

    def test_local_answers_do_not_call_llm(self):
        class ExplodingLLM:
            timeout = 5.0

            def ask(self, *a, **k):
                raise AssertionError("LLM не должна вызываться для локальных вопросов")

        brain = Brain(llm=ExplodingLLM())
        self.assertEqual(brain.reply("который час").intent, "time")
        self.assertEqual(brain.reply("корень из 49").intent, "math")


if __name__ == "__main__":
    unittest.main()
