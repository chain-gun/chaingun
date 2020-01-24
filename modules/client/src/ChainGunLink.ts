import { GunMsgCb, GunNode, GunValue } from '@chaingun/types'
import { ChainGunClient } from './ChainGunClient'
import { GunEvent } from './ControlFlow/GunEvent'
import { GunChainOptions, GunOnCb } from './interfaces'

export class ChainGunLink {
  /* last key in chain */
  public readonly key: string
  public readonly soul?: string

  // tslint:disable-next-line: readonly-keyword
  protected _opt: GunChainOptions
  protected readonly _updateEvent: GunEvent<GunValue | undefined, string>
  protected readonly _chain: ChainGunClient
  protected readonly _parent?: ChainGunLink
  protected readonly _endQuery?: () => void
  protected readonly _lastValue: GunValue | undefined
  protected readonly _hasReceived: boolean

  constructor(chain: ChainGunClient, key: string, parent?: ChainGunLink) {
    this.key = key
    if (!parent) {
      this.soul = key
    }
    this._opt = {}
    this._chain = chain
    this._parent = parent
    this._hasReceived = false
    this._updateEvent = new GunEvent(this.getPath().join('|'))
  }

  /**
   * @returns path of this node
   */
  public getPath(): readonly string[] {
    if (this._parent) {
      return [...this._parent.getPath(), this.key]
    }

    return [this.key]
  }

  /**
   * Traverse a location in the graph
   *
   * @param key Key to read data from
   * @param cb
   * @returns New chain context corresponding to given key
   */
  public get(key: string, _cb?: GunMsgCb): ChainGunLink {
    return new (this.constructor as any)(this._chain, key, this)
  }

  /**
   * Move up to the parent context on the chain.
   *
   * Every time a new chain is created, a reference to the old context is kept to go back to.
   *
   * @param amount The number of times you want to go back up the chain. {-1} or {Infinity} will take you to the root.
   * @returns a parent chain context
   */
  public back(amount = 1): ChainGunLink | ChainGunClient {
    if (amount < 0 || amount === Infinity) {
      return this._chain
    }
    if (amount === 1) {
      return this._parent || this._chain
    }
    return this.back(amount - 1)
  }

  /**
   * Save data into gun, syncing it with your connected peers.
   *
   * You do not need to re-save the entire object every time, gun will automatically
   * merge your data into what already exists as a "partial" update.
   *
   * @param value the data to save
   * @param cb an optional callback, invoked on each acknowledgment
   * @returns same chain context
   */
  public put(value: GunValue, cb?: GunMsgCb): ChainGunLink {
    this._chain.graph.putPath(this.getPath(), value, cb, this.opt().uuid)
    return this
  }

  /**
   * Add a unique item to an unordered list.
   *
   * Works like a mathematical set, where each item in the list is unique.
   * If the item is added twice, it will be merged.
   * This means only objects, for now, are supported.
   *
   * @param data should be a gun reference or an object
   * @param cb The callback is invoked exactly the same as .put
   * @returns chain context for added object
   */
  public set(data: any, cb?: GunMsgCb): ChainGunLink {
    if (data instanceof ChainGunLink && data.soul) {
      this.put(
        {
          [data.soul]: {
            '#': data.soul
          }
        },
        cb
      )
    } else if (data && data._ && data._['#']) {
      this.put(
        {
          [data && data._ && data._['#']]: data
        },
        cb
      )
    } else {
      throw new Error('set() is only partially supported')
    }

    return this
  }

  /**
   * Register a callback for when it appears a record does not exist
   *
   * If you need to know whether a property or key exists, you can check with .not.
   * It will consult the connected peers and invoke the callback if there's reasonable certainty that none of them have the data available.
   *
   * @param cb If there's reason to believe the data doesn't exist, the callback will be invoked. This can be used as a check to prevent implicitly writing data
   * @returns same chain context
   */
  public not(cb: (key: string) => void): ChainGunLink {
    this.promise().then(val => typeof val === 'undefined' && cb(this.key))
    return this
  }

