import { pair as createPair } from '../src/pair'
import { sign } from '../src/sign'
import { verify } from '../src/verify'

describe('sign', () => {
  it('signs data that can be verified', async () => {
    const pair = await createPair()
    const otherPair = await createPair()
    const data = 'foo'
    const signed = await sign(data, pair)
    expect(await verify(signed, pair.pub)).toBe(true)
    expect(await verify(signed, otherPair.pub)).toBe(false)
  })
})
