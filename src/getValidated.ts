import { ExtendedGun, Value } from './types';

export default function getValidated<T extends Value>(
  this: ExtendedGun,
  key: string,
  callback: (data: T | undefined, key: string) => void
): void {
  this.gossip({ type: 'getValidated', key });
  this.eventEmitter.on(`onGetValidated_${key}`, (hash) => {
    if (hash) {
      this.get(`hash${hash}`).once((data) =>
        callback(data ? (JSON.parse(data.data) as T) : undefined, key)
      );
    } else {
      callback(undefined, key);
    }
  });
}
