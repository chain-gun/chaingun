import { encrypt } from './encrypt'
import { pair as createPair } from './pair'
import { pseudoRandomText } from './pseudoRandomText'
import { signGraph } from './sign'
import { work } from './work'

// TODO: refactor to not require chaingun
export async function createUser(
  chaingun: any,
  alias: string,
  password: string
): Promise<{
  readonly alias: string
  readonly auth: string
  readonly epub: string
  readonly pub: string
  readonly epriv: string
  readonly priv: string
}> {
  const aliasSoul = `~@${alias}`

  // "pseudo-randomly create a salt, then use PBKDF2 function to extend the password with it."
  const salt = pseudoRandomText(64)
  const proof = await work(password, salt)
  const pair = await createPair()
  const { pub, priv, epub, epriv } = pair
  const pubSoul = `~${pub}`

  // "to keep the private key safe, we AES encrypt it with the proof of work!"
  const ek = await encrypt(JSON.stringify({ priv, epriv }), proof, {
    raw: true
  })
  const auth = JSON.stringify({ ek, s: salt })
  const data = {
    alias,
    auth,
    epub,
    pub
  }

  const now = new Date().getTime()

  const graph = await signGraph(
    {
      [pubSoul]: {
        _: {
          '#': pubSoul,
          '>': Object.keys(data).reduce(
            // tslint:disable-next-line: readonly-keyword
            (state: { [key: string]: number }, key) => {
              // tslint:disable-next-line: no-object-mutation
              state[key] = now
              return state
            },
            {}
          )
        },
        ...data
      }
    },
    { pub, priv }
  )

  await new Promise(ok => chaingun.get(aliasSoul).put(graph, ok))

  return {
    ...data,
    epriv,
    priv,
    pub
  }
}
