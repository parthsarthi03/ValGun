import { objectToHash } from './objectToHash';
import { Block } from './types';

process.on('message', (block: Block) => {
  console.log('MINING STARTED:');
  let nonce = BigInt(`0x${block.nonce}`);
  while (objectToHash(block) >= block.T) {
    nonce++;
    const newNonce = nonce.toString(16);
    block.nonce = '0'.repeat(64 - newNonce.length) + newNonce;
    block.created = Date.now();
  }
  console.log('BLOCK MINED:');
  console.log(block);
  process.send?.(block);
});
