import { GunProcessQueue } from '@chaingun/control-flow'
import { diffGunCRDT, mergeGraph } from '@chaingun/crdt'
import {
  GunGetOpts,
  GunGraphAdapter,
  GunGraphData,
  GunNode,
  GunValue
} from '@chaingun/types'
import { gzip, ungzip } from 'node-gzip'
import lmdb from 'node-lmdb'

const DEFAULT_DB_NAME = 'gun-nodes'
const WIDE_NODE_MARKER = 'WIDE_NODE'
const WIDE_NODE_THRESHOLD =
  parseInt(process.env.GUN_LMDB_WIDE_NODE_THRESHOLD || '', 10) || 1100
const GET_MAX_KEYS =
  parseInt(process.env.GUN_LMDB_GET_MAX_KEYS || '', 10) || 10000

const USE_GZIP = !process.env.GUN_LMDB_DISABLE_GZIP

const DEFAULT_CRDT_OPTS = {
  diffFn: diffGunCRDT,
  mergeFn: mergeGraph
}

type LmdbOptions = any
type LmdbEnv = any
type LmdbDbi = any
type LmdbTransaction = any

export function wideNodeKey(soul: string, key = ''): string {
  return `wide:${soul}/${key}`
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

type WriteTransaction = readonly [
  () => Promise<any>,
  (res: any) => void,
  (err: Error) => void
]

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
  const writeQueue = new GunProcessQueue<WriteTransaction>(
    'LMDB Write Queue',
    'process_dupes'
  )

  const readQueue = new GunProcessQueue<WriteTransaction>(
    'LMDB Read Queue',
    'process_dupes'
  )

  async function processTransaction(
    item: WriteTransaction
  ): Promise<WriteTransaction> {
    const [tx, ok, fail] = item
    try {
      ok(await tx())
    } catch (e) {
      fail(e)
    }
    return item
  }

  writeQueue.middleware.use(processTransaction)
  readQueue.middleware.use(processTransaction)

  return {
    close: () => {
      env.close()
      dbi.close()
    },
    get: (soul: string, opts?: GunGetOpts) =>
      get(readQueue, env, dbi, soul, opts),
    getJsonString: (soul: string, opts?: GunGetOpts) =>
      getJsonString(readQueue, env, dbi, soul, opts),
    pruneChangelog: async (before: number) =>
      pruneChangelog(writeQueue, env, dbi, before),
    put: (graphData: GunGraphData) => put(writeQueue, env, dbi, graphData)
  }
}

export async function readWideNode(
  dbi: LmdbDbi,
  txn: LmdbTransaction,
  soul: string,
  opts?: GunGetOpts
): Promise<GunNode> {
  const stateVectors: Record<string, number> = {}
  const node: any = {
    _: {
      '#': soul,
      '>': stateVectors
    }
  }
  const cursor = new lmdb.Cursor(txn, dbi)
  const singleKey = opts && opts['.']
  const lexStart = (opts && opts['>']) || singleKey
  const lexEnd = (opts && opts['<']) || singleKey
  // tslint:disable-next-line: no-let
  let keyCount = 0

  try {
    const base = wideNodeKey(soul)
    const startKey = lexStart ? wideNodeKey(soul, lexStart) : wideNodeKey(soul)
    // tslint:disable-next-line: no-let
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

      const { stateVector, value } = await readWideNodeKey(dbi, txn, soul, key)

      if (stateVector) {
        // tslint:disable-next-line: no-object-mutation
        stateVectors[key] = stateVector
        // tslint:disable-next-line: no-object-mutation
        node[key] = value
        keyCount++
      }

      dbKey = cursor.goToNext()

      if (keyCount > GET_MAX_KEYS || (lexEnd && key === lexEnd)) {
        break
      }
    }
  } catch (e) {
    throw e
  } finally {
    cursor.close()
  }

  return keyCount ? node : null
}

/**
 * Load Gun Node data from a LMDB database synchronously
 *
 * @param env lmdb.Env object
 * @param dbi lmdb DBI object
 * @param soul the unique identifier of the node to fetch
 */
