import { diffGunCRDT } from '@chaingun/crdt'
import { GunMsgCb } from '@chaingun/types'
import { ChainGunLink } from './ChainGunLink'
import { GunGraph } from './Graph/GunGraph'
import { WebSocketGraphConnector } from './Transports/WebSocketGraphConnector'

interface ChainGunOptions {
  readonly peers?: readonly string[]
  readonly graph?: GunGraph
  readonly WS?: typeof WebSocket
}

/**
 * Main entry point for ChainGun
 *
 * Usage:
 *
 *   const gun = new ChainGunClient({ peers: ["https://notabug.io/gun"]})
 *   gun.get("nab/things/59382d2a08b7d7073415b5b6ae29dfe617690d74").on(thing => console.log(this))
 */
export class ChainGunClient {
  public readonly graph: GunGraph
  // tslint:disable-next-line: variable-name readonly-keyword
  protected _opt: ChainGunOptions
  protected readonly LinkClass: typeof ChainGunLink

  constructor(opt?: ChainGunOptions, LinkClass = ChainGunLink) {
    if (opt && opt.graph) {
      this.graph = opt.graph
    } else {
      this.graph = new GunGraph()
      this.graph.use(diffGunCRDT)
      this.graph.use(diffGunCRDT, 'write')
    }
    this._opt = {}
    if (opt) {
      this.opt(opt)
    }

    this.LinkClass = LinkClass
  }

  /**
   * Set ChainGun configuration options
   *
   * @param options
   */
  public opt(options: ChainGunOptions): ChainGunClient {
    this._opt = { ...this._opt, ...options }

    if (options.peers) {
      options.peers.forEach(peer => {
        const connector = new WebSocketGraphConnector(peer, this._opt.WS)
        connector.sendPutsFromGraph(this.graph)
        connector.sendRequestsFromGraph(this.graph)
        this.graph.connect(connector)
      })
    }

    return this
  }

  /**
   * Traverse a location in the graph
   *
   * @param key Key to read data from
   * @param cb
   * @returns New chain context corresponding to given key
   */
  // tslint:disable-next-line: variable-name
  public get(soul: string, _cb?: GunMsgCb): ChainGunLink {
    return new this.LinkClass(this, soul)
  }
}
