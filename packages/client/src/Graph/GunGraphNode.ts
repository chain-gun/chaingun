import { GunGraphData, GunMsg, GunNode } from '@chaingun/types'
import { GunEvent } from '../ControlFlow/GunEvent'
import { GunNodeListenCb } from '../interfaces'
import { GunGraph } from './GunGraph'

/**
 * Query state around a single node in the graph
 */
export class GunGraphNode {
  public readonly soul: string

  private readonly _data: GunEvent<GunNode | undefined>
  private readonly _graph: GunGraph
  // tslint:disable-next-line: readonly-keyword
  private _endCurQuery?: () => void
  private readonly _updateGraph: (data: GunGraphData, replyToId?: string) => void

  constructor(
    graph: GunGraph,
    soul: string,
    updateGraph: (data: GunGraphData, replyToId?: string) => void
  ) {
    this._onDirectQueryReply = this._onDirectQueryReply.bind(this)
    this._data = new GunEvent<GunNode | undefined>(`<GunGraphNode ${soul}>`)
    this._graph = graph
    this._updateGraph = updateGraph
    this.soul = soul
  }

  public listenerCount(): number {
    return this._data.listenerCount()
  }

  public get(cb?: GunNodeListenCb): GunGraphNode {
    if (cb) {
      this.on(cb)
    }
    this._ask()
    return this
  }

  public receive(data: GunNode | undefined): GunGraphNode {
    this._data.trigger(data, this.soul)
    return this
  }

  public on(
    cb: (data: GunNode | undefined, soul: string) => void
  ): GunGraphNode {
    this._data.on(cb)
    return this
  }

  public off(
    cb?: (data: GunNode | undefined, soul: string) => void
  ): GunGraphNode {
    if (cb) {
      this._data.off(cb)
    } else {
      this._data.reset()
    }

    if (this._endCurQuery && !this._data.listenerCount()) {
      this._endCurQuery()
      this._endCurQuery = undefined
    }

    return this
  }

  private _ask(): GunGraphNode {
    if (this._endCurQuery) {
      return this
    }

    this._graph.get(this.soul, this._onDirectQueryReply)
    return this
  }

  private _onDirectQueryReply(msg: GunMsg): void {
    if (!msg.put) {
      this._updateGraph(
        {
          [this.soul]: undefined
        },
        msg['@']
      )
    }
  }
}
