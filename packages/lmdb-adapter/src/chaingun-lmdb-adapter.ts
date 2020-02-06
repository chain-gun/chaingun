// tslint:disable: no-object-mutation no-let
import { diffGunCRDT, mergeGraph } from '@chaingun/crdt'
import {
  GunGetOpts,
  GunGraphAdapter,
  GunGraphData,
  GunNode
} from '@chaingun/types'
import { gzip, ungzip } from 'node-gzip'
import lmdb from 'node-lmdb'

const DEFAULT_DB_NAME = 'gun-nodes'
const EMPTY = {}

let WIDE_NODE_MARKER_BUFFER: Buffer
export const WIDE_NODE_MARKER = 'WIDE_NODE'
export const WIDE_NODE_THRESHOLD =
  parseInt(process.env.GUN_LMDB_WIDE_NODE_THRESHOLD || '', 10) || 1100
export const GET_MAX_KEYS =
  parseInt(process.env.GUN_LMDB_GET_MAX_KEYS || '', 10) ||
  Math.floor(WIDE_NODE_THRESHOLD + 10)

const USE_GZIP = !process.env.GUN_LMDB_DISABLE_GZIP

export const DEFAULT_CRDT_OPTS = {
  diffFn: diffGunCRDT,
  mergeFn: mergeGraph
}

export type LmdbOptions = any
export type LmdbEnv = any
export type LmdbDbi = any
export type LmdbTransaction = any

export function wideNodeKey(soul: string, key = ''): string {
  return `wide:${soul}/${key}`
}

async function boot(): Promise<void> {
  if (!WIDE_NODE_MARKER_BUFFER) {
    WIDE_NODE_MARKER_BUFFER = await compress(WIDE_NODE_MARKER)
  }
}

/**
 * Open a LMDB database as a Gun Graph Adapter
 *
 * @param opts same opts as node-lmdb.Env.open
 * @param name database name, defaults to "gun-nodes"
 * @returns a GunGraphAdapter that reads/writes to the LMDB database
 */
export function createGraphAdapter(
  opts: LmdbOptions,
  name = DEFAULT_DB_NAME
): GunGraphAdapter {
  const [env, dbi] = openEnvAndDbi(opts, name)
  return adapterFromEnvAndDbi(env, dbi)
}

/**
 * Create Gun Graph Adapter from open LMDB database
 *
 * @param env lmdb.Env object
 * @param dbi lmdb DBI object
 * @returns a GunGraphAdapter that reads/writes to the LMDB database
 */
export function adapterFromEnvAndDbi(
  env: lmdb.Env,
  dbi: LmdbDbi
): GunGraphAdapter {
  return {
    close: () => {
      env.close()
      dbi.close()
    },
    get: (soul: string, opts?: GunGetOpts) => getNode(env, dbi, soul, opts),
    getJsonString: (soul: string, opts?: GunGetOpts) =>
      getNodeJsonString(env, dbi, soul, opts),
    pruneChangelog: async (before: number) => pruneChangelog(env, dbi, before),
    put: (graphData: GunGraphData) => patchGraph(env, dbi, graphData)
  }
}

/**
 * Open a LMDB database
 *
 * @param opts same opts as node-lmdb.Env.open
 * @param name name of the LMDB database to open (defaults to "gun-nodes")
 */
export function openEnvAndDbi(
  opts: LmdbOptions,
  name = DEFAULT_DB_NAME
): readonly [LmdbEnv, LmdbDbi] {
  const env = new lmdb.Env()
  // tslint:disable-next-line: no-expression-statement
  env.open(opts)
  const dbi = env.openDbi({
    create: true,
    name
  })

  return [env, dbi]
}

/**
 * Serialize Gun Node data for writing to LMDB database
 *
 * @param node the GunNode to serialize
 */
export function serialize(node: GunNode): string {
  return JSON.stringify(node)
}

/**
 * Deserialize GunNode data read from the LMDB database
 *
 * @param data the string data to parse as a GunNode
 */
