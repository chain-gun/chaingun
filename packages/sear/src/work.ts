import { pbkdf2 } from './settings'
import { Buffer, crypto, TextEncoder } from './shims'

const DEFAULT_OPTS = {
  encode: 'base64',
  hash: pbkdf2.hash,
  name: 'PBKDF2'
}

export async function work(
  data: string,
  salt: string,
  opt: {
    readonly name?: string
    readonly iterations?: number
    readonly hash?: { readonly name: string }
    readonly encode?: string
    readonly length?: number
  } = DEFAULT_OPTS
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(data),
    { name: opt.name || DEFAULT_OPTS.name || '' },
    false,
    ['deriveBits']
  )
  const res = await crypto.subtle.deriveBits(
    {
      hash: opt.hash || DEFAULT_OPTS.hash,
      iterations: opt.iterations || pbkdf2.iter,
      name: opt.name || 'PBKDF2',
      salt: new TextEncoder().encode(salt)
    },
    key,
    opt.length || pbkdf2.ks * 8
  )
  return Buffer.from(res, 'binary').toString(opt.encode || DEFAULT_OPTS.encode)
}
