import { ChainGunClient, ChainGunLink } from '@chaingun/client'
import { unpackGraph } from '@chaingun/sear'
import { ChainGunUserApi } from './ChainGunUserApi'

export class ChainGunSeaClient extends ChainGunClient {
  protected readonly _user?: ChainGunUserApi

  constructor(graph: any, LinkClass = ChainGunLink) {
    super(graph, LinkClass)
    this.registerSearMiddleware()
  }

  public user(): ChainGunUserApi {
    // @ts-ignore
    // tslint:disable-next-line: no-object-mutation
    return (this._user = this._user || new ChainGunUserApi(this))
  }

  protected registerSearMiddleware(): void {
    this.graph.use(graph =>
      unpackGraph(
        graph,
        // tslint:disable-next-line: no-string-literal
        this.graph['_opt'].mutable ? 'mutable' : 'immutable'
      )
    )
  }
}