export function deserialize(data: string): GunNode {
  return data ? JSON.parse(data) : null
}

export async function compress(str: string): Promise<Buffer> {
  if (USE_GZIP) {
    return gzip(str)
  }

  return new Buffer(str)
}

export async function decompress(buffer?: Buffer | null): Promise<string> {
  if (!buffer) {
    return ''
  }

  if (USE_GZIP) {
    return (await ungzip(buffer)).toString()
  }
  return buffer.toString()
}

function isWideNode(rawVal: Buffer): boolean {
  if (rawVal && rawVal.equals(WIDE_NODE_MARKER_BUFFER)) {
    return true
  }

  return false
}

type RawWideNodeData = Record<string, Buffer>
type RawNodeData = null | Buffer | RawWideNodeData
type RawGraphData = Record<string, RawNodeData>

export function getRaw(
  env: LmdbEnv,
  dbi: LmdbDbi,
  soul: string,
  opts?: GunGetOpts
): RawNodeData {
  const txn: LmdbTransaction = env.beginTxn({ readOnly: true })
  try {
    const raw: Buffer | null = txn.getBinary(dbi, soul)

    if (!raw) {
      return null
    }

    if (isWideNode(raw)) {
      const result: Record<string, Buffer> = {}
      const cursor = new lmdb.Cursor(txn, dbi)
      const singleKey = opts && opts['.']
      const lexStart = (opts && opts['>']) || singleKey
      const lexEnd = (opts && opts['<']) || singleKey
      let keyCount = 0

      try {
        const base = wideNodeKey(soul)
        const startKey = lexStart
          ? wideNodeKey(soul, lexStart)
          : wideNodeKey(soul)
        let dbKey = cursor.goToRange(startKey)

        if (dbKey === startKey && lexStart && !singleKey) {
          // Exclusive lex?
          dbKey = cursor.goToNext()
        }

        while (dbKey && dbKey.indexOf(base) === 0) {
          const key = dbKey.replace(base, '')

          if (lexEnd && key > lexEnd) {
            break
          }

          result[key] = txn.getBinary(dbi, dbKey)
          dbKey = cursor.goToNext()
          keyCount++

          if (keyCount > GET_MAX_KEYS || (lexEnd && key === lexEnd)) {
            break
          }
        }
      } finally {
        cursor.close()
      }

      return result
    } else {
      return raw.length ? raw : null
    }
  } finally {
    txn.commit()
  }
}

export async function decodeRaw(
  soul: string,
  raw: RawNodeData,
  opts?: GunGetOpts
): Promise<GunNode | null> {
  if (raw instanceof Buffer) {
    const decompressed = await decompress(raw)
    const deserialized = deserialize(decompressed)

    if (opts) {
      const singleKey = opts && opts['.']
      const lexStart = (opts && opts['>']) || singleKey
      const lexEnd = (opts && opts['<']) || singleKey

      if (!(lexStart || lexEnd)) {
        return deserialized
      }

      const resultState: Record<string, number> = {}
      const result: any = {
        _: {
          '#': soul,
          '>': resultState
        }
      }

      const state = deserialized._['>']
      let keyCount = 0

      Object.keys(state).forEach(key => {
        if (
          lexStart &&
          key >= lexStart &&
          lexEnd &&
          key <= lexEnd &&
          key in state
        ) {
          result[key] = deserialized[key]
          resultState[key] = state[key]
          keyCount++
        }
      })

      return keyCount ? result : null
    }

    return deserialized
  } else if (raw !== null && typeof raw === 'object') {
    // wide node
    const rawKeys = raw as Record<string, Buffer>
    const stateVectors: Record<string, number> = {}
    const node: any = {
      _: {
        '#': soul,
        '>': stateVectors
      }
    }

    for (const key in rawKeys) {
      if (!key) {
        continue
      }

      const rawKey = rawKeys[key]
      if (!rawKey) {
        continue
      }
      const decompressed = await decompress(rawKey)
      const deserialized = JSON.parse(decompressed)

      if (deserialized) {
        const { stateVector, value } = deserialized
        stateVectors[key] = stateVector
        node[key] = value
      }
    }

    return node
  }

  return null
}

