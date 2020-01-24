import { pair as createPair } from '../src/pair'
import { encrypt } from '../src/encrypt'
import { decrypt } from '../src/decrypt'

describe('encrypt', () => {
  it('encrypts data that can be decrypted', async () => {
    const pair = await createPair()
    const data = 'foo'
    const ciphertext = (await encrypt(data, pair.epriv)) as string
    expect(await decrypt(ciphertext, pair.epriv)).toBe(data)
  })
})
