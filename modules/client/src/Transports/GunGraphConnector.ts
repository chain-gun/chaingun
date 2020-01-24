import { ChainGunGet, ChainGunPut, GunGraphData, GunMsg } from '@chaingun/types'
import { GunEvent } from '../ControlFlow/GunEvent'
import { GunProcessQueue } from '../ControlFlow/GunProcessQueue'
import { GunGraph } from '../Graph/GunGraph'

export abstract class GunGraphConnector {
  public readonly name: string
  public readonly isConnected: boolean

  public readonly events: {
    readonly graphData: GunEvent<
      GunGraphData,
      string | undefined,
      string | undefined
    >
    readonly receiveMessage: GunEvent<GunMsg>
    readonly connection: GunEvent<boolean>
  }

  protected readonly inputQueue: GunProcessQueue<GunMsg>
  protected readonly outputQueue: GunProcessQueue<GunMsg>

  constructor(name = 'GunGraphConnector') {
    this.isConnected = false
    this.name = name

    this.put = this.put.bind(this)
    this.off = this.off.bind(this)

    this.inputQueue = new GunProcessQueue<GunMsg>(`${name}.inputQueue`)
    this.outputQueue = new GunProcessQueue<GunMsg>(`${name}.outputQueue`)

    this.events = {
      connection: new GunEvent(`${name}.events.connection`),
      graphData: new GunEvent<GunGraphData>(`${name}.events.graphData`),
      receiveMessage: new GunEvent<GunMsg>(`${name}.events.receiveMessage`)
    }

    this.__onConnectedChange = this.__onConnectedChange.bind(this)
    this.events.connection.on(this.__onConnectedChange)
  }

  public connectToGraph(graph: GunGraph): GunGraphConnector {
    graph.events.off.on(this.off)
    return this
  }

  public off(_msgId: string): GunGraphConnector {
    return this
  }

  public sendPutsFromGraph(graph: GunGraph): GunGraphConnector {
    graph.events.put.on(this.put)
    return this
  }

  public sendRequestsFromGraph(graph: GunGraph): GunGraphConnector {
    graph.events.get.on(req => {
      this.get(req)
    })
    return this
  }

  public waitForConnection(): Promise<void> {
    if (this.isConnected) {
      return Promise.resolve()
    }
    return new Promise(ok => {
      const onConnected = (connected?: boolean) => {
        if (!connected) {
          return
        }
        ok()
        this.events.connection.off(onConnected)
      }
      this.events.connection.on(onConnected)
    })
  }

  /**
   * Send graph data for one or more nodes
   *
   * @returns A function to be called to clean up callback listeners
   */
  public put(_params: ChainGunPut): () => void {
    // tslint:disable-next-line: no-empty
    return () => {}
  }

  /**
   * Request data for a given soul
   *
   * @returns A function to be called to clean up callback listeners
   */
  public get(_params: ChainGunGet): () => void {
    // tslint:disable-next-line: no-empty
    return () => {}
  }

  /**
   * Queues outgoing messages for sending
   *
   * @param msgs The Gun wire protocol messages to enqueue
   */
  public send(msgs: readonly GunMsg[]): GunGraphConnector {
    this.outputQueue.enqueueMany(msgs)
    if (this.isConnected) {
      this.outputQueue.process()
    }

    return this
  }

  /**
   * Queue incoming messages for processing
   *
   * @param msgs
   */
  public ingest(msgs: readonly GunMsg[]): GunGraphConnector {
    this.inputQueue.enqueueMany(msgs).process()

    return this
  }

  private __onConnectedChange(connected?: boolean): void {
    if (connected) {
      // @ts-ignore
      this.isConnected = true
      this.outputQueue.process()
    } else {
      // @ts-ignore
      this.isConnected = false
    }
  }
}
