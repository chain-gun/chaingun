import { GunEvent, GunGraphData } from '@chaingun/client'
import { FederatedGunGraphAdapter } from '@chaingun/federation-adapter'

type ChangeSetEntry = readonly [string, GunGraphData]

interface SCChannel {
  readonly watch: (msg: any) => void
  readonly unsubscribe: () => void
}

interface SCClient {
  readonly subscribe: (channel: string) => SCChannel
}

export class ChangelogFeed {
  protected readonly adapter: FederatedGunGraphAdapter
  protected readonly sc: SCClient
  protected readonly changelogEvent: GunEvent<string, GunGraphData>
  // tslint:disable-next-line: readonly-keyword
  protected channel: SCChannel | null

  constructor(adapter: FederatedGunGraphAdapter, sc: SCClient) {
    this.channel = null
    this.adapter = adapter
    this.sc = sc
    this.changelogEvent = new GunEvent<string, GunGraphData>('ChangelogEvent')
  }

  public feed(
    handler: (key: string, diff: GunGraphData) => void,
    from = ''
  ): () => void {
    // tslint:disable-next-line: no-let
    let lastKey: string = from || ''
    // tslint:disable-next-line: no-let
    let caughtUp = !from

    // tslint:disable-next-line: readonly-array
    const backlog: ChangeSetEntry[] = []
    const internalHandler = (key: string, diff: GunGraphData) => {
      if (caughtUp) {
        handler(key, diff)
        lastKey = key
      } else {
        backlog.splice(0, 0, [key, diff])
      }
    }
    ;(async () => {
      if (!from) {
        return
      }

      const getNext = this.adapter.getChangesetFeed(from)
      // tslint:disable-next-line: no-let
      let entry: ChangeSetEntry | null | undefined

      // tslint:disable-next-line: no-conditional-assignment
      while ((entry = await getNext())) {
        const [key, diff] = entry
        if (key > lastKey) {
          handler(key, diff)
          lastKey = key
        }
      }

      // tslint:disable-next-line: no-conditional-assignment
      while ((entry = backlog.pop())) {
        const [key, diff] = entry

        if (key > lastKey) {
          handler(key, diff)
          lastKey = key
        }
      }

      caughtUp = true
    })().catch(error => {
      // tslint:disable-next-line: no-console
      console.error('Changelog Feed Error', error.stack || error)
    })

    this.on(internalHandler)
    return () => this.off(handler)
  }

  protected on(handler: (key: string, diff: GunGraphData) => void): void {
    this.changelogEvent.on(handler)
    this.subscribe()
  }

  protected off(handler: (key: string, diff: GunGraphData) => void): void {
    this.changelogEvent.off(handler)

    if (this.changelogEvent.listenerCount() <= 0) {
      this.unsubscribe()
    }
  }

  protected unsubscribe(): void {
    // tslint:disable-next-line: no-unused-expression
    this.channel && this.channel.unsubscribe()
    // tslint:disable-next-line: no-object-mutation
    this.channel = null
  }

  protected subscribe(): void {
    if (this.channel) {
      return
    }

    // tslint:disable-next-line: no-object-mutation
    this.channel = this.sc.subscribe('gun/nodes/changelog')

    this.channel.watch(msg => {
      if (!msg || !msg.put || !msg.put.changelog) {
        return
      }

      Object.keys(msg.put.changelog)
        .sort()
        .forEach(key => {
          if (key === '_') {
            return
          }

          this.changelogEvent.trigger(key, msg.put.changelog[key])
        })
    })
  }
}
