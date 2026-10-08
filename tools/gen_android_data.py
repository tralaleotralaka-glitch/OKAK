"""Генерирует android/.../core/GeneratedData.kt из Python-версии (okak/knowledge.py, okak/timeinfo.py)
и копирует базу знаний okak/data/knowledge_ru.json в assets Android-приложения.
Запускать после любых правок данных в Python: python3 tools/gen_android_data.py
"""
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from okak.knowledge import COUNTRIES  # noqa: E402
from okak.timeinfo import CITIES  # noqa: E402


def q(s: str) -> str:
    assert '"' not in s and "$" not in s and "\\" not in s, s
    return f'"{s}"'


lines = [
    "// Сгенерировано tools/gen_android_data.py из okak/knowledge.py и okak/timeinfo.py. Не редактируйте вручную.",
    "package ai.okak.app.core",
    "",
    "internal data class Country(val stems: List<String>, val genitive: str, val capital: String)".replace("str,", "String,"),
    "internal data class City(val stem: String, val zone: String, val label: String)",
    "",
    "internal object GeneratedData {",
    "    val COUNTRIES: List<Country> = listOf(",
]
for stems, genitive, capital in COUNTRIES:
    stem_list = ", ".join(q(s) for s in stems)
    lines.append(f"        Country(listOf({stem_list}), {q(genitive)}, {q(capital)}),")
lines += ["    )", "", "    val CITIES: List<City> = listOf("]
for stem, (zone, label) in CITIES.items():
    lines.append(f"        City({q(stem)}, {q(zone)}, {q(label)}),")
lines += ["    )", "}", ""]

out = ROOT / "android/app/src/main/java/ai/okak/app/core/GeneratedData.kt"
out.write_text("\n".join(lines), encoding="utf-8")
shutil.copyfile(ROOT / "okak/data/knowledge_ru.json", ROOT / "android/app/src/main/assets/knowledge_ru.json")
print("countries:", len(COUNTRIES), "cities:", len(CITIES), "->", out)
print("assets: knowledge_ru.json синхронизирован")