  /**
   * Change the configuration of this chain link
   *
   * @param options
   * @returns current options
   */
  public opt(options?: GunChainOptions): GunChainOptions {
    if (options) {
      this._opt = { ...this._opt, ...options }
    }
    if (this._parent) {
      return { ...this._parent.opt(), ...this._opt }
    }
    return this._opt
  }

  /**
   * Get the current data without subscribing to updates. Or undefined if it cannot be found.
   *
   * @param cb The data is the value for that chain at that given point in time. And the key is the last property name or ID of the node.
   * @returns same chain context
   */
  public once(cb: GunOnCb): ChainGunLink {
    this.promise().then(val => cb(val, this.key))
    return this
  }

  /**
   * Subscribe to updates and changes on a node or property in realtime.
   *
   * Triggered once initially and whenever the property or node you're focused on changes,
   * Since gun streams data, the callback will probably be called multiple times as new chunk comes in.
   *
   * To remove a listener call .off() on the same property or node.
   *
   * @param cb The callback is immediately fired with the data as it is at that point in time.
   * @returns same chain context
   */
  public on(cb: GunOnCb): ChainGunLink {
    if (this.key === '') {
      // TODO: "Map logic"
    }

    this._updateEvent.on(cb)
    if (!this._endQuery) {
      // @ts-ignore
      this._endQuery = this._chain.graph.query(
        this.getPath(),
        this._onQueryResponse.bind(this)
      )
    }
    if (this._hasReceived) {
      cb(this._lastValue, this.key)
    }
    return this
  }

  /**
   * Unsubscribe one or all listeners subscribed with on
   *
   * @returns same chain context
   */
  public off(cb?: GunOnCb): ChainGunLink {
    if (cb) {
      this._updateEvent.off(cb)
      if (this._endQuery && !this._updateEvent.listenerCount()) {
        this._endQuery()
      }
    } else {
      if (this._endQuery) {
        this._endQuery()
      }
      this._updateEvent.reset()
    }
    return this
  }

  public promise(opts = { timeout: 0 }): Promise<GunValue> {
    return new Promise<GunValue>(ok => {
      const cb = (val?: GunValue) => {
        ok(val)
        this.off(cb)
      }
      this.on(cb)

      if (opts.timeout) {
        setTimeout(() => ok(), opts.timeout)
      }
    })
  }

  public then(fn?: (val: GunValue) => any): Promise<any> {
    return this.promise().then(fn)
  }

  /**
   * Iterates over each property and item on a node, passing it down the chain
   *
   * Not yet supported
   *
   * Behaves like a forEach on your data.
   * It also subscribes to every item as well and listens for newly inserted items.
   *
   * @returns a new chain context holding many chains simultaneously.
   */
  public map(): ChainGunLink {
    throw new Error("map() isn't supported yet")
    return this.get('') // Special case key
  }

  /**
   * No plans to support this
   */
  public path(_path: string): ChainGunLink {
    throw new Error('No plans to support this')
  }

  /**
   * No plans to support this
   */
  public open(_cb: any): ChainGunLink {
    throw new Error('No plans to support this')
  }

  /**
   * No plans to support this
   */
  public load(_cb: any): ChainGunLink {
    throw new Error('No plans to support this')
  }

  /**
   * No plans to support this
   */
  public bye(): ChainGunLink {
    throw new Error('No plans to support this')
  }

  /**
   * No plans to support this
   */
  public later(): ChainGunLink {
    throw new Error('No plans to support this')
  }

  /**
   * No plans to support this
   */
  public unset(_node: GunNode): ChainGunLink {
    throw new Error('No plans to support this')
  }

  protected _onQueryResponse(value?: GunValue): void {
    this._updateEvent.trigger(value, this.key)
    // @ts-ignore
    this._lastValue = value
    // @ts-ignore
    this._hasReceived = true
  }
}
