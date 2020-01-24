export function pseudoRandomText(
  l = 24,
  c = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXZabcdefghijklmnopqrstuvwxyz'
): string {
  // tslint:disable-next-line: no-let
  let s = ''
  while (l > 0) {
    s += c.charAt(Math.floor(Math.random() * c.length))
    // tslint:disable-next-line: no-parameter-reassignment
    l--
  }
  return s
}
