import http from 'http';

import Gun from '../src';
import { validate } from './validate';

const server = http.createServer().listen(8080, () => {
  console.log('Server listening on port 8080');
});

async function main() {
  await Gun({
    web: server,
    isLight: false,
    dbId: 'server1',
    radisk: true,
    validate
  });
}

main();
