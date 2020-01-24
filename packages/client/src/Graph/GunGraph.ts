import { addMissingState, mergeGunNodes } from '@chaingun/crdt'
import {
  ChainGunGet,
  ChainGunPut,
  GunGraphData,
  GunMsgCb,
  GunNode,
  GunValue
} from '@chaingun/types'
import { GunEvent } from '../ControlFlow/GunEvent'
import {
  ChainGunMiddleware,
  ChainGunMiddlewareType,
  GunNodeListenCb,
  GunOnCb
} from '../interfaces'
import { GunGraphConnector } from '../Transports/GunGraphConnector'
import { GunGraphNode } from './GunGraphNode'
import {
  diffSets,
  flattenGraphData,
  generateMessageId,
  getPathData
} from './GunGraphUtils'

interface GunGraphOptions {
  readonly mutable?: boolean
}

/**
 * High level management of a subset of the gun graph
 *
 * Provides facilities for querying and writing to graph data from one or more sources
 */
export class GunGraph {
  public readonly id: string

  public readonly events: {
    readonly graphData: GunEvent<
      GunGraphData,
      string | undefined,
      string | undefined
    >
    readonly put: GunEvent<ChainGunPut>
    readonly get: GunEvent<ChainGunGet>
    readonly off: GunEvent<string>
  }

  public readonly activeConnectors: number

  // tslint:disable-next-line: readonly-keyword
  private _opt: GunGraphOptions
  // tslint:disable-next-line: readonly-array
  private readonly _connectors: GunGraphConnector[]
  // tslint:disable-next-line: readonly-array
  private readonly _readMiddleware: ChainGunMiddleware[]
  // tslint:disable-next-line: readonly-array
  private readonly _writeMiddleware: ChainGunMiddleware[]
  private readonly _graph: GunGraphData
  private readonly _nodes: {
    readonly [soul: string]: GunGraphNode
  }

  constructor() {
    this.id = generateMessageId()
    this._receiveGraphData = this._receiveGraphData.bind(this)
    this.__onConnectorStatus = this.__onConnectorStatus.bind(this)
    this.activeConnectors = 0
    this.events = {
      get: new GunEvent('request soul'),
      graphData: new GunEvent('graph data'),
      off: new GunEvent('off event'),
      put: new GunEvent('put data')
    }
    this._opt = {}
    this._graph = {}
    this._nodes = {}
    this._connectors = []
    this._readMiddleware = []
    this._writeMiddleware = []
  }

  /**
   * Configure graph options
   *
   * Currently unused
   *
   * @param options
   */
  public opt(options: GunGraphOptions): GunGraph {
    this._opt = { ...this._opt, ...options }
    return this
  }

  /**
   * Connect to a source/destination for graph data
   *
   * @param connector the source or destination for graph data
   */
  public connect(connector: GunGraphConnector): GunGraph {
    if (this._connectors.indexOf(connector) !== -1) {
      return this
    }
    this._connectors.push(connector.connectToGraph(this))

    connector.events.connection.on(this.__onConnectorStatus)
    connector.events.graphData.on(this._receiveGraphData)

    if (connector.isConnected) {
      // @ts-ignore
      this.activeConnectors++
    }
    return this
  }

  /**
   * Disconnect from a source/destination for graph data
   *
   * @param connector the source or destination for graph data
   */
  public disconnect(connector: GunGraphConnector): GunGraph {
    const idx = this._connectors.indexOf(connector)
    connector.events.graphData.off(this._receiveGraphData)
    connector.events.connection.off(this.__onConnectorStatus)
    if (idx !== -1) {
      this._connectors.splice(idx, 1)
    }
    if (connector.isConnected) {
      // @ts-ignore
      this.activeConnectors--
    }
    return this
  }

  /**
   * Register graph middleware
   *
   * @param middleware The middleware function to add
   * @param kind Optionaly register write middleware instead of read by passing "write"
   */
  public use(
    middleware: ChainGunMiddleware,
    kind = 'read' as ChainGunMiddlewareType
  ): GunGraph {
    if (kind === 'read') {
      this._readMiddleware.push(middleware)
    } else if (kind === 'write') {
      this._writeMiddleware.push(middleware)
    }
    return this
  }

