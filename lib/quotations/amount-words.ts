const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
}
function threeDigits(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  return [h ? ONES[h] + " Hundred" : "", r ? twoDigits(r) : ""].filter(Boolean).join(" ");
}

/** Indian numbering: 42436770 -> "Four Crore Twenty-Four Lakh Thirty-Six Thousand Seven Hundred Seventy" */
function indian(n: number): string {
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 1e7), lakh = Math.floor((n % 1e7) / 1e5), thousand = Math.floor((n % 1e5) / 1e3), rest = n % 1e3;
  return [
    crore ? (crore >= 100 ? indian(crore) : twoDigits(crore)) + " Crore" : "",
    lakh ? twoDigits(lakh) + " Lakh" : "",
    thousand ? twoDigits(thousand) + " Thousand" : "",
    rest ? threeDigits(rest) : "",
  ].filter(Boolean).join(" ");
}

export function rupeesInWords(amount: number | string | null | undefined): string {
  const v = Math.round(Number(amount ?? 0) * 100);
  const rupees = Math.floor(v / 100), paise = v % 100;
  return `Rupees ${indian(rupees)}${paise ? ` and ${twoDigits(paise)} Paise` : ""} Only`;
}

/** Western numbering for a quotation shown in US dollars: 1234567 -> "One Million Two Hundred Thirty-Four Thousand Five Hundred Sixty-Seven" */
export function dollarsInWords(amount: number | string | null | undefined): string {
  const v = Math.round(Number(amount ?? 0) * 100);
  const d = Math.floor(v / 100), c = v % 100;
  const west = (n: number): string => {
    if (n === 0) return "Zero";
    const b = Math.floor(n / 1e9), m = Math.floor((n % 1e9) / 1e6), t = Math.floor((n % 1e6) / 1e3), r = n % 1e3;
    return [b ? threeDigits(b) + " Billion" : "", m ? threeDigits(m) + " Million" : "", t ? threeDigits(t) + " Thousand" : "", r ? threeDigits(r) : ""].filter(Boolean).join(" ");
  };
  return `US Dollars ${west(d)}${c ? ` and ${twoDigits(c)} Cents` : ""} Only`;
}