export async function getNode(
  env: LmdbEnv,
  dbi: LmdbDbi,
  soul: string,
  opts?: GunGetOpts
): Promise<GunNode | null> {
  await boot()
  const raw = getRaw(env, dbi, soul, opts)
  const decoded = await decodeRaw(soul, raw, opts)
  return decoded
}

export async function getNodeJsonString(
  env: LmdbEnv,
  dbi: LmdbDbi,
  soul: string,
  opts?: GunGetOpts
): Promise<string> {
  if (!soul) {
    return ''
  }
  const raw = getRaw(env, dbi, soul, opts)

  if (!raw) {
    return ''
  }

  if (opts || typeof raw === 'object') {
    return JSON.stringify(await getNode(env, dbi, soul, opts))
  }

  return decompress(raw)
}

export function getExistingRawTx(
  dbi: LmdbDbi,
  txn: LmdbTransaction,
  data: GunGraphData | RawGraphData
): RawGraphData {
  const existingData: RawGraphData = {}
  for (const soul in data) {
    if (!soul) {
      continue
    }

    const raw: Buffer | null = txn.getBinary(dbi, soul)

    if (!raw) {
      existingData[soul] = null
      continue
    }

    if (isWideNode(raw)) {
      const dataNode = data[soul]
      const rawNode: RawWideNodeData = {}

      for (const key in dataNode) {
        if (!key || key === '_') {
          continue
        }
        const dbKey = wideNodeKey(soul, key)
        rawNode[key] = txn.getBinary(dbi, dbKey)
      }

      existingData[soul] = rawNode
    } else {
      existingData[soul] = raw.length ? raw : null
    }
  }

  return existingData
}

export function getExistingRaw(
  env: LmdbEnv,
  dbi: LmdbDbi,
  data: GunGraphData
): RawGraphData {
  const txn: LmdbTransaction = env.beginTxn({ readOnly: true })

  try {
    return getExistingRawTx(dbi, txn, data)
  } finally {
    txn.commit()
  }
}

export async function getPatchDiff(
  env: LmdbEnv,
  dbi: LmdbDbi,
  data: GunGraphData,
  opts = DEFAULT_CRDT_OPTS
): Promise<null | {
  readonly diff: GunGraphData
  readonly existing: RawGraphData
  readonly toWrite: RawGraphData
}> {
  const { diffFn = diffGunCRDT, mergeFn = mergeGraph } = opts
  const existingRaw = getExistingRaw(env, dbi, data)
  const existing: any = {}

  for (const soul in existingRaw) {
    if (!soul) {
      continue
    }

    const node = await decodeRaw(soul, existingRaw[soul])

    if (node) {
      existing[soul] = node
    }
  }

  const graphDiff = diffFn(data, existing)

  if (!graphDiff || !Object.keys(graphDiff).length) {
    return null
  }

  const existingFromDiff: any = {}
  const existingRawFromDiff: RawGraphData = {}

  for (const soul in graphDiff) {
    if (!soul) {
      continue
    }

    existingFromDiff[soul] = existing[soul]

    const existingRawNode = existingRaw[soul]

    if (existingRawNode && !(existingRawNode instanceof Buffer)) {
      const diffNode = graphDiff[soul]
      const existingRawWideNode: RawWideNodeData = {}
      for (const key in diffNode) {
        if (!key || key === '_') {
          continue
        }
        existingRawWideNode[key] = existingRawNode[key]
      }
      existingRawFromDiff[soul] = existingRawWideNode
    } else {
      existingRawFromDiff[soul] = existingRawNode
    }
  }

  const updatedGraph = mergeFn(existingFromDiff, graphDiff, 'mutable')
  const updatedRaw = await graphToRaw(updatedGraph, existingRaw)

  return {
    diff: graphDiff,
    existing: existingRawFromDiff,
    toWrite: updatedRaw
  }
}

