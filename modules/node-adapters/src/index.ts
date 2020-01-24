import { GunGraphAdapter } from '@chaingun/types'

export default function createAdapter(): GunGraphAdapter {
  const HTTP_URL = process.env.GUN_HTTP_URL || ''
  const LMDB_PATH = process.env.GUN_LMDB_PATH || ''
  const LMDB_MAP_SIZE =
    parseInt(process.env.GUN_LMDB_MAP_SIZE || '', 0) || 1024 ** 3

  if (LMDB_PATH) {
    return require('@chaingun/lmdb-adapter').createGraphAdapter({
      mapSize: LMDB_MAP_SIZE,
      path: LMDB_PATH
    })
  } else if (HTTP_URL) {
    return require('@chaingun/http-adapter').createGraphAdapter(HTTP_URL)
  }

  // tslint:disable-next-line: no-console
  console.warn('Falling back on in-memory storage NO PERSISTENCE')
  return require('@chaingun/memory-adapter').createMemoryAdapter()
}
