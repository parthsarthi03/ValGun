import fs from 'fs';
import level from 'level-ts';
import path from 'path';

export const getDatabase = (dbId: string) => {
  if (!fs.existsSync('databases')) {
    fs.mkdirSync('databases');
  }
  const secondaryPath = path.join('databases', dbId);
  if (!fs.existsSync(secondaryPath)) {
    fs.mkdirSync(secondaryPath);
  }
  return new level(secondaryPath);
};
