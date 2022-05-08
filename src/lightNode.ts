import { MessageSocket } from './messageSocket';
import { Message, Value } from './types';

export default class LightNode {
  public readonly type = 'light';

  public async start() {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async storeKeyHash(key: string, value: Value) {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async onMessage(socket: MessageSocket, rawMessage: Message) {
    return;
  }
}
