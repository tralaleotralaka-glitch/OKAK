package ai.okak.app.core

import android.content.Context
import org.json.JSONArray

/**
 * Встроенная база знаний (assets/knowledge_ru.json — та же, что в Python-версии).
 * Поиск по основам слов: каждая фраза засчитывается, если найдены все её слова.
 */
class KnowledgeBase private constructor(private val entries: List<Entry>) {

    data class Entry(val keywords: List<String>, val answer: String, val topic: String)

    data class Hit(val answer: String, val topic: String, val score: Int)

    fun search(message: String): Hit? {
        val toks = TextUtil.tokens(message)
        if (toks.isEmpty()) return null
        var best: Hit? = null
        for (entry in entries) {
            val score = entry.keywords.sumOf { keywordScore(it, toks) }
            val current = best
            if (score >= MIN_SCORE && (current == null || score > current.score)) {
                best = Hit(entry.answer, entry.topic, score)
            }
        }
        return best
    }

    companion object {
        const val MIN_SCORE = 4
        private const val ASSET = "knowledge_ru.json"

        fun load(context: Context): KnowledgeBase {
            val json = context.assets.open(ASSET).bufferedReader(Charsets.UTF_8).use { it.readText() }
            return fromJson(json)
        }

        fun fromJson(json: String): KnowledgeBase {
            val array = JSONArray(json)
            val entries = List(array.length()) { i ->
                val o = array.getJSONObject(i)
                val kws = o.getJSONArray("keywords")
                Entry(
                    keywords = List(kws.length()) { kws.getString(it) },
                    answer = o.getString("answer"),
                    topic = o.optString("topic", ""),
                )
            }
            return KnowledgeBase(entries)
        }

        private fun keywordScore(keyword: String, toks: List<String>): Int {
            val words = keyword.split(' ').filter { it.isNotEmpty() }
            for (word in words) {
                val found = if (word.startsWith("=")) {
                    toks.contains(word.substring(1))  // «=марс» — только точное совпадение
                } else {
                    toks.any { TextUtil.stemMatches(word, it) }
                }
                if (!found) return 0
            }
            // Короткие аббревиатуры («днк», «пи») — точное совпадение считаем сильным сигналом.
            if (words.size == 1 && words[0].length < MIN_SCORE) return MIN_SCORE
            return words.sumOf { it.length }
        }
    }
}
