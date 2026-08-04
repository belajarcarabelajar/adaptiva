import fs from 'fs';
let code = fs.readFileSync('functions/api/auth/_shared.ts', 'utf8');

const search = `function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
}`;

const replace = `function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    bin += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunkSize) as unknown as number[],
    );
  }
  return btoa(bin).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
}`;

code = code.replace(search, replace);
fs.writeFileSync('functions/api/auth/_shared.ts', code);
