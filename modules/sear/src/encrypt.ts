import { importAesKey } from './importAesKey'
import { Buffer, crypto, random, TextEncoder } from './shims'

const DEFAULT_OPTS: {
  readonly name?: string
  readonly encode?: string
  readonly raw?: boolean
} = {
  encode: 'base64',
  name: 'AES-GCM'
}

export async function encrypt(
  msg: string,
  key: string,
  opt = DEFAULT_OPTS
): Promise<
  | string
  | {
      readonly ct: string
      readonly iv: string
      readonly s: string
    }
> {
  const rand = { s: random(9), iv: random(15) } // consider making this 9 and 15 or 18 or 12 to reduce == padding.

  const ct = await crypto.subtle.encrypt(
    {
      iv: new Uint8Array(rand.iv),
      name: opt.name || DEFAULT_OPTS.name || 'AES-GCM'
    },
    await importAesKey(key, rand.s, opt),
    new TextEncoder().encode(msg)
  )
  const encoding = opt.encode || DEFAULT_OPTS.encode
  const r = {
    ct: Buffer.from(ct, 'binary').toString(encoding),
    iv: rand.iv.toString(encoding),
    s: rand.s.toString(encoding)
  }
  if (opt.raw) {
    return r
  }
  return 'SEA' + JSON.stringify(r)
}
