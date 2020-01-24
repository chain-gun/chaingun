import { decrypt } from './decrypt'
import { work } from './work'

const DEFAULT_OPTS = {}

export async function authenticateAccount(
  ident: any,
  password: string,
  encoding = 'base64'
): Promise<
  | undefined
  | {
      readonly alias: string
      readonly epriv: string
      readonly epub: string
      readonly priv: string
      readonly pub: string
    }
> {
  if (!ident || !ident.auth) {
    return
  }

  // tslint:disable-next-line: no-let
  let decrypted: any
  try {
    const proof = await work(password, ident.auth.s, { encode: encoding })
    decrypted = await decrypt(ident.auth.ek, proof, {
      encode: encoding
    })
  } catch (err) {
    const proof = await work(password, ident.auth.s, { encode: 'utf8' })
    decrypted = await decrypt(ident.auth.ek, proof, {
      encode: encoding
    })
  }

  if (!decrypted) {
    return
  }

  return {
    alias: ident.alias as string,
    epriv: decrypted.epriv as string,
    epub: ident.epub as string,
    priv: decrypted.priv as string,
    pub: ident.pub as string
  }
}

export async function authenticateIdentity(
  chaingun: any,
  soul: string,
  password: string,
  encoding = 'base64'
): Promise<
  | undefined
  | {
      readonly alias: string
      readonly epriv: string
      readonly epub: string
      readonly priv: string
      readonly pub: string
    }
> {
  const ident = await chaingun.get(soul).then()
  return authenticateAccount(ident, password, encoding)
}

export async function authenticate(
  chaingun: any,
  alias: string,
  password: string,
  _opt = DEFAULT_OPTS
): Promise<{
  readonly alias: string
  readonly epriv: string
  readonly epub: string
  readonly priv: string
  readonly pub: string
}> {
  const aliasSoul = `~@${alias}`
  const idents = await chaingun.get(aliasSoul).then()
  for (const soul in idents || {}) {
    if (soul === '_') {
      continue
    }

    // tslint:disable-next-line: no-let
    let pair

    try {
      pair = await authenticateIdentity(chaingun, soul, password)
    } catch (e) {
      // tslint:disable-next-line: no-console
      console.warn(e.stack || e)
    }

    if (pair) {
      return pair
    }
  }

  throw new Error('Wrong alias or password.')
}
