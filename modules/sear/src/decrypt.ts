import { importAesKey } from './importAesKey'
import { parse } from './settings'
import { Buffer, crypto, TextDecoder } from './shims'

const DEFAULT_OPTS: {
  readonly name?: string
  readonly encode?: string
  readonly fallback?: string
} = {
  encode: 'base64',
  name: 'AES-GCM'
}

export async function decrypt(
  data: string,
  key: string,
  opt = DEFAULT_OPTS
): Promise<GunValue> {
  const json: any = parse(data)
  const encoding = opt.encode || DEFAULT_OPTS.encode

  try {
    const aeskey = await importAesKey(key, Buffer.from(json.s, encoding), opt)
    const encrypted = new Uint8Array(Buffer.from(json.ct, encoding))
    const iv = new Uint8Array(Buffer.from(json.iv, encoding))
    const ct = await crypto.subtle.decrypt(
      {
        iv,
        name: opt.name || DEFAULT_OPTS.name || 'AES-GCM',
        tagLength: 128
      },
      aeskey,
      encrypted
    )
    return parse(new TextDecoder('utf8').decode(ct))
  } catch (e) {
    // tslint:disable-next-line: no-console
    console.warn('decrypt error', e, e.stack || e)

    if (!opt.fallback || encoding === opt.fallback) {
      throw new Error('Could not decrypt')
    }
    return decrypt(data, key, { ...opt, encode: opt.fallback })
  }
}
