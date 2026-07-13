const fs = require('node:fs');
const path = require('node:path');

const srcDir = path.resolve(__dirname, '../src/generated/prisma');
const destDir = path.resolve(__dirname, '../dist/generated/prisma');

if (!fs.existsSync(srcDir)) {
  console.warn(`Prisma client source not found at ${srcDir}`);
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
fs.cpSync(srcDir, destDir, { recursive: true });
console.log(`Copied Prisma client runtime to ${path.relative(process.cwd(), destDir)}`);