  /**
   * Unregister graph middleware
   *
   * @param middleware The middleware function to remove
   * @param kind Optionaly unregister write middleware instead of read by passing "write"
   */
  public unuse(
    middleware: ChainGunMiddleware,
    kind = 'read' as ChainGunMiddlewareType
  ): GunGraph {
    if (kind === 'read') {
      const idx = this._readMiddleware.indexOf(middleware)
      if (idx !== -1) {
        this._readMiddleware.splice(idx, 1)
      }
    } else if (kind === 'write') {
      const idx = this._writeMiddleware.indexOf(middleware)
      if (idx !== -1) {
        this._writeMiddleware.splice(idx, 1)
      }
    }

    return this
  }

  /**
   * Read a potentially multi-level deep path from the graph
   *
   * @param path The path to read
   * @param cb The callback to invoke with results
   * @returns a cleanup function to after done with query
   */
  public query(path: readonly string[], cb: GunOnCb): () => void {
    // tslint:disable-next-line: no-let
    let lastSouls = [] as readonly string[]
    // tslint:disable-next-line: no-let
    let currentValue: GunValue | undefined

    const updateQuery = () => {
      const { souls, value, complete } = getPathData(path, this._graph)
      const [added, removed] = diffSets(lastSouls, souls)

      if (
        (complete && typeof currentValue === 'undefined') ||
        (typeof value !== 'undefined' && value !== currentValue)
      ) {
        currentValue = value
        cb(value, path[path.length - 1])
      }

      for (const soul of added) {
        this._requestSoul(soul, updateQuery)
      }

      for (const soul of removed) {
        this._unlistenSoul(soul, updateQuery)
      }

      lastSouls = souls
    }

    updateQuery()

    return () => {
      for (const soul of lastSouls) {
        this._unlistenSoul(soul, updateQuery)
      }
    }
  }

  /**
   * Write graph data to a potentially multi-level deep path in the graph
   *
   * @param path The path to read
   * @param data The value to write
   * @param cb Callback function to be invoked for write acks
   * @returns a promise
   */
  public async putPath(
    fullPath: readonly string[],
    data: GunValue,
    cb?: GunMsgCb,
    uuidFn?: (path: readonly string[]) => Promise<string> | string
  ): Promise<void> {
    if (!fullPath.length) {
      throw new Error('No path specified')
    }
    const souls = await this.getPathSouls(fullPath)

    if (souls.length === fullPath.length) {
      this.put(
        {
          [souls[souls.length - 1]]: data as GunNode
        },
        cb
      )
      return
    }

    const existing = fullPath.slice(0, souls.length)
    const remaining = fullPath.slice(souls.length)
    // tslint:disable-next-line: no-let
    let previousSoul = souls[souls.length - 1]
    const graph: GunGraphData = {}

    // tslint:disable-next-line: no-let
    for (let i = 0; i < remaining.length; i++) {
      const now = new Date().getTime()
      const key = remaining[i]
      // tslint:disable-next-line: no-let
      let chainVal: GunValue
      // tslint:disable-next-line: no-let
      let soul = ''

      if (i === remaining.length - 1) {
        chainVal = data
      } else {
        if (!uuidFn) {
          throw new Error(
            'Must specify uuid function to put to incomplete path'
          )
        }
        soul = await uuidFn([...existing, ...remaining.slice(0, i + 1)])
        chainVal = {
          '#': soul
        }
      }

      // @ts-ignore
      graph[previousSoul] = {
        _: {
          '#': previousSoul,
          '>': {
            [key]: now
          }
        },
        [key]: chainVal
      }

      if (soul) {
        previousSoul = soul
      }
    }

    this.put(graph, cb)
  }

  public getPathSouls(path: readonly string[]): Promise<readonly string[]> {
    const promise = new Promise<readonly string[]>(ok => {
      if (path.length === 1) {
        ok(path)
        return
      }

      // tslint:disable-next-line: no-let
      let lastSouls = [] as readonly string[]

      const end = () => {
        for (const soul of lastSouls) {
          this._unlistenSoul(soul, updateQuery)
        }
        lastSouls = []
      }

      const updateQuery = () => {
        const { souls, complete } = getPathData(path, this._graph)
        const [added, removed] = diffSets(lastSouls, souls)

        if (complete) {
          end()
          ok(souls)
        } else {
          for (const soul of added) {
            this._requestSoul(soul, updateQuery)
          }

          for (const soul of removed) {
            this._unlistenSoul(soul, updateQuery)
          }
        }

        lastSouls = souls
      }

      updateQuery()
    })

    return promise
  }

