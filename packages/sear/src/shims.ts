import root from 'window-or-global';
import './base64';
import SafeBuffer from './SafeBuffer';

// tslint:disable-next-line: no-var-requires
const isocrypto = require('isomorphic-webcrypto');

export const crypto = isocrypto.default || isocrypto;

export const Buffer = SafeBuffer;

const api: any = {
  Buffer,
  TextDecoder: root && root.TextDecoder,
  TextEncoder: root && root.TextEncoder
};
// tslint:disable-next-line: no-expression-statement no-object-mutation
api.random = (len: number) =>
  api.Buffer.from(
    crypto.getRandomValues(new Uint8Array(api.Buffer.alloc(len)))
  );

if (!api.TextEncoder) {
  // tslint:disable-next-line: no-eval no-shadowed-variable
  const { TextEncoder, TextDecoder } = eval('require')('text-encoding');
  // tslint:disable-next-line: no-expression-statement no-object-mutation
  api.TextEncoder = TextEncoder;
  // tslint:disable-next-line: no-expression-statement no-object-mutation
  api.TextDecoder = TextDecoder;
}

export const TextEncoder = api.TextEncoder;
export const TextDecoder = api.TextDecoder;
export const random = api.random;
