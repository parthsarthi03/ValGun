import canonicalize from 'canonicalize';

import { MessageSocket } from './messageSocket';
import type Node from './node';
import { objectToHash } from './objectToHash';
import { Block } from './types';

function waitForBlock(node: Node, blockId: string, errorMessage: string) {
  return new Promise<void>((resolve, reject) => {
    const listener = () => {
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(() => {
      reject(new Error(errorMessage));
      node.off(`block_${blockId}_stored`, listener);
    }, 1000);
    node.once(`block_${blockId}_stored`, listener);
  });
}

async function getBlock(node: Node, socket: MessageSocket, blockId: string) {
  if (!(await node.blocksDb.exists(blockId))) {
    node.sendGetBlock(socket, blockId);
    await waitForBlock(node, blockId, `Block ${blockId} not found`);
    if (!(await node.blocksDb.exists(blockId))) {
      throw new Error(`Block ${blockId} not properly stored`);
    }
  }
  return await node.blocksDb.get(blockId);
}

async function reorgMempool(
  node: Node,
  socket: MessageSocket,
  oldChainTip: string,
  newChainTip: string
) {
  const visitedBlockIds = new Set([oldChainTip, newChainTip]);
  let currentOldChainBlockId = oldChainTip;
  let currentNewChainBlockId = newChainTip;
  let forkBlockId: string;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const currentOldChainBlock = await getBlock(
      node,
      socket,
      currentOldChainBlockId
    );
    if (!currentOldChainBlock.prevId) {
      throw Error('Reached genesis block');
    }
    currentOldChainBlockId = currentOldChainBlock.prevId;
    if (visitedBlockIds.has(currentOldChainBlockId)) {
      forkBlockId = currentOldChainBlockId;
      break;
    }
    visitedBlockIds.add(currentOldChainBlockId);
    const currentNewChainBlock = await getBlock(
      node,
      socket,
      currentNewChainBlockId
    );
    if (!currentNewChainBlock.prevId) {
      throw Error('Reached genesis block');
    }
    currentNewChainBlockId = currentNewChainBlock.prevId;
    if (visitedBlockIds.has(currentNewChainBlockId)) {
      forkBlockId = currentNewChainBlockId;
      break;
    }
    visitedBlockIds.add(currentNewChainBlockId);
  }
  let currentBlockId = oldChainTip;
  while (currentBlockId !== forkBlockId) {
    const currentBlock = await getBlock(node, socket, currentBlockId);
    for (const entry of currentBlock.entries) {
      node.mempool.push(entry);
      await node.removeFromConfirmed(currentBlockId, entry.key, entry.hash);
    }
    if (!currentBlock.prevId) {
      throw Error('Reached genesis block');
    }
    currentBlockId = currentBlock.prevId;
  }
  currentBlockId = newChainTip;
  while (currentBlockId !== forkBlockId) {
    const currentBlock = await getBlock(node, socket, currentBlockId);
    for (const entry of currentBlock.entries) {
      node.mempool = node.mempool.filter(
        (e) => JSON.stringify(e) !== JSON.stringify(entry)
      );
      await node.addToConfirmed(currentBlockId, entry.key, entry.hash);
    }
    if (!currentBlock.prevId) {
      throw Error('Reached genesis block');
    }
    currentBlockId = currentBlock.prevId;
  }
}

export async function validateBlock(
  node: Node,
  block: Block,
  socket: MessageSocket
) {
  try {
    const blocksDb = node.blocksDb;
    const blockId = objectToHash(block);
    if (block.T !== node.proofOfWorkTarget) {
      throw new Error('Invalid proof of work target');
    }
    if (blockId >= block.T) {
      throw new Error('Proof of work is not valid');
    }

    const prevBlockId = block.prevId;
    if (prevBlockId) {
      if (!(await blocksDb.exists(prevBlockId))) {
        node.sendGetBlock(socket, prevBlockId);
        await waitForBlock(node, prevBlockId, `Block ${prevBlockId} not found`);
        if (!(await blocksDb.exists(prevBlockId))) {
          throw new Error(`Block ${prevBlockId} not properly stored`);
        }
      }
      if (!(await blocksDb.exists(prevBlockId))) {
        throw new Error(`Block ${prevBlockId} not properly stored`);
      }
      const prevBlock = await blocksDb.get(prevBlockId);
      if (block.created <= prevBlock.created || block.created > Date.now()) {
        throw new Error('Invalid block timestamp');
      }
      if (block.height !== prevBlock.height + 1) {
        throw new Error('Invalid block height');
      }
    } else {
      if (blockId !== node.genesisId) {
        throw new Error(`Invalid genesis block ${blockId}`);
      }
      if (block.height !== 0) {
        throw new Error('Invalid block height');
      }
    }

    if (block.created > node.startTimestamp) {
      console.log('MADE IT TO DB CHECK');
      for (const { key, hash } of block.entries) {
        const entryExists = await node.entriesDb.exists(
          canonicalize({ key, hash }) ?? ''
        );
        if (!entryExists) {
          throw new Error(`Entry for key ${key} and hash ${hash} not found`);
        }
      }
    }
    console.log('REORG CHECKING');
    console.log(block.prevId);
    console.log(node.longestChainTip?.blockId);
    if (
      !node.longestChainTip ||
      (block.height > node.longestChainTip.height &&
        block.prevId !== node.longestChainTip.blockId)
    ) {
      if (node.longestChainTip) {
        await reorgMempool(node, socket, node.longestChainTip.blockId, blockId);
      } else {
        for (const entry of block.entries) {
          node.mempool = node.mempool.filter(
            (e) => JSON.stringify(e) !== JSON.stringify(entry)
          );
        }
      }
      node.longestChainTip = {
        blockId,
        height: block.height
      };
    } else if (node.longestChainTip?.blockId === blockId) {
      for (const entry of block.entries) {
        node.mempool = node.mempool.filter(
          (e) => JSON.stringify(e) !== JSON.stringify(entry)
        );
        await node.addToConfirmed(blockId, entry.key, entry.hash);
      }
      node.updateMinerBlock(blockId, block);
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: String(error) };
  }
}
