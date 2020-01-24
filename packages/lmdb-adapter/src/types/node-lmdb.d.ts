declare module 'node-lmdb' {
  export class Cursor {
    constructor(txn: any, dby: any)
    close(): any
    del(): any
    getCurrentBinary(): any
    getCurrentBinaryUnsafe(): any
    getCurrentBoolean(): any
    getCurrentNumber(): any
    getCurrentString(): string | undefined
    getCurrentStringUnsafe(): string | undefined
    goToDup(): string | undefined
    goToDupRange(): string | undefined
    goToFirst(): string | undefined
    goToFirstDup(): string | undefined
    goToKey(key: string): string | undefined
    goToLast(): string | undefined
    goToLastDup(): string | undefined
    goToNext(): string | undefined
    goToNextDup(): string | undefined
    goToPrev(): string | undefined
    goToPrevDup(): string | undefined
    goToRange(key: string): string | undefined
  }
  export class Env {
    beginTxn(): any
    close(): any
    info(): any
    open(opts: any): any
    openDbi(opts?: any): any
    resize(): any
    stat(): any
    sync(): any
  }
  export const path: string
  export const version: {
    major: number
    minor: number
    patch: number
    versionString: string
  }
}