  /**
   * Request node data
   *
   * @param soul identifier of node to request
   * @param cb callback for response messages
   * @param msgId optional unique message identifier
   * @returns a function to cleanup listeners when done
   */
  public get(soul: string, cb?: GunMsgCb, msgId?: string): () => void {
    const id = msgId || generateMessageId()

    this.events.get.trigger({
      cb,
      msgId: id,
      soul
    })

    return () => this.events.off.trigger(id)
  }

  /**
   * Write node data
   *
   * @param data one or more gun nodes keyed by soul
   * @param cb optional callback for response messages
   * @param msgId optional unique message identifier
   * @returns a function to clean up listeners when done
   */
  public put(data: GunGraphData, cb?: GunMsgCb, msgId?: string): () => void {
    // tslint:disable-next-line: no-let
    let diff: GunGraphData | undefined = flattenGraphData(addMissingState(data))

    const id = msgId || generateMessageId()
    ;(async () => {
      for (const fn of this._writeMiddleware) {
        if (!diff) {
          return
        }
        diff = await fn(diff, this._graph)
      }
      if (!diff) {
        return
      }

      this.events.put.trigger({
        cb,
        graph: diff,
        msgId: id
      })

      this._receiveGraphData(diff)
    })()

    return () => this.events.off.trigger(id)
  }

  /**
   * Synchronously invoke callback function for each connector to this graph
   *
   * @param cb The callback to invoke
   */
  public eachConnector(cb: (connector: GunGraphConnector) => void): GunGraph {
    for (const connector of this._connectors) {
      cb(connector)
    }

    return this
  }

  /**
   * Update graph data in this chain from some local or external source
   *
   * @param data node data to include
   */
  protected async _receiveGraphData(
    data?: GunGraphData,
    id?: string,
    replyToId?: string
  ): Promise<void> {
    // tslint:disable-next-line: no-let
    let diff = data

    for (const fn of this._readMiddleware) {
      if (!diff) {
        return
      }
      diff = await fn(diff, this._graph)
    }

    if (!diff) {
      return
    }

    for (const soul in diff) {
      if (!soul) {
        continue
      }

      const node = this._nodes[soul]
      if (!node) {
        continue
      }
      node.receive(
        // @ts-ignore
        (this._graph[soul] = mergeGunNodes(
          this._graph[soul],
          diff[soul],
          this._opt.mutable ? 'mutable' : 'immutable'
        ))
      )
    }

    this.events.graphData.trigger(diff, id, replyToId)
  }

  protected _node(soul: string): GunGraphNode {
    // @ts-ignore
    return (this._nodes[soul] =
      this._nodes[soul] || new GunGraphNode(this, soul, this._receiveGraphData))
  }

  protected _requestSoul(soul: string, cb: GunNodeListenCb): GunGraph {
    this._node(soul).get(cb)
    return this
  }

  protected _unlistenSoul(soul: string, cb: GunNodeListenCb): GunGraph {
    const node = this._nodes[soul]
    if (!node) {
      return this
    }
    node.off(cb)
    if (node.listenerCount() <= 0) {
      node.off()
      this._forgetSoul(soul)
    }
    return this
  }

  protected _forgetSoul(soul: string): GunGraph {
    const node = this._nodes[soul]
    if (node) {
      node.off()
      // @ts-ignore
      // tslint:disable-next-line: no-delete
      delete this._nodes[soul]
    }
    // @ts-ignore
    // tslint:disable-next-line: no-delete
    delete this._graph[soul]
    return this
  }

  protected __onConnectorStatus(connected?: boolean): void {
    if (connected) {
      // @ts-ignore
      this.activeConnectors++
    } else {
      // @ts-ignore
      this.activeConnectors--
    }
  }
}
