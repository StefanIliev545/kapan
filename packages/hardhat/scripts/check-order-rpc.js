const https = require('https');

// Direct RPC call to check order state
const rpcUrl = 'https://arb-mainnet.g.alchemy.com/v2/' + process.env.ALCHEMY_API_KEY;

const managerAddress = '0x5c2Eb176a178B6Ae56ffB70c55D5BD68496C3e9a';
const orderHash = '0x3d8d5e8abce3911f2eef5f0b4f087fbd8abf847af4981d32323f05832b7087f6';

// getOrder(bytes32) selector = 0x5778472a
const calldata = '0x5778472a' + orderHash.slice(2);

const body = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'eth_call',
  params: [{
    to: managerAddress,
    data: calldata
  }, 'latest']
});

const url = new URL(rpcUrl);
const options = {
  hostname: url.hostname,
  path: url.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': body.length
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const result = JSON.parse(data);
    if (result.error) {
      console.log('RPC Error:', result.error);
    } else if (result.result === '0x') {
      console.log('Order not found or returned empty');
    } else {
      console.log('Order exists, response length:', result.result.length);
      // Status is at offset 32*8 (after params struct) = 256 bytes = 512 hex chars + 2 for 0x
      const statusOffset = 2 + 512 + 64; // Skip params, get to status
      console.log('Raw result start:', result.result.slice(0, 200));
    }
  });
});

req.on('error', console.error);
req.write(body);
req.end();
