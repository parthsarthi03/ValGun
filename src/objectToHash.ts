import canonicalize from 'canonicalize';
import { hash } from 'fast-sha256';
import { decodeUTF8 } from 'tweetnacl-util';

function toHexString(byteArray: Uint8Array): string {
  return byteArray.reduce(
    (output, elem) => output + ('0' + elem.toString(16)).slice(-2),
    ''
  );
}

export function objectToHash(object: object) {
  return toHexString(hash(decodeUTF8(canonicalize(object) ?? '')));
}

export function stringToHash(string: string) {
  return toHexString(hash(decodeUTF8(string)));
}
