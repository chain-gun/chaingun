import { GunMsg } from '@chaingun/types'
import { GunEvent } from './GunEvent'
import { GunQueue } from './GunQueue'
import { MiddlewareSystem } from './MiddlewareSystem'

type ProcessDupesOption = 'process_dupes' | 'dont_process_dupes'

export class GunProcessQueue<T = GunMsg, U = any, V = any> extends GunQueue<T> {
  public readonly middleware: MiddlewareSystem<T, U, V>
  public readonly isProcessing: boolean
  public readonly completed: GunEvent<T>
  public readonly emptied: GunEvent<boolean>
  public readonly processDupes: ProcessDupesOption

  // tslint:disable-next-line: readonly-keyword readonly-array
  protected alreadyProcessed: T[]

  constructor(
    name = 'GunProcessQueue',
    processDupes: ProcessDupesOption = 'process_dupes'
  ) {
    super(name)
    this.alreadyProcessed = []
    this.isProcessing = false
    this.processDupes = processDupes
    this.completed = new GunEvent<T>(`${name}.processed`)
    this.emptied = new GunEvent<boolean>(`${name}.emptied`)
    this.middleware = new MiddlewareSystem<T, U, V>(`${name}.middleware`)
  }

  public has(item: T): boolean {
    return super.has(item) || this.alreadyProcessed.indexOf(item) !== -1
  }

  public async processNext(b?: U, c?: V): Promise<void> {
    // tslint:disable-next-line: no-let
    let item = this.dequeue()
    const processedItem = item

    if (!item) {
      return
    }

    item = await this.middleware.process(item, b, c)

    if (processedItem && this.processDupes === 'dont_process_dupes') {
      this.alreadyProcessed.push(processedItem)
    }

    if (item) {
      this.completed.trigger(item)
    }
  }

  public enqueueMany(items: readonly T[]): GunProcessQueue<T, U, V> {
    super.enqueueMany(items)
    return this
  }

  public async process(): Promise<void> {
    if (this.isProcessing) {
      return
    }

    if (!this.count()) {
      return
    }

    // @ts-ignore
    this.isProcessing = true
    while (this.count()) {
      try {
        await this.processNext()
      } catch (e) {
        // tslint:disable-next-line: no-console
        console.error('Process Queue error', e.stack)
      }
    }

    this.emptied.trigger(true)

    // @ts-ignore
    this.isProcessing = false
  }
}
