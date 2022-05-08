import canonicalize from 'canonicalize';
import child_process from 'child_process';
import crypto from 'crypto';
import EventEmitter from 'events';
import Level from 'level-ts';
import { randomBytes } from 'node:crypto';
import path from 'path';

import { getDatabase } from './db';
import { MessageSocket } from './messageSocket';
import { objectToHash } from './objectToHash';
import {
  parseBlock,
  parseChainTipMessage,
  parseErrorMessage,
  parseGetBlockMessage,
  parseIHaveBlockMessage
} from './parsers';
import {
  Block,
  BlockEntry,
  ChainTipMessage,
  ExtendedGun,
  GetBlockMessage,
  IHaveBlockMessage,
  Message,
  Value
} from './types';
import { validateBlock } from './validateBlock';

/**
 * Individual node for Valgun
 */
export default class Node extends EventEmitter {
  public readonly type = 'full';
  public version = '0.8.0';
  public readonly versionRegex = /0\.8\.\d+/;
  public messageTimeoutDelay = 5000;
  public proofOfWorkTarget =
    '00001af000000000000000000000000000000000000000000000000000000000';
  public readonly commonPrefixParameter = 5; // Number of blocks that have to be mined on top of it before a block is confirmed
  public genesisId =
    '00000000a420b7cefa2b7730243316921ed59ffe836e111ca3801f82a4f5360e';
  public readonly socketToIncompleteMessages = new Map<
    MessageSocket,
    { message: string; timeout: NodeJS.Timeout }
  >();
  private agent: string;
  private miner: child_process.ChildProcess | undefined;
  private miningBlock: Block | undefined;
  public longestChainTip: { blockId: string; height: number } | undefined;
  public readonly blocksDb: Level<Block>;
  public readonly entriesDb: Level<boolean>;
  public readonly validatedDb: Level<string>;
  public readonly confirmedDb: Level<{ blockId: string; hash: string }[]>;
  public readonly startTimestamp = Date.now();
  public mempool = new Array<BlockEntry>();

  /**
   * @param serverHost - host of the node to be discovered by
   * @param serverPort - port of the node to be discovered on
   * @param peersFilePath - peers to connect to initially
   */
  constructor(private readonly gun: ExtendedGun) {
    super();
    this.agent = `Valgun-Core Client 0.1 - ${crypto.randomUUID()}`; // Used to identify this specific node instance
    this.blocksDb = getDatabase(`blocks-${gun._.opt.dbId}`);
    this.entriesDb = getDatabase(`entries-${gun._.opt.dbId}`);
    this.validatedDb = getDatabase(`validated-${gun._.opt.dbId}`);
    this.confirmedDb = getDatabase(`confirmed-${gun._.opt.dbId}`);
  }

  public gossip(message: Message) {
    this.gun.gossip(message);
  }

  public async addToConfirmed(blockId: string, key: string, hash: string) {
    if (await this.confirmedDb.exists(key)) {
      const confirmedEntries = await this.confirmedDb.get(key);
      confirmedEntries.push({ blockId, hash });
      await this.confirmedDb.put(key, confirmedEntries);
    } else {
      await this.confirmedDb.put(key, [{ blockId, hash }]);
    }
  }

  public async removeFromConfirmed(blockId: string, key: string, hash: string) {
    if (await this.confirmedDb.exists(key)) {
      const confirmedEntries = (await this.confirmedDb.get(key)).filter(
        (entry) => entry.hash !== hash
      );
      if (confirmedEntries.length) {
        await this.confirmedDb.put(key, confirmedEntries);
      } else {
        await this.confirmedDb.del(key);
      }
    }
  }

  /**
   * Starts the node server and connect to the bootstrapping peers.
   */
  public async start() {
    // TODO: Ask for longest chain tip from peers
    const genesis: Block = {
      type: 'block',
      T: this.proofOfWorkTarget,
      created: 1624219079,
      miner: 'Stanford',
      nonce: 'a26d92800cf58e88a5ecf37156c031a4147c2128beeaf1cca2785c93242a5cb4',
      note: 'The Economist 2021-06-20: Crypto-miners are probably to blame for the graphics-chip shortage',
      prevId: null,
      height: 0,
      entries: []
    };
    const genesisId = objectToHash(genesis);
    await this.blocksDb.put(genesisId, genesis);
    this.longestChainTip = { blockId: genesisId, height: 0 };
    this.updateMinerBlock(genesisId, genesis);
    // Because Gun DB takes time to initialize
    setTimeout(() => {
      this.gossip({
        type: 'getChainTip'
      });
    }, 1000);
  }

