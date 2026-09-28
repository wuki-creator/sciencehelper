'use strict';

const fs = require('node:fs');
const path = require('node:path');
const QRCode = require('qrcode');

const output = path.join(__dirname, '..', 'public', 'poster-qr.svg');
QRCode.toString('https://www.sciencehelper.cn/#research', { type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 320 })
  .then(svg => fs.writeFileSync(output, svg, 'utf8'))
  .catch(error => { console.error(error); process.exitCode = 1; });
