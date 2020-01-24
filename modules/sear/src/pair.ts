import { ecdh, ecdsa } from './settings'
import { crypto } from './shims'

export async function pair(_opt?: any): Promise<{
  readonly epriv: string
  readonly epub: string
  readonly priv: string
  readonly pub: string
}> {
  const signKeys = await crypto.subtle.generateKey(ecdsa.pair, true, [
    'sign',
    'verify'
  ])
  const signPub = await crypto.subtle.exportKey('jwk', signKeys.publicKey)
  const sa = {
    priv: (await crypto.subtle.exportKey('jwk', signKeys.privateKey)).d,
    pub: `${signPub.x}.${signPub.y}`
  }

  const cryptKeys = await crypto.subtle.generateKey(ecdh, true, ['deriveKey'])
  const cryptPub = await crypto.subtle.exportKey('jwk', cryptKeys.publicKey)
  const dh = {
    epriv: (await crypto.subtle.exportKey('jwk', cryptKeys.privateKey)).d,
    epub: `${cryptPub.x}.${cryptPub.y}`
  }

  return {
    epriv: dh.epriv || '',
    epub: dh.epub,
    priv: sa.priv || '',
    pub: sa.pub
  }
}
