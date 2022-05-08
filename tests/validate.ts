import { verify } from '@noble/ed25519';
import canonicalize from 'canonicalize';

import { ExtendedGun, Value } from '../src/types';
import { fromHexString, toBytes } from './helpers';
import { Politician, PoliticianRating } from './types';

const TRUSTED_PUBLIC_KEYS: string[] = [
  '47a4a626a960131593f65deaf967c1469baf861ec344462e1a67fa731212c3ec',
  'ef66fe466ce533fadba72f222d78c70d4d9a715ae20402dfa86e3370700185ae',
  '1cae1235864e628bad0c7ae91aaedee980cc248219e7fa0552522ae06116b22c',
  '36e5fc2559b2fd24f4f2027c668a57cc25888dc7403d9222bada082f2944a359',
  '3f5b46b041a8b7d01fad0b80fdd08af105a3c5ee66e2c2b9eddf69fdd764d03b'
];

export async function validate(gun: ExtendedGun, key: string, value: Value) {
  try {
    if (key.includes('rating')) {
      // Expose this function to the Gun instance

      // Assume key is of the form rating-pubkey
      // Assume value is of form { politician: string, rating: number, signature: string }
      const items = key.split('-');
      const politicianId = items[0];
      const pubkey = items[items.length - 1];
      if (!value.pubkey) return false;
      if (value.pubkey !== pubkey) return false;
      const voteObject = value as unknown as PoliticianRating;

      if (politicianId !== voteObject.politician) return false;

      // Validate vote signature and unique user
      if (!TRUSTED_PUBLIC_KEYS.includes(voteObject.pubkey)) return false;
      const voteObjectWithoutSig = { ...voteObject, signature: null };
      const signedMessage = toBytes(canonicalize(voteObjectWithoutSig) ?? '');
      const verified = await verify(
        fromHexString(voteObject.signature ?? ''),
        signedMessage,
        fromHexString(voteObject.pubkey)
      );
      if (!verified) return false;

      if (gun.node.type === 'full') {
        const hash = await gun.node.getValidated(key);
        if (hash) return false;
      }

      if (![0, 1, 2, 3, 4, 5].includes(voteObject.rating)) {
        return false;
      }
      if (gun.node.type === 'full') {
        const hash = await gun.node.getValidated(voteObject.politician);
        if (!hash) return false;
        const politician = await new Promise<Politician | undefined>(
          (resolve) => {
            gun
              .get(`hash${hash}`)
              .once((data) =>
                resolve(
                  data ? (JSON.parse(data.data).value as Politician) : undefined
                )
              );
          }
        );
        if (!politician) return false;
        politician.ratingCount++;
        politician.score += voteObject.rating;
        gun.putValidated(voteObject.politician, politician as unknown as Value);
      }
      return true;
    } else if (key.startsWith('politician')) {
      const politician = value as unknown as Politician;
      if (politician.name.length > 50) return false;
      if (politician.ratingCount !== 0) return false;
      if (politician.score !== 0) return false;
      if (gun.node.type === 'full') {
        const hash = await gun.node.getValidated(key);
        if (hash) return false;
      }
      return true;
    } else {
      return false;
    }
  } catch (error) {
    console.log(`Error: ${error}`);
    return false;
  }
}