export async function get(
  queue: GunProcessQueue<WriteTransaction>,
  env: LmdbEnv,
  dbi: LmdbDbi,
  soul: string,
  opts?: GunGetOpts
): Promise<GunNode | null> {
  if (!soul) {
    return null
  }

  return transaction<GunNode | null>(
    queue,
    env,
    async txn => {
      const raw = await decompress(txn.getBinaryUnsafe(dbi, soul))

      if (raw === WIDE_NODE_MARKER) {
        return readWideNode(dbi, txn, soul, opts)
      }

      const node = deserialize(raw)

      if (node && opts) {
        const singleKey = opts && opts['.']
        const lexStart = (opts && opts['>']) || singleKey
        const lexEnd = (opts && opts['<']) || singleKey

        if (!(lexStart || lexEnd)) {
          return node
        }

        const resultState: Record<string, number> = {}
        const result: any = {
          _: {
            '#': soul,
            '>': resultState
          }
        }

        const state = node._['>']
        // tslint:disable-next-line: no-let
        let keyCount = 0
        Object.keys(state).forEach(key => {
          if (
            lexStart &&
            key >= lexStart &&
            lexEnd &&
            key <= lexEnd &&
            key in state
          ) {
            // tslint:disable-next-line: no-object-mutation
            result[key] = node[key]
            // tslint:disable-next-line: no-object-mutation
            resultState[key] = state[key]
            keyCount++
          }
        })

        return keyCount ? result : null
      }

      return node
    },
    {
      readOnly: true
    }
  )
}

/**
 * Load Gun Node data as a string from a LMDB database synchronously
 *
 * @param env lmdb.Env object
 * @param dbi lmdb DBI object
 * @param soul the unique identifier of the node to fetch
 */
export async function getJsonString(
  queue: GunProcessQueue<WriteTransaction>,
  env: LmdbEnv,
  dbi: LmdbDbi,
  soul: string,
  opts?: GunGetOpts
): Promise<string> {
  if (!soul) {
    return ''
  }

  if (opts) {
    return JSON.stringify(await get(queue, env, dbi, soul, opts))
  }

  return transaction<string>(
    queue,
    env,
    async txn => {
      const raw = await decompress(txn.getBinaryUnsafe(dbi, soul))

      if (raw === WIDE_NODE_MARKER) {
        return JSON.stringify(readWideNode(dbi, txn, soul))
      }

      return raw
    },
    {
      readOnly: true
    }
  )
}

export async function putNode(
  dbi: LmdbDbi,
  txn: LmdbTransaction,
  soul: string,
  node: GunNode | undefined,
  updated: GunNode,
  opts = DEFAULT_CRDT_OPTS
): Promise<GunNode | null> {
  const { diffFn = diffGunCRDT, mergeFn = mergeGraph } = opts
  const existingGraph = { [soul]: node }
  const graphUpdates = { [soul]: updated }
  const graphDiff = diffFn(graphUpdates, existingGraph)
  const nodeDiff = graphDiff && graphDiff[soul]
  if (!nodeDiff || !graphDiff) {
    return null
  }

  const updatedGraph = mergeFn(existingGraph, graphDiff)
  const result = updatedGraph[soul]

  if (
    result &&
    (Object.keys(result).length >= WIDE_NODE_THRESHOLD ||
      soul === 'changelog' ||
      soul.slice(0, 6) === 'peers/')
  ) {
    // tslint:disable-next-line: no-console
    console.log('converting to wide node', soul)
    const buffer = await compress(WIDE_NODE_MARKER)
    txn.putBinary(dbi, soul, buffer)
    await putWideNode(dbi, txn, soul, result, opts)
  } else {
    // tslint:disable-next-line: no-expression-statement
    const raw = await compress(serialize(result!))

    txn.putBinary(dbi, soul, raw)
  }

  return nodeDiff
}

export async function readWideNodeKey(
  dbi: LmdbDbi,
  txn: LmdbTransaction,
  soul: string,
  key: string
): Promise<{
  readonly stateVector?: number
  readonly value?: GunValue
}> {
  const dbKey = wideNodeKey(soul, key)
  const raw = await decompress(txn.getBinaryUnsafe(dbi, dbKey))

  if (!raw) {
    return {
      stateVector: undefined,
      value: undefined
    }
  }

  const { stateVector, value } = JSON.parse(raw) || {}

  return {
    stateVector,
    value
  }
}

