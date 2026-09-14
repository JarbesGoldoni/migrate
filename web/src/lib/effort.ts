const ORDER = ["none", "minimal", "low", "medium", "high", "xhigh", "max"]

/** Known effort levels in ascending order, then anything a provider invents. */
export function sortVariants(variants: string[]) {
  const rank = (v: string) => (ORDER.includes(v) ? ORDER.indexOf(v) : ORDER.length)
  return [...variants].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}
