import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COUNTRY_CODES,
  digitsOnly,
  formatAsYouType,
  formatNational,
  formatPhone,
  groupDigits,
  isValidE164,
  makeE164,
  phoneKey,
  splitE164,
  stripCountryPrefix,
} from '../js/phone.js';

test('digitsOnly вырезает всё, кроме цифр', () => {
  assert.equal(digitsOnly('+7 (912) 345-67-89'), '79123456789');
  assert.equal(digitsOnly(''), '');
  assert.equal(digitsOnly(null), '');
});

test('makeE164 собирает номер и отбраковывает неполный', () => {
  assert.equal(makeE164('7', '(912) 345-67-89'), '+79123456789');
  assert.equal(makeE164('380', '67 123 45 67'), '+380671234567');
  assert.equal(makeE164('7', '912345678'), null, 'для +7 нужно ровно 10 цифр');
  assert.equal(makeE164('7', '12345'), null, 'слишком короткий');
  assert.equal(makeE164('7', ''), null);
  assert.equal(makeE164('', '9123456789'), null);
});

test('makeE164 принимает страны без фиксированной длины', () => {
  assert.equal(makeE164('370', '61234567'), '+37061234567');
  assert.equal(makeE164('370', '61234'), null, 'меньше 6 цифр');
});

test('splitE164 отделяет код страны', () => {
  assert.deepEqual(splitE164('+79123456789'), { countryCode: '7', national: '9123456789' });
  assert.deepEqual(splitE164('+380671234567'), { countryCode: '380', national: '671234567' });
  assert.deepEqual(splitE164('+12015550123'), { countryCode: '1', national: '2015550123' });
});

test('isValidE164', () => {
  assert.equal(isValidE164('+79123456789'), true);
  assert.equal(isValidE164('79123456789'), false);
  assert.equal(isValidE164('+791'), false);
  assert.equal(isValidE164(undefined), false);
});

test('phoneKey — только цифры, для сравнения контактов', () => {
  assert.equal(phoneKey('+7 (912) 345-67-89'), '79123456789');
  assert.equal(phoneKey('+7 (912) 345-67-89'), phoneKey('+79123456789'));
  assert.notEqual(phoneKey('+79123456789'), phoneKey('+380671234567'));
});

test('groupDigits разбивает на группы', () => {
  assert.equal(groupDigits('671234567'), '671 234 56 7');
  assert.equal(groupDigits('123456'), '123 456');
  assert.equal(groupDigits(''), '');
});

test('formatNational знает формат страны', () => {
  assert.equal(formatNational('7', '9123456789'), '(912) 345-67-89');
  assert.equal(formatNational('380', '671234567'), '67 123 45 67');
  assert.equal(formatNational('1', '2015550123'), '(201) 555-0123');
  assert.equal(formatNational('375', '291234567'), '29 123-45-67');
  assert.equal(formatNational('82', '1012345678'), '10-1234-5678');
});

test('formatPhone показывает номер целиком', () => {
  assert.equal(formatPhone('+79123456789'), '+7 (912) 345-67-89');
  assert.equal(formatPhone('+380671234567'), '+380 67 123 45 67');
  assert.equal(formatPhone('+12015550123'), '+1 (201) 555-0123');
  assert.equal(formatPhone(''), '');
});

test('stripCountryPrefix убирает дубль кода страны при вставке', () => {
  assert.equal(stripCountryPrefix('7', '79123456789'), '9123456789');
  assert.equal(stripCountryPrefix('7', '89123456789'), '9123456789');
  assert.equal(stripCountryPrefix('7', '9123456789'), '9123456789');
  assert.equal(stripCountryPrefix('380', '380671234567'), '671234567');
  assert.equal(stripCountryPrefix('380', '671234567'), '671234567');
});

test('formatAsYouType: маска для +7 по мере ввода', () => {
  assert.equal(formatAsYouType('7', '').text, '');
  assert.equal(formatAsYouType('7', '9').text, '(9');
  assert.equal(formatAsYouType('7', '912').text, '(912)');
  assert.equal(formatAsYouType('7', '912345').text, '(912) 345');
  assert.equal(formatAsYouType('7', '91234567').text, '(912) 345-67');
  assert.equal(formatAsYouType('7', '9123456789').text, '(912) 345-67-89');
});

test('formatAsYouType: лишние цифры не ломают маску', () => {
  assert.equal(formatAsYouType('7', '91234567890').text, '(912) 345-67-89');
  assert.equal(formatAsYouType('7', '89123456789').text, '(912) 345-67-89');
});

test('formatAsYouType: другие страны', () => {
  assert.equal(formatAsYouType('380', '6712').text, '671 2');
  assert.equal(formatAsYouType('380', '671234567').text, '67 123 45 67');
});

test('formatAsYouType ставит курсор к следующей цифре', () => {
  const { text, caret } = formatAsYouType('7', '(912) 345', 5);
  assert.equal(text, '(912) 345');
  assert.equal(text[caret], '3');
  assert.equal(formatAsYouType('7', '(912', 0).caret, 0);
});

test('у каждого кода страны есть подпись и пример', () => {
  for (const item of COUNTRY_CODES) {
    assert.ok(item.cc && item.label && item.sample, JSON.stringify(item));
    assert.equal(
      formatNational(item.cc, digitsOnly(item.sample)).length > 0,
      true,
      `нет примера для +${item.cc}`,
    );
  }
});

test('примеры из справочника проходят валидацию', () => {
  for (const item of COUNTRY_CODES) {
    const e164 = makeE164(item.cc, item.sample);
    assert.ok(e164, `пример +${item.cc} ${item.sample} не собирается в номер`);
    assert.equal(isValidE164(e164), true);
  }
});
