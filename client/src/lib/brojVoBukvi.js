// Macedonian number-to-words (број во букви) for invoices.
// Pure function, no dependencies. e.g. brojVoBukvi(180000) === 'Сто осумдесет илјади.'
// Kept byte-for-byte in sync with server/shared/brojVoBukvi.js.

const ONES_M = ['', 'еден', 'два', 'три', 'четири', 'пет', 'шест', 'седум', 'осум', 'девет'];
const ONES_F = ['', 'една', 'две', 'три', 'четири', 'пет', 'шест', 'седум', 'осум', 'девет'];
const TEENS = ['десет', 'единаесет', 'дванаесет', 'тринаесет', 'четиринаесет', 'петнаесет', 'шеснаесет', 'седумнаесет', 'осумнаесет', 'деветнаесет'];
const TENS = ['', '', 'дваесет', 'триесет', 'четириесет', 'педесет', 'шеесет', 'седумдесет', 'осумдесет', 'деведесет'];
const HUNDREDS = ['', 'сто', 'двесте', 'триста', 'четиристотини', 'петстотини', 'шестотини', 'седумстотини', 'осумстотини', 'деветстотини'];

// Render 0..999 as words. `fem` uses feminine one/two (за илјади: една, две).
function trojka(n, fem) {
  const out = [];
  const h = Math.floor(n / 100);
  n %= 100;
  if (h) out.push(HUNDREDS[h]);
  if (n >= 10 && n < 20) {
    if (out.length) out.push('и');
    out.push(TEENS[n - 10]);
  } else {
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (t) out.push(TENS[t]);
    if (u) {
      if (out.length) out.push('и');
      out.push((fem ? ONES_F : ONES_M)[u]);
    }
  }
  return out.join(' ');
}

function integerToWords(n) {
  if (n <= 0) return 'нула';
  const parts = [];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  if (millions) parts.push(`${trojka(millions, false)} ${millions === 1 ? 'милион' : 'милиони'}`);
  if (thousands) parts.push(thousands === 1 ? 'илјада' : `${trojka(thousands, true)} илјади`);
  if (rest) parts.push(trojka(rest, false));
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Amount → Macedonian words, capitalized, ending with a period. Cents (if any)
 * are appended as "и NN денари", matching the invoice sample style.
 */
export function brojVoBukvi(amount) {
  const num = Math.abs(Number(amount) || 0);
  const whole = Math.floor(num + 1e-9);
  const cents = Math.round((num - whole) * 100);
  let words = integerToWords(whole);
  words = words.charAt(0).toUpperCase() + words.slice(1);
  if (cents > 0) words += ` и ${String(cents).padStart(2, '0')} денари`;
  return `${words}.`;
}
