import { GunMsg } from '@chaingun/types'
import ReconnectingWS from 'reconnecting-websocket'
import { GunGraphWireConnector } from './GunGraphWireConnector'

export class WebSocketGraphConnector extends GunGraphWireConnector {
  public readonly url: string
  private readonly _ws: WebSocket

  constructor(url: string, WS = WebSocket) {
    super(`<WebSocketGraphConnector ${url}>`)
    this.url = url
    this.outputQueue.completed.on(this._onOutputProcessed.bind(this))
    this._ws = this._connectWebSocket(WS)
  }

  private _connectWebSocket(WS = WebSocket): WebSocket {
    const ws = (new ReconnectingWS(this.url.replace(/^http/, 'ws'), [], {
      WebSocket: WS
    }) as unknown) as WebSocket

    ws.addEventListener('message', this._onReceiveSocketData.bind(this))
    ws.addEventListener('open', () => this.events.connection.trigger(true))
    ws.addEventListener('close', () => this.events.connection.trigger(false))

    return ws
  }

  private _sendToWebsocket(msgs: readonly GunMsg[]): readonly GunMsg[] {
    if (!msgs.length) {
      return msgs
    }
    if (msgs.length === 1) {
      this._ws.send(JSON.stringify(msgs[0]))
    } else if (msgs.length > 0) {
      this._ws.send(JSON.stringify(msgs))
    }
    return msgs
  }

  private _onOutputProcessed(msg?: GunMsg): void {
    if (msg) {
      this._sendToWebsocket([msg])
    }
  }

  private _onReceiveSocketData(msg: MessageEvent): void {
    const raw = msg.data
    const json = JSON.parse(raw) as GunMsg | ReadonlyArray<string>

    if (Array.isArray(json)) {
      this.ingest(
        json.map((x: any) => (typeof x === 'string' ? JSON.parse(x) : x))
      )
    } else {
      this.ingest([json as GunMsg])
    }
  }
}
