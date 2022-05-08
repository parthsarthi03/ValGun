import EventEmitter from 'events';
import { IGunChainReference } from 'gun/types/chain';
import { IGunConstructorOptions } from 'gun/types/options';

import type getConfirmed from './getConfirmed';
import type getValidated from './getValidated';
import type LightNode from './lightNode';
import type Node from './node';
import type putValidated from './putValidated';

interface GunInMessage {
  put?: Record<string, Value>;
  body?: Message;
}

type OutEvent = (event: 'out', data: unknown) => void;
type InEvent = (
  event: 'in',
  callback: (
    this: { to: { next: (message: GunInMessage) => void } },
    message: GunInMessage
  ) => void
) => void;

export interface ExtendedGun extends IGunChainReference {
  getValidated: typeof getValidated;
  getConfirmed: typeof getConfirmed;
  putValidated: typeof putValidated;
  gossip: (message: Message) => void;
  _: {
    opt: {
      dbId: string;
    };
    on: OutEvent & InEvent;
  };
  eventEmitter: EventEmitter;
  node: Node | LightNode;
}

export type Value = Record<string, unknown>;

export interface ExtendedIGunConstructorOptions extends IGunConstructorOptions {
  isLight: boolean;
  dbId: string;
  validate: (
    gun: ExtendedGun,
    key: string,
    value: Value
  ) => boolean | Promise<boolean>;
}

export interface PutValidatedValueSchema {
  key: string;
  value: Value;
}

export interface BlockEntry {
  key: string;
  hash: string;
}

export interface Block {
  type: 'block';
  T: string;
  created: number;
  miner?: string;
  nonce: string;
  note?: string;
  height: number;
  prevId: string | null;
  entries: BlockEntry[];
}

export interface Message {
  [key: string]: unknown;
  type: string;
}

export interface ErrorMessage {
  type: 'error';
  error: string;
}

export interface ChainTipMessage {
  type: 'chainTip';
  blockId: string;
}

export interface GetBlockMessage {
  type: 'getBlock';
  blockId: string;
}

export interface IHaveBlockMessage {
  type: 'iHaveBlock';
  blockId: string;
}
