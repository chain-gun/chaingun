    // tslint:disable
    import * as R from 'ramda'
const { ZalgoPromise } = require('zalgo-promise')
export const Promise = ZalgoPromise
export const { all, resolve } = ZalgoPromise

const nodeKeys = (obj: any) =>
  Object.keys(obj || {}).filter(key => key && key !== '_' && key !== '#')

export const nowOr = R.curry((defaultValue, promise) => {
  let result
  let resolved

  promise.then((res: any) => {
    resolved = true
    result = res
  })
  return resolved ? result : defaultValue
})

export const now = nowOr(undefined)

const node = (scope: any, soul: string) =>
  new ZalgoPromise((ok: Function, fail: Function) => {
    const known = scope.known(soul)

    if (typeof known !== 'undefined') ok(known)
    scope
      .fetch(soul)
      .then(() => scope.known(soul))
      .then(ok)
      .catch(fail)
  })

const edge = (scope: any, key: string, parentaccess: Promise<any>) =>
  parentaccess.then(data => {
    const soul = R.path([key, '#'], data)
    const val = R.prop(key, data)

    return soul ? scope.get(soul).then() : val
  })

const access = (scope: any, key: any, paccess: null | any = null) => {
  if (!key || key === []) throw new Error(`bad key ${key}`)
  let thisaccess: any
  const accesses: any = {}
  const get = (gKey: string) =>
    accesses[gKey] || (accesses[gKey] = access(scope, gKey, thisaccess))
  const then = (fn: Function) =>
    (paccess ? edge : node)(scope, key, paccess).then(fn || R.identity)
  const keys = (fn: Function) => then(nodeKeys).then(fn || R.identity)
  const count = (fn: Function) => keys(R.length).then(fn || R.identity)

  thisaccess = { get, then, keys, souls: keys, count }
  return thisaccess
}

export const scope = ({
  graph: defaultGraph = {},
  gun,
  parentScope,
  timeout = 10000,
  cache = null,
  getter,
  noGun = false,
  onlyOnce = false,
  isCacheing = false,
  isCached = false,
  unsub = false,
  onlyCache = false
}: {
  graph: any
  gun: any
  parentScope: any
  timeout: number
  cache: any
  getter: Function
  noGun: boolean
  onlyOnce: boolean
  isCacheing: boolean
  isCached: boolean
  onlyCache: boolean
  unsub: boolean
}) => {
  let thisScope: any
  let listeners: Function[] = []
  let promises: { [soul: string]: Promise<any> } = {}
  let cachedResults = { ...(cache || {}) }
  const chains = [] as any[]
  const accesses: any = {}
  const graph = { ...defaultGraph }
  const get = (soul: string) =>
    accesses[soul] || (accesses[soul] = access(thisScope, soul))
  const known = (soul: string) =>
    parentScope ? parentScope.known(soul) : graph[soul]
  const on = (fn: Function) => listeners.push(fn)
  const off = (fn: Function) => {
    listeners = listeners.filter(x => x !== fn)
    if (unsub) chains.forEach(chain => chain.off())
  }

  const load = (soul: string, data: any) => {
    if (data || !(soul in graph)) {
      graph[soul] = data
      listeners.forEach(fn => fn(soul, data))
    }
    return data
  }

  const fetch = (soul: any) =>
    parentScope
      ? parentScope.fetch(soul)
      : (promises[soul] =
          promises[soul] ||
          new ZalgoPromise((ok: any) => {
            let readTimeout: any

            if (!gun) return ok(null)

            const receive = (data: any) => {
              clearTimeout(readTimeout)
              ok(load(soul, data))
            }

            if (soul in graph) receive(graph[soul])

            readTimeout = setTimeout(() => {
              if (!(soul in graph)) {
                console.log('slow query', soul)
                receive(null)
              }
            }, timeout)

            if (typeof soul !== 'string') throw new Error(`bad SOUL ${soul}`)
            if (getter) getter(soul).then(receive)
            if (!noGun && !getter) {
              const chain = gun.get(soul)
              if (unsub) chains.push(chain)

              if (onlyOnce) {
                chain.once(receive)
              } else {
                chain.on(receive)
              }
              if (chain.not) chain.not(() => receive(null))
            }
          }))

  const getCached = (name: any, ...args: any[]) => {
    const key = [name, ...args].map(x =>
      typeof x === 'object' ? JSON.stringify(x) : `${x}`
    )

    return [R.path(key, cachedResults), key]
  }

  const cacheQuery = (name: string, queryFn: Function, ...args: any[]) => {
    if (parentScope) return parentScope.cacheQuery(name, queryFn, ...args)
    const [cached, key] = getCached(name, ...args) as [any, any]

    if (onlyCache) return resolve(cached)
    return queryFn(thisScope, ...args).then((result: any) => {
      if (isCacheing) {
        cachedResults = R.assocPath(key, result, cachedResults)
      } else {
        cachedResults = R.dissocPath(key, cachedResults)
      }
      return result
    })
  }

  const cachedQuery = (name: string, queryFn: Function, ...args: any[]) => {
    if (parentScope) return parentScope.cachedQuery(name, queryFn, ...args)
    const [cached] = getCached(name, ...args)
    const promise = cacheQuery(name, queryFn, ...args)

    // if (!cached && isCached) console.log("cache miss", name, args);
    if (!isCached) return promise
    return cached ? resolve(nowOr(cached, promise)) : promise
  }

  const getCache = () => cachedResults
  const getGraph = () => graph
  const getAccesses = () => accesses
  const loadCachedResults = (newResults: any) => {
    cachedResults = R.mergeDeepRight(cachedResults, newResults)
    listeners.forEach(fn => fn())
  }

  thisScope = {
    on,
    off,
    get,
    getCache,
    known,
    fetch,
    cacheQuery,
    cachedQuery,
    parentScope,
    getGraph,
    getAccesses,
    load,
    loadCachedResults
  }
  return thisScope
}

export const query = (queryFn: Function, name: null | string = null) => {
  const cachedQuery = (scopeObj: any, ...args: any[]) =>
    scopeObj.cachedQuery(name, queryFn, ...args)
  const doCachedQuery = name ? cachedQuery : queryFn
  const result: any = name ? cachedQuery : queryFn

  result.query = queryFn
  result.cached = doCachedQuery
  result.now = R.compose(now, doCachedQuery as (x1: any) => any)
  return result
}