  /**
   * Stops the node by stopping the server and disconnecting from all peers.
   */
  public async stop() {
    this.emit('stopped');
    this.miner?.kill();
  }

  public async storeKeyHash(key: string, value: Value) {
    const hash = objectToHash({ key, value });
    const entry: BlockEntry = { key, hash };
    await this.entriesDb.put(canonicalize(entry) ?? '', true);
    await this.validatedDb.put(key, hash);
    console.log('ADDED TO DB:');
    console.log(canonicalize(entry) ?? '');
    console.log('ADDRESS');
    console.log('ADDING TO MEMPOOL');
    // The below console log always fails for some reason when mempool is used as a set. Does === compare objects by reference?
    // console.log(this.mempool.has(entry));
    for (const mempoolEntry of this.mempool) {
      if (JSON.stringify(mempoolEntry) === JSON.stringify(entry)) {
        return;
      }
    }
    this.mempool.push(entry);
    this.miningBlock?.entries.push(entry);
    this.restartMiner();
  }

  public async updateMinerBlock(prevBlockId: string, prevBlock: Block) {
    const block: Block = {
      type: 'block',
      T: this.proofOfWorkTarget,
      created: Date.now(),
      miner: this.agent,
      nonce: randomBytes(32).toString('hex'), // 32 bytes = 256 bits
      height: prevBlock.height + 1,
      prevId: prevBlockId,
      entries: this.mempool
    };
    this.miningBlock = block;
    this.restartMiner();
  }

  public async restartMiner() {
    if (!this.miningBlock) return;
    this.miner?.kill();
    this.miner = child_process.fork(path.join(__dirname, '../dist/mining.js'));
    this.miner?.send(this.miningBlock);
    this.miner.on('message', async (block: Block) => {
      this.emit('mined_block', block);
      this.emit('block', block);
      const blockId = objectToHash(block);
      await this.blocksDb.put(blockId, block);
      this.emit(`block_${blockId}_stored`);
      this.gossip({
        type: 'iHaveBlock',
        blockId
      });
      for (const entry of block.entries) {
        this.mempool = this.mempool.filter(
          (e) => JSON.stringify(e) !== JSON.stringify(entry)
        );
        await this.addToConfirmed(blockId, entry.key, entry.hash);
      }
      this.longestChainTip = {
        blockId,
        height: block.height
      };
      this.updateMinerBlock(blockId, block);
    });
  }

  public async getValidated(key: string) {
    if (await this.validatedDb.exists(key)) {
      const hash = await this.validatedDb.get(key);
      return hash;
    } else {
      return this.getConfirmed(key, true);
    }
  }

  public async getConfirmed(key: string, avoidPrefix = false) {
    let highestEntryHash: string | undefined;
    if (await this.confirmedDb.exists(key)) {
      const confirmedEntries = await this.confirmedDb.get(key);
      let highestEntryHeight = -1;
      for (const entry of confirmedEntries) {
        console.log('GETTING BLOCK', entry.blockId);
        if (await this.blocksDb.exists(entry.blockId)) {
          const block = await this.blocksDb.get(entry.blockId);
          if (
            (avoidPrefix ||
              block.height <=
                (this.longestChainTip?.height ?? 0) -
                  this.commonPrefixParameter) &&
            block.height > highestEntryHeight
          ) {
            highestEntryHeight = block.height;
            highestEntryHash = entry.hash;
          }
        }
      }
    }
    return highestEntryHash;
  }

  /**
   * Sends an error message to a peer.
   *
   * @param socket - socket connection to send the error to
   */
  public sendError(socket: MessageSocket, error: string) {
    try {
      socket.send({
        type: 'error',
        error
      });
    } catch (error) {
      this.emit(`Failed to send error message "${error}"`);
    }
  }

  private sendChainTip(socket: MessageSocket) {
    if (this.longestChainTip) {
      socket.send({
        type: 'chainTip',
        blockId: this.longestChainTip.blockId
      });
    }
  }