export async function putWideNode(
  dbi: LmdbDbi,
  txn: LmdbTransaction,
  soul: string,
  updated: GunNode,
  opts = DEFAULT_CRDT_OPTS
): Promise<GunNode | null> {
  const { diffFn = diffGunCRDT } = opts
  const stateVectors: Record<string, number> = {}
  const existingNode: any = {
    _: {
      '#': soul,
      '>': stateVectors
    }
  }

  for (const key in updated) {
    if (!key) {
      continue
    }

    const { stateVector, value } = await readWideNodeKey(dbi, txn, soul, key)

    if (stateVector) {
      // tslint:disable-next-line: no-object-mutation
      stateVectors[key] = stateVector
      // tslint:disable-next-line: no-object-mutation
      existingNode[key] = value
    }
  }

  const existingGraph = { [soul]: existingNode }
  const graphUpdates = { [soul]: updated }
  const graphDiff = diffFn(graphUpdates, existingGraph)
  const nodeDiff = graphDiff && graphDiff[soul]

  if (!nodeDiff) {
    return null
  }

  for (const key in nodeDiff) {
    if (!key) {
      continue
    }

    const rawData = JSON.stringify({
      stateVector: nodeDiff._['>'][key],
      value: nodeDiff[key]
    })

    const buffer = await compress(rawData)
    txn.putBinary(dbi, wideNodeKey(soul, key), buffer)
  }

  return nodeDiff
}

export function pruneChangelog(
  queue: GunProcessQueue<WriteTransaction>,
  env: LmdbEnv,
  dbi: LmdbDbi,
  before: number
): Promise<void> {
  return transaction<void>(queue, env, txn => {
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
    } catch (e) {
      throw e
    } finally {
      cursor.close()
    }
  })
}

/**
 * Write Gun Graph data to the LMDB database synchronously
 *
 * @param env lmdb.Env object
 * @param dbi lmdb DBI object
 * @param graphData the Gun Graph data to write
 * @param opts
 */
export async function put(
  queue: GunProcessQueue<WriteTransaction>,
  env: LmdbEnv,
  dbi: LmdbDbi,
  graphData: GunGraphData,
  opts = DEFAULT_CRDT_OPTS
): Promise<GunGraphData | null> {
  if (!graphData) {
    return null
  }

  const diff: GunGraphData = {}
  // tslint:disable-next-line: no-let
  let hasDiff = false

  return transaction(queue, env, async txn => {
    for (const soul in graphData) {
      if (!soul || !graphData[soul]) {
        continue
      }

      const raw = await decompress(txn.getBinaryUnsafe(dbi, soul))

      // tslint:disable-next-line: no-let
      let nodeDiff = null

      if (raw === WIDE_NODE_MARKER) {
        nodeDiff = await putWideNode(dbi, txn, soul, graphData[soul]!, opts)
      } else {
        const node = deserialize(raw) || undefined
        nodeDiff = await putNode(dbi, txn, soul, node, graphData[soul]!, opts)
      }

      if (nodeDiff) {
        // @ts-ignore
        // tslint:disable-next-line
        diff[soul] = nodeDiff
        // tslint:disable-next-line: no-expression-statement
        hasDiff = true
      }
    }

    return hasDiff ? diff : null
  })
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
 * Execute a transaction on a LMDB database
 *
 * @param queue: Write Transaction Queue
 * @param env lmdb.Env object
 * @param fn This function is passed the transaction and is expected to return synchronously
 * @param opts options for the LMDB transaction passed to beginTxn
 */
export async function transaction<T = any>(
  queue: GunProcessQueue<WriteTransaction>,
  env: LmdbEnv,
  fn: (txn: LmdbTransaction) => Promise<T> | T,
  opts?: any
): Promise<T> {
  async function execute(): Promise<T> {
    const txn: LmdbTransaction = env.beginTxn(opts)
    // tslint:disable-next-line: no-let
    let result: T
    try {
      result = await fn(txn)
      txn.commit()
      return result
    } catch (e) {
      // tslint:disable-next-line: no-console
      console.error('lmdb transaction error', e.stack || e)
      txn.abort()
      throw e
    }
  }

  const promise = new Promise<T>((ok, fail) => {
    queue.enqueue([execute, ok, fail])
    queue.process()
  })

  return promise
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
