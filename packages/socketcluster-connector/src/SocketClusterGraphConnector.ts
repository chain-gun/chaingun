import { generateMessageId, GunGraphWireConnector } from '@chaingun/client';
import { sign } from '@chaingun/sear';
import { GunMsgCb } from '@chaingun/types';
import { SCChannel, SCChannelOptions } from 'sc-channel';
import socketCluster from 'socketcluster-client';

export class SocketClusterGraphConnector extends GunGraphWireConnector {
  public readonly opts: socketCluster.SCClientSocket.ClientOptions | undefined;
  public readonly socket?: socketCluster.SCClientSocket;
  public readonly msgChannel?: SCChannel;
  public readonly getsChannel?: SCChannel;
  public readonly putsChannel?: SCChannel;

  private readonly _requestChannels: {
    // tslint:disable-next-line: readonly-keyword
    [msgId: string]: SCChannel;
  };

  constructor(
    opts: socketCluster.SCClientSocket.ClientOptions | undefined,
    name = 'SocketClusterGraphConnector'
  ) {
    super(name);
    this._requestChannels = {};
    this.outputQueue.completed.on(this._onOutputProcessed.bind(this));
    this.opts = opts;
    this._connectToCluster();
  }

  public off(msgId: string): SocketClusterGraphConnector {
    super.off(msgId);
    const channel = this._requestChannels[msgId];

    if (channel) {
      channel.unsubscribe();
      // tslint:disable-next-line: no-object-mutation no-delete
      delete this._requestChannels[msgId];
    }

    return this;
  }

  public get({
    soul,
    msgId,
    cb
  }: {
    readonly soul: string;
    readonly msgId?: string;
    readonly key?: string;
    readonly cb?: GunMsgCb;
  }): () => void {
    const cbWrap = (msg: any) => {
      this.ingest([msg]);
      if (cb) {
        cb(msg);
      }
    };

    const channel = this.subscribeToChannel(`gun/nodes/${soul}`, cbWrap);
    if (msgId) {
      // tslint:disable-next-line: no-object-mutation
      this._requestChannels[msgId] = channel;
    }

    return () => {
      if (msgId) {
        this.off(msgId);
      }
      channel.unsubscribe();
    };
  }

  public put({
    graph,
    msgId = '',
    replyTo = '',
    cb
  }: {
    readonly graph: any;
    readonly msgId?: string;
    readonly replyTo?: string;
    readonly cb?: GunMsgCb;
  }): () => void {
    if (!graph) {
      // tslint:disable-next-line: no-empty
      return () => {};
    }

    const id = msgId || generateMessageId();
    const msg: any = {
      '#': id,
      put: graph
    };

    if (replyTo) {
      // tslint:disable-next-line: no-object-mutation
      msg['@'] = replyTo;
    }

    if (cb) {
      const cbWrap = (response: any) => {
        this.ingest([response]);
        cb(response);
        this.off(id);
      };

      const channel = this.subscribeToChannel(`gun/@${id}`, cbWrap);
      // tslint:disable-next-line: no-object-mutation
      this._requestChannels[id] = channel;
    }

    this.socket!.publish('gun/put', msg);

    return () => this.off(id);
  }

  public authenticate(pub: string, priv: string): Promise<void> {
    const doAuth = () => {
      const id = this.socket!.id;
      const timestamp = new Date().getTime();
      const challenge = `${id}/${timestamp}`;
      return sign(challenge, { pub, priv }, { raw: true }).then(
        (proof: any) =>
          new Promise((ok, fail) => {
            this.socket!.emit(
              'login',
              {
                proof,
                pub
              },
              (err: any, rejection: any) => {
                if (err || rejection) {
                  fail(err || rejection);
                } else {
                  ok();
                }
              }
            );
          })
      );
    };

    return this.waitForConnection().then(() => {
      doAuth();
      this.socket!.on('connect', doAuth);
    });
  }

  public subscribeToChannel(
    channelName: string,
    cb?: GunMsgCb,
    opts?: SCChannelOptions
  ): SCChannel {
    const channel = this.socket!.subscribe(channelName, opts);
    channel.watch(msg => {
      this.ingest([msg]);
      if (cb) {
        cb(msg);
      }
    });
    return channel;
  }

  public publishToChannel(
    channel: string,
    msg: any
  ): SocketClusterGraphConnector {
    this.socket!.publish(channel, msg);
    return this;
  }

  protected _connectToCluster(): void {
    // @ts-ignore
    // tslint:disable-next-line: no-object-mutation
    this.socket = socketCluster.create(this.opts);
    this.socket.on('connect', () => {
      this.events.connection.trigger(true);
    });
    this.socket.on('error', err => {
      // tslint:disable-next-line: no-console
      console.error('SC Connection Error', err.stack, err);
    });
  }

  private _onOutputProcessed(msg: any): void {
    if (msg && this.socket) {
      const replyTo = msg['@'];
      if (replyTo) {
        this.publishToChannel(`gun/@${replyTo}`, msg);
      } else {
        if ('get' in msg) {
          this.publishToChannel('gun/get', msg);
        } else if ('put' in msg) {
          this.publishToChannel('gun/put', msg);
        }
      }
    }
  }
}
