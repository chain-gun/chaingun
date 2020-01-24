export class MiddlewareSystem<T, U = undefined, V = undefined> {
  public readonly name: string
  // tslint:disable-next-line: readonly-array readonly-keyword
  private _middlewareFunctions: Array<
    (a: T, b?: U, c?: V) => Promise<T> | T | undefined
  >

  constructor(name = 'MiddlewareSystem') {
    this.name = name
    this._middlewareFunctions = []
  }

  /**
   * Register middleware function
   *
   * @param middleware The middleware function to add
   */
  public use(
    middleware: (a: T, b?: U, c?: V) => Promise<T> | T | undefined
  ): MiddlewareSystem<T, U, V> {
    if (this._middlewareFunctions.indexOf(middleware) !== -1) {
      return this
    }

    this._middlewareFunctions.push(middleware)
    return this
  }

  /**
   * Unregister middleware function
   *
   * @param middleware The middleware function to remove
   */
  public unuse(
    middleware: (a: T, b?: U, c?: V) => T | undefined
  ): MiddlewareSystem<T, U, V> {
    const idx = this._middlewareFunctions.indexOf(middleware)
    if (idx !== -1) {
      this._middlewareFunctions.splice(idx, 1)
    }

    return this
  }

  /**
   * Process values through this middleware
   * @param a Required, this is the value modified/passed through each middleware fn
   * @param b Optional extra argument passed to each middleware function
   * @param c Optional extra argument passed to each middleware function
   */
  public async process(a: T, b?: U, c?: V): Promise<T | undefined> {
    // tslint:disable-next-line: no-let
    let val: T | undefined = a

    for (const fn of this._middlewareFunctions) {
      if (!val) {
        return
      }

      val = await fn(val, b, c)
    }

    return val
  }
}
