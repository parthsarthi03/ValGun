import http from 'http';

import Gun from '../src';
import { validate } from './validate';

const server = http.createServer().listen(8081, () => {
  console.log('Server listening on port 8080');
});

async function main() {
  await Gun({
    web: server,
    isLight: false,
    dbId: 'server2',
    radisk: false,
    validate
  });
}

main();
