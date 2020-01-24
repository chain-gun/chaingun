export const shuffleAttackCutoff = 1546329600000 // Jan 1, 2019

export const pbkdf2 = { hash: { name: 'SHA-256' }, iter: 100000, ks: 64 }
export const ecdsa = {
  pair: { name: 'ECDSA', namedCurve: 'P-256' },
  sign: { name: 'ECDSA', hash: { name: 'SHA-256' } }
}
export const ecdh = { name: 'ECDH', namedCurve: 'P-256' }

// This creates Web Cryptography API compliant JWK for sign/verify purposes
export function jwk(
  pub: string,
  d?: string
): {
  readonly crv: string
  readonly d?: string
  readonly ext: boolean
  readonly key_opts: readonly string[]
  readonly kty: string
  readonly x: string
  readonly y: string
} {
  // d === priv
  const coords = pub.split('.')
  return {
    crv: 'P-256',
    d,
    ext: true,
    key_opts: d ? ['sign'] : ['verify'],
    kty: 'EC',
    x: coords[0],
    y: coords[1]
  }
}

export function keyToJwk(
  keyBytes: Buffer
): {
  readonly k: string
  readonly kty: string
  readonly ext: boolean
  readonly alg: string
} {
  const keyB64 = keyBytes.toString('base64')
  const k = keyB64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/\=/g, '')
  return { kty: 'oct', k, ext: false, alg: 'A256GCM' }
}

export function check(t: any): boolean {
  return typeof t === 'string' && 'SEA{' === t.slice(0, 4)
}

export function parse(t: any): any {
  try {
    const yes = typeof t === 'string'
    if (yes && 'SEA{' === t.slice(0, 4)) {
      // tslint:disable-next-line: no-parameter-reassignment
      t = t.slice(3)
    }
    return yes ? JSON.parse(t) : t
    // tslint:disable-next-line: no-empty
  } catch (_e) {}
  return t
}
