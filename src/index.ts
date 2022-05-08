import EventEmitter from 'events';
import Gun from 'gun';

import getConfirmed from './getConfirmed';
import getValidated from './getValidated';
import interceptTraffic from './interceptTraffic';
import type LightNode from './lightNode';
import { MessageSocket } from './messageSocket';
import type Node from './node';
import { stringToHash } from './objectToHash';
import { parsePutValidatedValue } from './parsers';
import putValidated from './putValidated';
import {
  ExtendedGun,
  ExtendedIGunConstructorOptions,
  Message,
  Value
} from './types';

function validateHash(key: string, data?: string) {
  const hash = stringToHash(data ?? '');
  console.log(hash);
  return `hash${hash}` === key;
}

async function getNode(
  isLight: boolean
): Promise<typeof Node | typeof LightNode> {
  if (isLight) {
    const { default: Node } = await import('./lightNode');
    return Node;
  } else {
    const { default: Node } = await import('./node');
    return Node;
  }
}

export default async function getGun({
  isLight,
  validate,
  ...options
}: ExtendedIGunConstructorOptions) {
  function interceptPut(data: Record<string, Value>) {
    const dataEntries = Object.entries(data);
    return dataEntries.every(([key, value]) => {
      if (key.startsWith('hash')) {
        return validateHash(key, (value as { data: string }).data); // Validate hash
      } else {
        // Reject all other form of data for now
        // TODO: Allow regular gun DB data
        return false;
      }
    });
  }

  async function validateData(data: string) {
    const { value: putValidatedValue } = parsePutValidatedValue(
      JSON.parse(data)
    );
    if (!putValidatedValue) return;
    const { key, value } = putValidatedValue;
    const valid = await validate(gun, key, value);
    if (!valid) return;
    node.storeKeyHash(key, value);
  }

  function validateBody(message: Message) {
    console.log('VALIDATING BODY');
    console.log(message);
    console.log('------------------------------');
    if (message.type === 'validate') {
      validateData(String(message.data));
      return true;
    } else if (message.type === 'getValidated') {
      if (message.key && node.type === 'full') {
        node.getValidated(String(message.key)).then((hash) => {
          gun.gossip({ type: 'onGetValidated', key: message.key, hash });
        });
      }
      return false;
    } else if (message.type === 'getConfirmed') {
      if (message.key && node.type === 'full') {
        node.getConfirmed(String(message.key)).then((hash) => {
          gun.gossip({
            type: 'onGetConfirmed',
            key: message.key,
            hash
          });
        });
      }
      return false;
    } else if (message.type === 'onGetValidated') {
      if (message.key) {
        gun.eventEmitter.emit(`onGetValidated_${message.key}`, message.hash);
      }
      return false;
    } else if (message.type === 'onGetConfirmed') {
      if (message.key) {
        gun.eventEmitter.emit(`onGetConfirmed_${message.key}`, message.hash);
      }
      return false;
    } else {
      const socket = new MessageSocket(gun, 'unknown');
      node.onMessage(socket, message);
      return message.type === 'iHaveBlock';
    }
  }

  const gun = Gun(options) as ExtendedGun;
  gun.getValidated = getValidated;
  gun.getConfirmed = getConfirmed;
  gun.putValidated = putValidated;
  gun.gossip = (message: Message) => {
    gun._.on('out', {
      body: message
    });
  };
  gun.eventEmitter = new EventEmitter();
  interceptTraffic(gun, interceptPut, validateBody);
  const Node = await getNode(isLight);
  const node = new Node(gun);
  gun.node = node;
  await node.start();
  if (node.type === 'full') {
    node.on('error', (error) => console.log(error));
  }
  return {
    gun
  };
}
