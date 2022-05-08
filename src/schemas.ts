import { JSONSchemaType } from 'ajv';

import {
  Block,
  BlockEntry,
  ChainTipMessage,
  ErrorMessage,
  GetBlockMessage,
  IHaveBlockMessage,
  PutValidatedValueSchema,
  Value
} from './types';

export const idSchema = { type: 'string' } as const;

export const valueSchema: JSONSchemaType<Value> = {
  type: 'object',
  additionalProperties: true
};

export const putValidatedValueSchema: JSONSchemaType<PutValidatedValueSchema> =
  {
    type: 'object',
    properties: {
      key: { type: 'string' },
      value: valueSchema
    },
    required: ['key', 'value'],
    additionalProperties: false
  };

export const blockEntrySchema: JSONSchemaType<BlockEntry> = {
  type: 'object',
  properties: {
    key: { type: 'string' },
    hash: idSchema
  },
  required: ['key', 'hash'],
  additionalProperties: false
};

export const blockSchema: JSONSchemaType<Block> = {
  type: 'object',
  properties: {
    type: { type: 'string', const: 'block' },
    T: idSchema,
    created: { type: 'number', minimum: 0 },
    miner: { type: 'string', nullable: true },
    nonce: idSchema,
    note: { type: 'string', nullable: true },
    height: { type: 'number', minimum: 0 },
    prevId: { type: 'string', nullable: true },
    entries: { type: 'array', items: blockEntrySchema }
  },
  required: ['type', 'T', 'created', 'nonce', 'height', 'entries'],
  additionalProperties: false
};

export const errorMessageSchema: JSONSchemaType<ErrorMessage> = {
  type: 'object',
  properties: {
    type: { type: 'string', const: 'error' },
    error: { type: 'string' }
  },
  required: ['type', 'error'],
  additionalProperties: false
};

export const chainTipMessageSchema: JSONSchemaType<ChainTipMessage> = {
  type: 'object',
  properties: {
    type: { type: 'string', const: 'chainTip' },
    blockId: idSchema
  },
  required: ['type', 'blockId'],
  additionalProperties: false
};

export const getBlockMessageSchema: JSONSchemaType<GetBlockMessage> = {
  type: 'object',
  properties: {
    type: { type: 'string', const: 'getBlock' },
    blockId: idSchema
  },
  required: ['type', 'blockId'],
  additionalProperties: false
};

export const iHaveBlockMessageSchema: JSONSchemaType<IHaveBlockMessage> = {
  type: 'object',
  properties: {
    type: { type: 'string', const: 'iHaveBlock' },
    blockId: idSchema
  },
  required: ['type', 'blockId'],
  additionalProperties: false
};
