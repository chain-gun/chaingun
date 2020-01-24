export function pubFromSoul(soul: string): string {
  if (!soul) {
    return ''
  }
  const tokens = soul.split('~')
  const last = tokens[tokens.length - 1]
  if (!last) {
    return ''
  }
  const coords = last.split('.')
  if (coords.length < 2) {
    return ''
  }
  return coords.slice(0, 2).join('.')
}
