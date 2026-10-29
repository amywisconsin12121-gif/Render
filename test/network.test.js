import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import https from 'node:https';
import { isPublicAddress, validatePublicUrl, makeSafeLookup, downloadBuffer } from '../src/network.js';

test('only public unicast IPs are accepted, including IPv4-mapped IPv6 checks', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) assert.equal(isPublicAddress(ip), true, ip);
  for (const ip of ['127.0.0.1', '0.0.0.0', '10.1.2.3', '192.168.1.2', '172.16.1.1', '169.254.169.254', '100.64.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '64:ff9b::7f00:1']) assert.equal(isPublicAddress(ip), false, ip);
});

test('URL gate rejects local, encoded-local, credentials, and unsupported schemes/ports', () => {
  for (const url of ['http://localhost/', 'http://127.0.0.1/', 'http://2130706433/', 'http://0x7f000001/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://service.internal/', 'file:///etc/passwd', 'data:image/png;base64,aaa', 'https://user:password@example.com/', 'https://example.com:8080/a.png']) assert.throws(() => validatePublicUrl(url), undefined, url);
  assert.equal(validatePublicUrl('https://example.com/a.jpg#ignored').href, 'https://example.com/a.jpg');
});

function lookupPromise(lookup, all = false) {
  return new Promise((resolve, reject) => lookup('images.example.com', { all }, (error, address, family) => error ? reject(error) : resolve(all ? address : { address, family })));
}

test('connection resolver blocks private and mixed DNS answers', async () => {
  for (const records of [[{ address: '127.0.0.1', family: 4 }], [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }]]) {
    await assert.rejects(lookupPromise(makeSafeLookup(async () => records)), /private or reserved/);
  }
  const records = [{ address: '8.8.8.8', family: 4 }];
  assert.deepEqual(await lookupPromise(makeSafeLookup(async () => records), true), records);
});

test('redirect targets are rechecked before a second request', async t => {
  let requests = 0;
  t.mock.method(https, 'get', (url, options, callback) => {
    requests++;
    assert.equal(typeof options.lookup, 'function');
    const request = new EventEmitter();
    queueMicrotask(() => callback({ statusCode: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' }, destroy() {} }));
    return request;
  });
  await assert.rejects(downloadBuffer('https://example.com/image'), /Private and reserved/);
  assert.equal(requests, 1);
});

test('streamed downloads stop at the byte limit even without Content-Length', async t => {
  t.mock.method(https, 'get', (url, options, callback) => {
    const request = new EventEmitter();
    queueMicrotask(() => {
      const response = new EventEmitter();
      response.statusCode = 200;
      response.headers = {};
      response.destroy = error => { if (error) response.emit('error', error); };
      callback(response);
      response.emit('data', Buffer.alloc(20));
    });
    return request;
  });
  await assert.rejects(downloadBuffer('https://example.com/image', { maxBytes: 10 }), /too large/);
});

test('JSON POST downloads send the request body and headers through the safe transport', async t => {
  let sent = '';
  t.mock.method(https, 'request', (url, options, callback) => {
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/json');
    const request = new EventEmitter();
    request.write = chunk => { sent += chunk.toString(); };
    request.end = () => queueMicrotask(() => {
      const response = new EventEmitter();
      response.statusCode = 200;
      response.headers = { 'content-type': 'application/json', 'content-length': '13' };
      response.destroy = () => {};
      callback(response);
      response.emit('data', Buffer.from('{"images":[]}'));
      response.emit('end');
    });
    return request;
  });
  const result = await downloadBuffer('https://example.com/api', {
    method: 'POST', body: '{"q":"cat"}', headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(sent, '{"q":"cat"}');
  assert.equal(result.contentType, 'application/json');
  assert.equal(result.buffer.toString(), '{"images":[]}');
});
