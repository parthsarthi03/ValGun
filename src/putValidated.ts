import canonicalize from 'canonicalize';
import { IGunChainReference } from 'gun/types/chain';

import { objectToHash } from './objectToHash';
import { ExtendedGun, Value } from './types';

export default function putValidated<T extends Value>(
  this: ExtendedGun,
  key: string,
  value: T,
  gossip = true
): IGunChainReference {
  const data = { key, value };
  if (gossip)
    this.gossip({
      type: 'validate',
      data: canonicalize(data)
    });
  if (this.node.type === 'full') {
    this.node.storeKeyHash(key, value);
  }
  console.log(`entries-${this._.opt.dbId}`);
  console.log('PUT', objectToHash(data));
  return this.get(`hash${objectToHash(data)}`).put({
    data: canonicalize(data)
  });
}
