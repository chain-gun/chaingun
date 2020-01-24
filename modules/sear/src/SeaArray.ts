// tslint:disable

import { base64 } from './base64'

// This is Array extended to have .toString(['utf8'|'hex'|'base64'])
function SeaArray() {}
Object.assign(SeaArray, { from: Array.from })
SeaArray.prototype = Object.create(Array.prototype)
SeaArray.prototype.toString = function(enc: string, start: number, end: number) {
  enc = enc || 'utf8'
  start = start || 0
  const length = this.length
  if (enc === 'hex') {
    const buf = new Uint8Array(this)
    const num = ((end && end + 1) || length) - start
    let res = ''
    for (let i = 0; i < num; i++) {
      res += buf[i + start].toString(16).padStart(2, '0')
    }
    return res
  }
  if (enc === 'utf8') {
    const num = (end || length) - start
    let res = ''
    for (let i = 0; i < num; i++) {
      res += String.fromCharCode(this[i + start])
    }
    return res
  }
  if (enc === 'base64') {
    return base64.btoa(this)
  }
}

export default <any>SeaArray
