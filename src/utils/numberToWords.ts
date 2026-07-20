/**
 * Converts a numeric amount to Ethiopian Birr in words.
 * Supports up to billions. Uses Ethiopian English number naming.
 *
 * Example: 156700.00 → "One Hundred Fifty-Six Thousand Seven Hundred Ethiopian Birr Only"
 */

const ONES = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen',
];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function convertHundreds(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)]);
    n %= 10;
  }
  if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(' ');
}

/**
 * Converts a numeric amount to words in Ethiopian Birr.
 *
 * @param amount - The numeric amount to convert (e.g. 156700.00)
 * @returns The amount in words, e.g. "One Hundred Fifty-Six Thousand Seven Hundred Ethiopian Birr Only"
 */
export function numberToWords(amount: number): string {
  if (amount === 0) return 'Zero Ethiopian Birr Only';

  const birr = Math.floor(amount);
  const cents = Math.round((amount - birr) * 100);

  const groups: { value: number; label: string }[] = [
    { value: 1_000_000_000, label: 'Billion' },
    { value: 1_000_000, label: 'Million' },
    { value: 1_000, label: 'Thousand' },
    { value: 1, label: '' },
  ];

  const result: string[] = [];
  let remainder = birr;

  for (const group of groups) {
    if (remainder >= group.value) {
      const count = Math.floor(remainder / group.value);
      remainder %= group.value;
      const words = group.value >= 1000
        ? `${convertHundreds(count)} ${group.label}`
        : convertHundreds(count);
      result.push(words);
    }
  }

  let words = result.join(' ') + ' Ethiopian Birr';
  if (cents > 0) {
    words += ` and ${convertHundreds(cents)} Cents`;
  }
  words += ' Only';

  return words;
}