  public sendGetBlock(socket: MessageSocket, blockId: string) {
    socket.send({
      type: 'getBlock',
      blockId
    });
  }

  private sendBlockMessage(socket: MessageSocket, block: Block) {
    socket.send(block as unknown as Message);
  }

  private async onChainTip(socket: MessageSocket, message: ChainTipMessage) {
    this.emit('chainTip', message.blockId);
    this.sendGetBlock(socket, message.blockId);
  }

  private async onGetBlock(socket: MessageSocket, message: GetBlockMessage) {
    this.emit('getBlock', message.blockId);
    const hasDbBlock = await this.blocksDb.exists(message.blockId);
    if (!hasDbBlock) {
      this.sendError(socket, `Block ${message.blockId} not found`);
      return;
    }
    const dbBlock = await this.blocksDb.get(message.blockId);
    this.sendBlockMessage(socket, dbBlock);
  }

  private async onIHaveBlock(
    socket: MessageSocket,
    message: IHaveBlockMessage
  ) {
    this.emit('iHaveBlock', message.blockId);
    const hasDbBlock = await this.blocksDb.exists(message.blockId);
    if (hasDbBlock) return;
    this.sendGetBlock(socket, message.blockId);
  }

  public async onBlock(socket: MessageSocket, block: Block) {
    this.emit('block', block);
    const blockId = objectToHash(block);
    const hasDbBlock = await this.blocksDb.exists(blockId);
    if (hasDbBlock) return;
    const { valid, error } = await validateBlock(this, block, socket);
    if (!valid) {
      this.emit('validation_error', error);
      this.sendError(socket, error ?? 'Unknown validation error');
      return;
    }
    await this.blocksDb.put(blockId, block);
    this.emit(`block_${blockId}_stored`);
    this.gossip({
      type: 'iHaveBlock',
      blockId
    });
  }

  /**
   * Provides a message to this node from a socket.
   *
   * @param socket - socket connection with the message sender
   * @param message - message to process
   */
  public async onMessage(socket: MessageSocket, rawMessage: Message) {
    try {
      this.emit('message', canonicalize(rawMessage), socket.address);

      if (rawMessage.type === 'invalid') {
        this.sendError(socket, 'Invalid JSON message received');
        socket.end();
        return;
      }

      if (rawMessage.type === 'getChainTip') {
        this.sendChainTip(socket);
        this.emit('getChainTip', socket.address);
      } else if (rawMessage.type === 'chainTip') {
        const { value: message } = parseChainTipMessage(rawMessage);
        if (!message) {
          this.sendError(socket, 'Unsupported chainTip message received');
          return;
        }
        await this.onChainTip(socket, message);
      } else if (rawMessage.type === 'getBlock') {
        const { value: message } = parseGetBlockMessage(rawMessage);
        if (!message) {
          this.sendError(socket, 'Unsupported getBlock message received');
          return;
        }
        await this.onGetBlock(socket, message);
      } else if (rawMessage.type === 'iHaveBlock') {
        const { value: message } = parseIHaveBlockMessage(rawMessage);
        if (!message) {
          this.sendError(socket, 'Unsupported iHaveBlock message received');
          return;
        }
        await this.onIHaveBlock(socket, message);
      } else if (rawMessage.type === 'block') {
        const { value: message } = parseBlock(rawMessage);
        console.log('Will this pop up on client exec?');
        console.log(rawMessage);
        console.log(parseBlock(rawMessage));
        if (!message) {
          this.sendError(socket, 'Unsupported block message received');
          return;
        }
        await this.onBlock(socket, message);
      } else if (rawMessage.type === 'error') {
        const { value: message } = parseErrorMessage(rawMessage);
        if (!message) {
          this.sendError(socket, 'Unsupported error message received');
          socket.end();
          return;
        }
        this.emit(
          'error',
          `Error from peer ${socket.address}: ${message.error}`
        );
      } else {
        this.sendError(
          socket,
          `Unsupported message type received: ${rawMessage.type}`
        );
        socket.end();
      }
    } catch (error) {
      this.emit('error', error);
      try {
        this.sendError(socket, 'Unknown error occured');
      } catch (error) {
        this.emit('error', error);
      }
      socket.end();
    }
  }
}
