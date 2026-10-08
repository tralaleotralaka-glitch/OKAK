package ai.okak.app.core

/** Столицы стран: «Столица Франции?» → «Столица Франции — Париж.» */
object Capitals {
    fun answer(message: String): String? {
        val toks = TextUtil.tokens(message)
        if (toks.none { TextUtil.stemMatches("столиц", it) }) return null
        for (country in GeneratedData.COUNTRIES) {
            if (country.stems.any { stem -> toks.any { TextUtil.stemMatches(stem, it) } }) {
                return "Столица ${country.genitive} — ${country.capital}."
            }
        }
        return null
    }
}
