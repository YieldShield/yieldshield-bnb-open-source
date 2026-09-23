/** Preserve a same-site destination while a user connects or requests test tokens. */
export function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/trade";
  return value;
}

export function setupLink(step: string, pathname: string, search = "", hash = ""): string {
  return `${step}?next=${encodeURIComponent(pathname + search + hash)}`;
}
