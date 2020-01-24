import { keyToJwk } from './settings'
import { sha256 } from './sha256'
import { crypto, random } from './shims'

const DEFAULT_OPTS: {
  readonly name?: string
} = {
  name: 'AES-GCM'
}

export async function importAesKey(
  key: string,
  salt: Buffer,
  _opt = DEFAULT_OPTS
): Promise<any> {
  const combo = key + (salt || random(8)).toString('utf8')
  const hash = await sha256(combo)
  const jwkKey = keyToJwk(hash)
  return crypto.subtle.importKey('jwk', jwkKey, 'AES-GCM', false, [
    'encrypt',
    'decrypt'
  ])
}
