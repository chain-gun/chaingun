type EventCb<T = any, U = any, V = any> = (a: T, b?: U, c?: V) => void

/**
 * Generic event/listener system
 */
export class GunEvent<T = any, U = any, V = any> {
  public readonly name: string
  // tslint:disable-next-line: readonly-array readonly-keyword
  private _listeners: Array<EventCb<T, U, V>>

  constructor(name = 'GunEvent') {
    this.name = name
    this._listeners = []
    this.listenerCount = this.listenerCount.bind(this)
    this.on = this.on.bind(this)
    this.off = this.off.bind(this)
    this.trigger = this.trigger.bind(this)
  }

  /**
   * @returns number of currently subscribed listeners
   */
  public listenerCount(): number {
    return this._listeners.length
  }

  /**
   * Register a listener on this event
   *
   * @param cb the callback to subscribe
   */
  public on(cb: EventCb<T, U, V>): GunEvent<T, U, V> {
    if (this._listeners.indexOf(cb) !== -1) {
      return this
    }
    this._listeners.push(cb)
    return this
  }

  /**
   * Unregister a listener on this event
   * @param cb the callback to unsubscribe
   */
  public off(cb: EventCb<T, U, V>): GunEvent<T, U, V> {
    const idx = this._listeners.indexOf(cb)
    if (idx !== -1) {
      this._listeners.splice(idx, 1)
    }
    return this
  }

  /**
   * Unregister all listeners on this event
   */
  public reset(): GunEvent<T, U, V> {
    this._listeners = []
    return this
  }

  /**
   * Trigger this event
   */
  public trigger(a: T, b?: U, c?: V): GunEvent<T, U, V> {
    this._listeners.forEach(cb => cb(a, b, c))
    return this
  }
}
