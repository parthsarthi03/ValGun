import { objectToHash } from './objectToHash';
import { Block } from './types';

process.on('message', (block: Block) => {
  console.log('MINING STARTED:');
  let nonce = BigInt(`0x${block.nonce}`);
  while (objectToHash(block) >= block.T) {
    nonce++;
    block.nonce = nonce.toString(16);
    block.created = Date.now();
  }
  console.log('BLOCK MINED:');
  console.log(block);
  process.send?.(block);
});
