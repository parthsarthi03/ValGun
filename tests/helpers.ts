const encoder = new TextEncoder();

export function toBytes(text: string) {
  return encoder.encode(text);
}

export function toHexString(byteArray: Uint8Array): string {
  return byteArray.reduce(
    (output, elem) => output + ('0' + elem.toString(16)).slice(-2),
    ''
  );
}

export function fromHexString(hexString: string): Uint8Array {
  return new Uint8Array(
    (hexString.match(/.{1,2}/g) ?? []).map((byte) => parseInt(byte, 16))
  );
}
