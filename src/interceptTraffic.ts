import { ExtendedGun, Message, Value } from './types';

export default function interceptTraffic(
  gun: ExtendedGun,
  interceptPut: (data: Record<string, Value>) => boolean,
  validateBody: (data: Message) => boolean
) {
  const context = gun._;

  // Check all incoming traffic
  context.on('in', function (message) {
    const to = this.to;
    if (message.put) {
      if (interceptPut(message.put)) {
        to.next(message);
      }
    } else if (message.body) {
      if (validateBody(message.body)) {
        to.next(message);
      }
    } else {
      to.next(message);
    }
  });
}
