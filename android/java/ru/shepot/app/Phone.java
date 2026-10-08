package ru.shepot.app;

/** Нормализация и красивый формат номеров (аналог app/store.py). */
public final class Phone {
    private Phone() {
    }

    /** Возвращает номер в виде +<цифры> либо null, если номер некорректный. */
    public static String normalize(String raw) {
        if (raw == null) return null;
        String digits = raw.replaceAll("[^0-9]", "");
        if (digits.length() == 11 && digits.startsWith("8")) digits = "7" + digits.substring(1);
        if (digits.length() < 7 || digits.length() > 15) return null;
        return "+" + digits;
    }

    /** +7 (999) 123-45-67 для российских номеров, иначе — как есть. */
    public static String pretty(String phone) {
        if (phone == null) return "";
        String d = phone.replaceAll("[^0-9]", "");
        if (d.length() == 11 && d.startsWith("7")) {
            return "+7 (" + d.substring(1, 4) + ") " + d.substring(4, 7) + "-"
                    + d.substring(7, 9) + "-" + d.substring(9, 11);
        }
        return phone;
    }
}
