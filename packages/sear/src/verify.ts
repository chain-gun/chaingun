import { ecdsa, jwk, parse } from './settings'
import { sha256 } from './sha256'
import { crypto } from './shims'

const DEFAULT_OPTS: {
  readonly fallback?: boolean
  readonly encode?: string
  readonly raw?: boolean
  readonly check?: {
    readonly m: any
    readonly s: string
  }
} = {
  encode: 'base64'
}

function importKey(pub: string): Promise<any> {
  const token = jwk(pub)
  const promise = crypto.subtle.importKey('jwk', token, ecdsa.pair, false, [
    'verify'
  ])
  return promise
}

export async function verifyHashSignature(
  hash: string,
  signature: string,
  pub: string,
  opt = DEFAULT_OPTS
): Promise<boolean> {
  const encoding = opt.encode || DEFAULT_OPTS.encode
  const key = await importKey(pub)
  // @ts-ignore
  const buf = Buffer.from(signature, encoding)
  const sig = new Uint8Array(buf)

  if (
    await crypto.subtle.verify(
      ecdsa.sign,
      key,
      sig,
      new Uint8Array(Buffer.from(hash, 'hex'))
    )
  ) {
    return true
  }

  return false
}

export async function verifySignature(
  text: string,
  signature: string,
  pub: string,
  opt = DEFAULT_OPTS
): Promise<boolean> {
  const hash = await sha256(
    typeof text === 'string' ? text : JSON.stringify(text)
  )
  return verifyHashSignature(hash.toString('hex'), signature, pub, opt)
}

export async function verify(
  data: string | { readonly m: string; readonly s: string },
  pub: string,
  opt = DEFAULT_OPTS
): Promise<boolean> {
  const json = parse(data)
  if (await verifySignature(json.m, json.s, pub, opt)) {
    return true
  }
  if (opt.fallback) {
    return oldVerify(data, pub, opt)
  }
  return false
}

export async function oldVerify(
  _data: string | { readonly m: string; readonly s: string },
  _pub: string,
  _opt = DEFAULT_OPTS
): Promise<boolean> {
  throw new Error('Legacy fallback validation not yet supported')
}
