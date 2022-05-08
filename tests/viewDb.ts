import { getDatabase } from '../src/db';

async function printDb(name: string) {
  console.log(`===================== ${name} =====================`);
  const db = getDatabase(name);
  const iterator = db.iterate();
  for await (const { key, value } of iterator) {
    console.log(key, value);
  }
  console.log();
}

async function main() {
  // await printDb('blocks-client');
  await printDb('blocks-server1');
  // await printDb('entries-client');
  await printDb('entries-server1');
  // await printDb('validated-client');
  await printDb('validated-server1');
  // await printDb('validated-client');
  await printDb('confirmed-server1');
}

main();
