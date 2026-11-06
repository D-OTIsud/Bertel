const assert = require('node:assert/strict');
const sharp = require('sharp');

async function main() {
  assert.equal(process.getuid(), 1000, 'the final image must run as the node user');
  assert.equal(process.versions.node.split('.')[0], '22');
  assert.equal(sharp.versions.sharp, '0.35.5');
  for (const format of ['jpeg', 'png', 'webp']) {
    const encoded = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#235678' } })
      .toFormat(format).toBuffer();
    const decoded = await sharp(encoded).jpeg().toBuffer({ resolveWithObject: true });
    assert.equal(decoded.info.width, 8);
    assert.equal(decoded.info.height, 6);
    assert.equal(decoded.info.format, 'jpeg');
  }
  console.log(JSON.stringify({ node: process.versions.node, codecs: sharp.versions, formats: ['jpeg', 'png', 'webp'] }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
