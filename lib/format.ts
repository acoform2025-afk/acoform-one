export function inr(n: number | string | null | undefined, digits = 2): string {
  if (n == null || n === "") return "—";
  return `₹ ${Number(n).toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function num(n: number | string | null | undefined, digits = 2): string {
  if (n == null || n === "") return "—";
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function date(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function titleCase(s: string | null | undefined): string {
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function dbError(message: string): string {
  return message.replace(/^.*ERROR:\s*/i, "");
}
