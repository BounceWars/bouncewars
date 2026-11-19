// BounceWars: static site + WebSocket relay in one dependency-free Node server.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 8080;
const PAGE = path.join(__dirname, 'public', 'index.html');

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200); return res.end('ok'); }
  fs.readFile(PAGE, (e, d) => {
    if (e) { res.writeHead(500); return res.end('error'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(d);
  });
});

const rooms = new Map();
let next = 1;

function frame(str) {
  const p = Buffer.from(str), l = p.length;
  let h;
  if (l < 126) h = Buffer.from([0x81, l]);
  else if (l < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(l, 2); }
  else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(l), 2); }
  return Buffer.concat([h, p]);
}
function send(c, o) { if (!c.dead) { try { c.sock.write(frame(JSON.stringify(o))); } catch (e) {} } }
function count(set) { set.forEach((c) => send(c, { n: set.size })); }

server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { sock.destroy(); return; }
  const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  const c = { sock, id: 'c' + next++, room: null, dead: false };
  let buf = Buffer.alloc(0);

  function close() {
    if (c.dead) return;
    c.dead = true;
    const set = rooms.get(c.room);
    if (set) { set.delete(c); if (!set.size) rooms.delete(c.room); else count(set); }
    sock.destroy();
  }
  function handle(str) {
    let m; try { m = JSON.parse(str); } catch (e) { return; }
    if (typeof m.j === 'string' && /^[A-Za-z0-9]{4}$/.test(m.j) && !c.room) {
      const code = m.j.toUpperCase(), set = rooms.get(code) || new Set();
      if (set.size >= 2) return close();
      set.add(c); rooms.set(code, set); c.room = code; count(set);
    } else if (m.d !== undefined && c.room) {
      rooms.get(c.room).forEach((o) => send(o, { d: m.d, f: c.id }));
    }
  }

  send(c, { id: c.id });
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    if (buf.length > 16384) return close();
    for (;;) {
      if (buf.length < 2) break;
      const op = buf[0] & 15, masked = buf[1] & 128;
      let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (!masked || len > 4096) return close();
      if (buf.length < off + 4 + len) break;
      const mask = buf.subarray(off, off + 4), data = Buffer.from(buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
      buf = buf.subarray(off + 4 + len);
      if (op === 8) return close();
      if (op === 9 && data.length <= 125) { sock.write(Buffer.concat([Buffer.from([0x8a, data.length]), data])); continue; }
      if (op === 1) handle(data.toString());
    }
  });
  sock.on('close', close);
  sock.on('error', close);
});

// keep connections alive behind proxies
setInterval(() => rooms.forEach((set) => set.forEach((c) => { if (!c.dead) { try { c.sock.write(Buffer.from([0x89, 0])); } catch (e) {} } })), 25000);

server.listen(PORT, () => console.log('BounceWars on port ' + PORT));
