import { ecdsa, jwk, parse } from './settings'
import { sha256 } from './sha256'
import { Buffer, crypto } from './shims'
import { pubFromSoul } from './soul'
import { verify } from './verify'

const DEFAULT_OPTS: {
  readonly encode?: string
  readonly raw?: boolean
  readonly check?: {
    readonly m: any
    readonly s: string
  }
} = {
  encode: 'base64'
}

export function prep(
  val: any,
  key: string,
  node: GunNode,
  soul: string
): {
  readonly '#': string
  readonly '.': string
  readonly ':': GunValue
  readonly '>': number
} {
  // prep for signing
  return {
    '#': soul,
    '.': key,
    ':': parse(val),
    '>': (node && node._ && node._['>'] && node._['>'][key]) || 0
  }
}

export async function hashForSignature(prepped: any): Promise<string> {
  const hash = await sha256(
    typeof prepped === 'string' ? prepped : JSON.stringify(prepped)
  )
  return hash.toString('hex')
}

export function hashNodeKey(node: GunNode, key: string): Promise<string> {
  const val = node && node[key]
  const parsed = parse(val)
  const soul = node && node._ && node._['#']
  const prepped = prep(parsed, key, node, soul)
  return hashForSignature(prepped)
}

export async function signHash(
  hash: string,
  pair: { readonly pub: string; readonly priv: string },
  encoding = DEFAULT_OPTS.encode
): Promise<string> {
  const { pub, priv } = pair
  const token = jwk(pub, priv)
  const signKey = await crypto.subtle.importKey(
    'jwk',
    token,
    ecdsa.pair,
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign(
    ecdsa.sign,
    signKey,
    new Uint8Array(Buffer.from(hash, 'hex'))
  )
  const res = Buffer.from(sig, 'binary').toString(encoding)
  return res
}

export async function sign(
  data: string,
  pair: { readonly pub: string; readonly priv: string },
  opt = DEFAULT_OPTS
): Promise<string | { readonly m: any; readonly s: string }> {
  if (typeof data === 'undefined') {
    throw new Error('`undefined` not allowed.')
  }
  const json = parse(data)
  const encoding = opt.encode || DEFAULT_OPTS.encode
  const checkData = opt.check || json

  if (
    json &&
    ((json.s && json.m) || (json[':'] && json['~'])) &&
    (await verify(data, pair.pub))
  ) {
    // already signed
    const parsed = parse(checkData)
    if (opt.raw) {
      return parsed
    }
    return 'SEA' + JSON.stringify(parsed)
  }

  const hash = await hashForSignature(data)
  const sig = await signHash(hash, pair, encoding)
  const r = {
    m: json,
    s: sig
  }
  if (opt.raw) {
    return r
  }
  return 'SEA' + JSON.stringify(r)
}

export async function signNodeValue(
  node: GunNode,
  key: string,
  pair: { readonly pub: string; readonly priv: string },
  _encoding = DEFAULT_OPTS.encode
): Promise<{
  readonly ':': GunValue
  readonly '~': string
}> {
  const data = node[key]
  const json = parse(data)

  if (data && json && ((json.s && json.m) || (json[':'] && json['~']))) {
    // already signed
    return json
  }

  const hash = await hashNodeKey(node, key)
  const sig = await signHash(hash, pair)
  return {
    ':': parse(node[key]),
    '~': sig
  }
}

export async function signNode(
  node: GunNode,
  pair: { readonly pub: string; readonly priv: string },
  encoding = DEFAULT_OPTS.encode
): Promise<GunNode> {
  const signedNode: GunNode = {
    _: node._
  }
  const soul = node._ && node._['#']

  for (const key in node) {
    if (key === '_') {
      continue
    }
    if (key === 'pub' /*|| key === "alias"*/ && soul === `~${pair.pub}`) {
      // Special case
      // @ts-ignore
      // tslint:disable-next-line: no-object-mutation
      signedNode[key] = node[key]
      continue
    }
    // @ts-ignore
    // tslint:disable-next-line: no-object-mutation
    signedNode[key] = JSON.stringify(
      await signNodeValue(node, key, pair, encoding)
    )
  }
  return signedNode
}

export async function signGraph(
  graph: GunGraphData,
  pair: { readonly pub: string; readonly priv: string },
  encoding = DEFAULT_OPTS.encode
): Promise<GunGraphData> {
  const modifiedGraph = { ...graph }
  for (const soul in graph) {
    if (!soul) {
      continue
    }

    const soulPub = pubFromSoul(soul)
    if (soulPub !== pair.pub) {
      continue
    }
    const node = graph[soul]
    if (!node) {
      continue
    }
    // tslint:disable-next-line: no-object-mutation
    modifiedGraph[soul] = await signNode(node, pair, encoding)
  }
  return modifiedGraph
}

export function graphSigner(
  pair: { readonly pub: string; readonly priv: string },
  encoding = DEFAULT_OPTS.encode
): (graph: GunGraphData) => Promise<GunGraphData> {
  return (graph: GunGraphData) => signGraph(graph, pair, encoding)
}