export async function patchGraphFull(
  env: LmdbEnv,
  dbi: LmdbDbi,
  data: GunGraphData,
  opts = DEFAULT_CRDT_OPTS
): Promise<GunGraphData | null> {
  await boot()

  while (true) {
    const patchDiffData = await getPatchDiff(env, dbi, data, opts)
    if (!patchDiffData) {
      return null
    }
    const { diff, existing, toWrite } = patchDiffData

    if (await writeRawGraph(env, dbi, toWrite, existing)) {
      return diff
    }

    // tslint:disable-next-line: no-console
    console.warn('unsuccessful patch, retrying', Object.keys(diff))
  }
}

export async function patchGraph(
  env: LmdbEnv,
  dbi: LmdbDbi,
  data: GunGraphData,
  opts = DEFAULT_CRDT_OPTS
): Promise<GunGraphData | null> {
  const diff: any = {}

  for (const soul in data) {
    if (!soul) {
      continue
    }

    const nodeDiff = await patchGraphFull(
      env,
      dbi,
      {
        [soul]: data[soul]
      },
      opts
    )

    if (nodeDiff) {
      diff[soul] = nodeDiff[soul]
    }
  }

  return Object.keys(diff).length ? diff : null
}

export function writeRawGraphTx(
  dbi: LmdbDbi,
  txn: LmdbTransaction,
  data: RawGraphData,
  existing: RawGraphData
): boolean {
  const currentRaw = getExistingRawTx(dbi, txn, existing)

  for (const soul in existing) {
    if (!soul) {
      continue
    }

    const currentRawNode = currentRaw[soul]
    const existingRawNode = existing[soul]

    if (existingRawNode === null) {
      if (currentRawNode === null) {
        continue
      }
      return false
    } else if (existingRawNode instanceof Buffer) {
      if (!(currentRawNode instanceof Buffer)) {
        return false
      }

      if (!existingRawNode.equals(currentRawNode)) {
        return false
      }
    } else {
      // Wide node
      if (!currentRawNode || currentRawNode instanceof Buffer) {
        return false
      }

      for (const key in existingRawNode) {
        if (!key) {
          continue
        }
        const existingKeyData = existingRawNode[key]
        const currentKeyData = currentRawNode[key]

        if (existingKeyData === currentKeyData) {
          continue
        } else if (
          existingKeyData instanceof Buffer &&
          currentKeyData instanceof Buffer &&
          existingKeyData.equals(currentKeyData)
        ) {
          continue
        }

        return false
      }
    }
  }

  for (const soul in data) {
    if (!soul) {
      continue
    }

    const nodeToWrite = data[soul]

    if (!nodeToWrite) {
      // TODO txn.del(soul)?
      continue
    }

    if (nodeToWrite instanceof Buffer) {
      txn.putBinary(dbi, soul, nodeToWrite)
    } else if (typeof nodeToWrite === 'object') {
      txn.putBinary(dbi, soul, WIDE_NODE_MARKER_BUFFER)

      for (const key in nodeToWrite) {
        if (!key) {
          continue
        }

        const dbKey = wideNodeKey(soul, key)
        const wideValBuffer = nodeToWrite[key]

        if (!wideValBuffer) {
          // TODO: txn.del(dbKey)?
          continue
        }

        txn.putBinary(dbi, dbKey, wideValBuffer)
      }
    }
  }

  return true
}

export function writeRawGraph(
  env: LmdbEnv,
  dbi: LmdbDbi,
  data: RawGraphData,
  existing: RawGraphData
): boolean {
  const txn: LmdbTransaction = env.beginTxn()

  try {
    const result = writeRawGraphTx(dbi, txn, data, existing)
    if (result) {
      txn.commit()
      return true
    } else {
      txn.abort()
      return false
    }
  } catch (e) {
    txn.abort()
    throw e
  }
}

