// tslint:disable: no-object-mutation no-let
import { diffGunCRDT, mergeGraph } from '@chaingun/crdt'
import { GunGetOpts, GunGraphData, GunNode } from '@chaingun/types'
import lmdb from 'node-lmdb'
import {
  compress,
  decompress,
  DEFAULT_CRDT_OPTS,
  deserialize,
  GET_MAX_KEYS,
  LmdbDbi,
  LmdbEnv,
  LmdbTransaction,
  serialize,
  WIDE_NODE_MARKER,
  WIDE_NODE_THRESHOLD,
  wideNodeKey
} from './chaingun-lmdb-adapter'

const EMPTY = {}

let WIDE_NODE_MARKER_BUFFER: Buffer

function isWideNode(rawVal: Buffer): boolean {
  if (rawVal && rawVal.equals(WIDE_NODE_MARKER_BUFFER)) {
    return true
  }

  return false
}

async function boot(): Promise<void> {
  if (!WIDE_NODE_MARKER_BUFFER) {
    WIDE_NODE_MARKER_BUFFER = await compress(WIDE_NODE_MARKER)
  }
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
      // TODO
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

      // tslint:disable-next-line: no-object-mutation
      existingData[soul] = rawNode
    } else {
      // tslint:disable-next-line: no-object-mutation
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

  if (!graphDiff) {
    return null
  }

  const updatedGraph = mergeFn(existing, graphDiff, 'mutable')
  const updatedRaw = await graphToRaw(updatedGraph, existingRaw)

  return {
    diff: graphDiff,
    existing: existingRaw,
    toWrite: updatedRaw
  }
}

export async function patchGraph(
  env: LmdbEnv,
  dbi: LmdbDbi,
  data: GunGraphData,
  opts = DEFAULT_CRDT_OPTS
): Promise<GunGraphData | null> {
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
    console.warn('unsuccessful patch, retrying', patchDiffData)
  }
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
      (existingRawNode && typeof existingRawNode === 'object') ||
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
