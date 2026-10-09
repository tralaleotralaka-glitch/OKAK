/**
 * MySENGER — работа с номерами телефонов.
 * Чистый модуль: без DOM, покрыт тестами в tests/phone.test.js
 */

/** Справочник кодов стран, показывается в списке ввода номера. */
export const COUNTRY_CODES = [
  { cc: '7', label: 'Россия / Казахстан', sample: '(912) 345-67-89', fixed: 10 },
  { cc: '380', label: 'Украина', sample: '67 123 45 67', fixed: 9 },
  { cc: '375', label: 'Беларусь', sample: '29 123-45-67', fixed: 9 },
  { cc: '996', label: 'Кыргызстан', sample: '700 123 456', fixed: 9 },
  { cc: '998', label: 'Узбекистан', sample: '90 123 45 67', fixed: 9 },
  { cc: '1', label: 'США / Канада', sample: '(201) 555-0123', fixed: 10 },
  { cc: '44', label: 'Великобритания', sample: '7400 123456', fixed: 10 },
  { cc: '49', label: 'Германия', sample: '151 23456789', fixed: 11 },
  { cc: '33', label: 'Франция', sample: '6 12 34 56 78', fixed: 9 },
  { cc: '90', label: 'Турция', sample: '501 234 56 78', fixed: 10 },
  { cc: '86', label: 'Китай', sample: '131 2345 6789', fixed: 11 },
  { cc: '82', label: 'Корея', sample: '10-1234-5678', fixed: 10 },
];

/** Правила красивого вывода национальной части. */
const NATIONAL_PATTERNS = {
  7: [[/^(\d{3})(\d{3})(\d{2})(\d{2})$/, '($1) $2-$3-$4']],
  380: [[/^(\d{2})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4']],
  375: [[/^(\d{2})(\d{3})(\d{2})(\d{2})$/, '$1 $2-$3-$4']],
  996: [[/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3']],
  998: [[/^(\d{2})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4']],
  1: [[/^(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3']],
  44: [[/^(\d{4})(\d{6})$/, '$1 $2']],
  49: [[/^(\d{3})(\d{7,8})$/, '$1 $2']],
  33: [[/^(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5']],
  90: [[/^(\d{3})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4']],
  86: [[/^(\d{3})(\d{4})(\d{4})$/, '$1 $2 $3']],
  82: [[/^(\d{2})(\d{4})(\d{4})$/, '$1-$2-$3']],
};

/** Все цифры строки. */
export function digitsOnly(value) {
  return String(value ?? '').replace(/\D+/g, '');
}

/** Метаданные кода страны. */
export function countryMeta(countryCode) {
  return COUNTRY_CODES.find((item) => item.cc === digitsOnly(countryCode)) || null;
}

/**
 * Собирает E.164 из кода страны и национальной части.
 * Возвращает null, если номер неполный или некорректный.
 */
export function makeE164(countryCode, national) {
  const cc = digitsOnly(countryCode);
  const nat = digitsOnly(national);
  if (!cc || !nat) return null;
  if (nat.length < 6 || nat.length > 15) return null;
  const meta = countryMeta(cc);
  if (meta?.fixed && nat.length !== meta.fixed) return null;
  return `+${cc}${nat}`;
}

/** Разбирает E.164 на код страны и национальную часть. */
export function splitE164(e164) {
  const digits = digitsOnly(e164);
  const meta = COUNTRY_CODES.slice()
    .sort((a, b) => b.cc.length - a.cc.length)
    .find((item) => digits.startsWith(item.cc));
  if (meta) return { countryCode: meta.cc, national: digits.slice(meta.cc.length) };
  return { countryCode: digits.slice(0, 1) || '', national: digits.slice(1) };
}

/** Проверяет готовый номер. */
export function isValidE164(e164) {
  return /^\+\d{7,16}$/.test(String(e164 ?? ''));
}

/** Ключ для дедупликации контактов (только цифры). */
export function phoneKey(e164) {
  return digitsOnly(e164);
}

/** Разбивает цифры на группы по 3-3-2-2… */
export function groupDigits(value) {
  const digits = digitsOnly(value);
  const chunks = [];
  let i = 0;
  let size = 3;
  while (i < digits.length) {
    chunks.push(digits.slice(i, i + size));
    i += size;
    if (chunks.length === 2) size = 2;
  }
  return chunks.join(' ');
}

/** Национальная часть в привычном для страны виде. */
export function formatNational(countryCode, value) {
  const cc = digitsOnly(countryCode);
  const digits = digitsOnly(value);
  for (const [pattern, replacement] of NATIONAL_PATTERNS[cc] || []) {
    if (pattern.test(digits)) return digits.replace(pattern, replacement);
  }
  return groupDigits(digits);
}

/** Полный номер: +7 (912) 345-67-89, +380 67 123 45 67. */
export function formatPhone(e164) {
  const digits = digitsOnly(e164);
  if (!digits) return '';
  const { countryCode, national } = splitE164(digits);
  const body = formatNational(countryCode, national);
  return body ? `+${countryCode} ${body}` : `+${countryCode}`;
}

/**
 * Вырезает из введённых цифр дубль кода страны:
 * вставка «+7 912 345-67-89», «89123456789» или «380671234567»
 * при уже выбранном коде страны даёт просто национальную часть.
 */
export function stripCountryPrefix(countryCode, digits) {
  const cc = digitsOnly(countryCode);
  if (!cc || !digits) return digits;
  if (cc === '7') {
    if (digits.length >= 11 && /^[78]/.test(digits)) return digits.slice(1);
    return digits;
  }
  if (digits.startsWith(cc) && digits.length - cc.length >= 6) return digits.slice(cc.length);
  return digits;
}

/**
 * Маска ввода «на лету»: возвращает текст для поля
 * и позицию курсора после вставки/удаления.
 */
export function formatAsYouType(countryCode, rawValue, caretFrom = null) {
  const cc = digitsOnly(countryCode);
  const digits = stripCountryPrefix(cc, digitsOnly(rawValue));
  let text;

  if (cc === '7') {
    let out = '';
    if (digits.length > 0) out += `(${digits.slice(0, 3)}`;
    if (digits.length >= 3) out += ')';
    if (digits.length > 3) out += ` ${digits.slice(3, 6)}`;
    if (digits.length > 6) out += `-${digits.slice(6, 8)}`;
    if (digits.length > 8) out += `-${digits.slice(8, 10)}`;
    text = out;
  } else {
    const meta = countryMeta(cc);
    const complete = Boolean(meta?.fixed) && digits.length === meta.fixed;
    text = complete ? formatNational(cc, digits) : groupDigits(digits);
  }

  let caret = text.length;
  if (caretFrom !== null) {
    const typed = digitsOnly(String(rawValue).slice(0, caretFrom)).length;
    if (typed === 0) {
      caret = 0;
    } else {
      let seen = 0;
      for (let i = 0; i < text.length; i += 1) {
        if (/\d/.test(text[i])) seen += 1;
        if (seen === typed) {
          caret = i + 1;
          // курсор ставим за разделителями, к следующей цифре
          while (caret < text.length && !/\d/.test(text[caret])) caret += 1;
          break;
        }
      }
      if (seen < typed) caret = text.length;
    }
  }
  return { text, caret };
}