export async function graphToRaw(
  graph: GunGraphData,
  existing: RawGraphData
): Promise<RawGraphData> {
  const result: RawGraphData = {}

  for (const soul in graph) {
    if (!soul) {
      continue
    }

    const node = graph[soul]

    if (!node) {
      continue
    }

    const existingRawNode = existing[soul]
    const isWide =
      (existingRawNode &&
        typeof existingRawNode === 'object' &&
        !(existingRawNode instanceof Buffer)) ||
      soul === 'changelog' ||
      soul.slice(0, 6) === 'peers/' ||
      Object.keys(node || EMPTY).length > WIDE_NODE_THRESHOLD

    if (isWide) {
      const rawWideNode: RawWideNodeData = {}
      const stateVectors = node._['>']
      for (const key in node) {
        if (!key || key === '_') {
          continue
        }
        const wideNodeVal = { stateVector: stateVectors[key], value: node[key] }
        rawWideNode[key] = await compress(JSON.stringify(wideNodeVal))
      }
      result[soul] = rawWideNode
    } else {
      result[soul] = await compress(serialize(node))
    }
  }

  return result
}

export function pruneChangelog(
  env: LmdbEnv,
  dbi: LmdbDbi,
  before: number
): void {
  const txn: LmdbTransaction = env.beginTxn()
  try {
    const cursor = new lmdb.Cursor(txn, dbi)
    const lexEnd = new Date(before).toISOString()
    const soul = 'changelog'

    try {
      const base = wideNodeKey(soul)
      const endKey = wideNodeKey(soul, lexEnd)
      // tslint:disable-next-line: no-let
      let dbKey = cursor.goToRange(endKey)
      dbKey = cursor.goToPrev()

      while (dbKey && dbKey.indexOf(base) === 0) {
        const key = dbKey.replace(base, '')
        if (key) {
          txn.del(dbi, dbKey)
        }
        dbKey = cursor.goToPrev()
      }
    } finally {
      cursor.close()
    }

    txn.commit()
  } catch (e) {
    txn.abort()
    throw e
  }
}

type GunTransactionFunction = (adapter: GunGraphAdapter) => Promise<void>

export async function gunTransaction(
  env: LmdbEnv,
  dbi: LmdbDbi,
  txFn: GunTransactionFunction,
  crdtOpts = DEFAULT_CRDT_OPTS
): Promise<GunGraphData | null> {
  const { diffFn = diffGunCRDT, mergeFn = mergeGraph } = crdtOpts

  while (true) {
    const rawGraph: RawGraphData = {}
    const readGraph: any = {}
    let graphToWrite: any = {}

    const adapter: GunGraphAdapter = {
      async get(soul: string, opts?: GunGetOpts): Promise<GunNode | null> {
        if (soul in readGraph) {
          return readGraph[soul]
        }

        // TODO handling/merging? of opts limited gets

        rawGraph[soul] = getRaw(env, dbi, soul, opts)
        return (readGraph[soul] = await decodeRaw(soul, rawGraph[soul], opts))
      },

      putSync(graph: GunGraphData): null {
        const putDiff = diffFn(graph, graphToWrite)
        if (putDiff) {
          graphToWrite = mergeFn(graphToWrite, putDiff, 'mutable')
        }
        return null
      },

      async put(graph: GunGraphData): Promise<null> {
        return adapter.putSync!(graph) as null
      }
    }

    await txFn(adapter)

    const patchDiffData = await getPatchDiff(env, dbi, graphToWrite, crdtOpts)
    if (!patchDiffData) {
      return null
    }
    const { diff, toWrite } = patchDiffData

    if (await writeRawGraph(env, dbi, toWrite, rawGraph)) {
      return diff
    }

    // tslint:disable-next-line: no-console
    console.warn('unsuccessful transaction, retrying', Object.keys(diff))
  }
}
