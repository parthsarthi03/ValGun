import { ExtendedGun, Message } from './types';

export class MessageSocket {
  constructor(public gun: ExtendedGun, public address: string) {}

  send<T extends Message>(message: T) {
    this.gun.gossip(message);
  }

  end() {
    return;
  }

  destroy() {
    return;
  }
}
