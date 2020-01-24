export const base64: any = {}

// tslint:disable-next-line strict-type-predicates
if (typeof btoa === 'undefined') {
  // tslint:disable-next-line: no-object-mutation
  base64.btoa = function btoa(b: any): string {
    return Buffer.from(b, 'binary').toString('base64')
  }
} else {
  // tslint:disable-next-line: no-object-mutation
  base64.btoa = (x: string) => btoa(x)
}

// tslint:disable-next-line strict-type-predicates
if (typeof atob === 'undefined') {
  // tslint:disable-next-line: no-object-mutation
  base64.atob = function atob(b: any): string {
    return Buffer.from(b, 'base64').toString('binary')
  }
} else {
  // tslint:disable-next-line: no-object-mutation
  base64.atob = (x: string) => atob(x)
}
