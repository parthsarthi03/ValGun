import * as ed from '@noble/ed25519';
import canonicalize from 'canonicalize';
import http from 'http';

import Gun from '../src';
import { Value } from '../src/types';
import { delay } from './delay';
import { fromHexString, toBytes, toHexString } from './helpers';
import { Politician, PoliticianRating } from './types';
import { validate } from './validate';

const server = http.createServer().listen(8082, () => {
  console.log('Server listening on port 8081');
});

const PRIVATE_KEYS: string[] = [
  'd712cc93918539796a9625416f67513cfb9c9ccde54fd83707e2e6b346db3203',
  'f631b2ece76321ea7a038e11fb37b44112bf25a9885f85a213cebc2cc258474e',
  'cfee8710395a7d5d97e7bcd711b23ada24d4acce70f1571fd0fbb18f182c575d',
  '47672373fbaca83176b20360b7bd0fa13066a42c42a5fd3ee7c7ce9652a84175',
  'c3f445f2a7b4118980f5b24df1ad53bd9e1420188e642e76a994381d1cde8f9d'
];

async function main() {
  const PUBLIC_KEYS: string[] = [];
  for (const privateKey of PRIVATE_KEYS) {
    PUBLIC_KEYS.push(
      toHexString(await ed.getPublicKey(fromHexString(privateKey)))
    );
  }

  const addUserRating = async (userIndex: number, userRating: number) => {
    const rating: PoliticianRating = {
      pubkey: PUBLIC_KEYS[userIndex],
      politician: 'politician1',
      rating: userRating,
      signature: null
    };
    const signature = toHexString(
      await ed.sign(
        toBytes(canonicalize(rating) ?? ''),
        fromHexString(PRIVATE_KEYS[userIndex])
      )
    );
    rating.signature = signature;
    gun.putValidated(
      `politician1-rating-${rating.pubkey}`,
      rating as unknown as Value
    );
  };

  const { gun } = await Gun({
    web: server,
    peers: ['http://localhost:8080/gun'],
    radisk: false,
    isLight: true,
    dbId: 'client',
    validate
  });

  await delay(1000);

  gun.putValidated('politician1', {
    name: 'John Doe',
    ratingCount: 0,
    score: 0
  } as Politician as unknown as Value);

  await delay(5000);

  addUserRating(0, 5);

  await delay(10000);

  gun.getValidated('politician1', (data, key) =>
    console.log(`Got validated ${key}: ${JSON.stringify(data)}`)
  );
  gun.getConfirmed('politician1', (data, key) =>
    console.log(`Got confirmed ${key}: ${JSON.stringify(data)}`)
  );
}

main();
