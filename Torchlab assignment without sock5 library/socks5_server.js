const net = require("net");
const dns = require("dns");

// Config 
const LISTEN_HOST = process.env.HOST || "0.0.0.0";
const LISTEN_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 1080;
const AUTH_USER   = process.env.AUTH_USER || "intern";
const AUTH_PASS   = process.env.AUTH_PASS || "password123";
const LOG_LEVEL   = (process.env.LOG_LEVEL || "info").toLowerCase(); 
const LOG_FORMAT  = (process.env.LOG_FORMAT || "plain").toLowerCase(); 

// Logging 
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
function log(level, msg, ctx={}) {
  if (LEVELS[level] < (LOG_LEVEL === "debug" ? 0 : 1)) return;

  const time = new Date().toISOString();
  if (LOG_FORMAT === "json") {
    console.log(JSON.stringify({ t: time, level, msg, ...ctx }));
  } else {
    const extras = Object.entries(ctx).map(([k,v]) => `${k}=${JSON.stringify(v)}`).join(" ");
    console.log(`${time} [${level.toUpperCase()}] ${msg}${extras ? " " + extras : ""}`);
  }
}
function hexDump(buf, max=64) {
  const slice = buf.slice(0, max);
  return slice.toString("hex").match(/.{1,2}/g)?.join(" ") || "";
}
function u16BE(n) { const b = Buffer.alloc(2); b.writeUInt16BE(n, 0); return b; }

// SOCKS5 reply reasons
const REP_TXT = {
  0x00: "succeeded",
  0x01: "general failure",
  0x02: "connection not allowed",
  0x03: "network unreachable",
  0x04: "host unreachable (DNS or route)",
  0x05: "connection refused",
  0x06: "TTL expired",
  0x07: "command not supported",
  0x08: "address type not supported"
};

// Always reply with IPv4 ANY (simplest, robust for this assignment)
function sendReply(sock, rep, bindPort = 0) {
  const reply = Buffer.concat([
    Buffer.from([0x05, rep, 0x00, 0x01]),       
    Buffer.from([0,0,0,0]),             
    u16BE(bindPort)         
  ]);
  sock.write(reply);
}

// Auth
function authOk(user, pass) {
  return user === AUTH_USER && pass === AUTH_PASS;
}

// Server 
let NEXT_ID = 1;

const server = net.createServer((client) => {
  const connId = NEXT_ID++;
  const src = `${client.remoteAddress}:${client.remotePort}`;
  const startNs = process.hrtime.bigint();
  let stage = "greeting";
  let dstHost = "-", dstPort = -1;
  let bytesUp = 0, bytesDown = 0;  

  log("info", "client connected", { connId, src });

  const closeWith = (reason, repCode=null) => {
    try { if (repCode !== null) sendReply(client, repCode, 0); } catch {}
    try { client.destroy(); } catch {}
    const durMs = Number((process.hrtime.bigint() - startNs) / 1000000n);
    log(repCode === null ? "info" : (repCode === 0x00 ? "info" : "warn"),
        "client closed", { connId, src, dst: `${dstHost}:${dstPort}`, stage, reason, bytesUp, bytesDown, durMs });
  };

  client.on("error", (e) => log("debug", "client error", { connId, err: e.message }));
  client.setTimeout(120000, () => closeWith("client-timeout"));

  // Stage 1: Greeting
  client.once("data", (hello) => {
    if (LOG_LEVEL === "debug") log("debug", "greeting-bytes", { connId, hex: hexDump(hello) });

    if (hello.length < 3 || hello[0] !== 0x05) {
      log("warn", "bad-greeting", { connId, src });
      return closeWith("bad-greeting");
    }
    const nMethods = hello[1];
    const methods = hello.slice(2, 2 + nMethods);
    const methodChosen = methods.includes(0x02) ? 0x02 : 0xFF;  // require RFC1929
    client.write(Buffer.from([0x05, methodChosen]));
    if (methodChosen === 0xFF) {
      log("warn", "no-acceptable-auth-method", { connId, src, offered: Array.from(methods) });
      return closeWith("no-auth-method");
    }

    stage = "auth";

    // Stage 2: RFC1929 auth 
    client.once("data", (authBuf) => {
      if (LOG_LEVEL === "debug") log("debug", "auth-bytes", { connId, hex: hexDump(authBuf) });

      if (authBuf[0] !== 0x01) {
        client.end(Buffer.from([0x01, 0x01]));
        log("warn", "bad-auth-version", { connId, src });
        return closeWith("bad-auth-version");
      }
      const ulen = authBuf[1];
      const uname = authBuf.slice(2, 2 + ulen).toString();
      const plen = authBuf[2 + ulen];
      const pass  = authBuf.slice(3 + ulen, 3 + ulen + plen).toString();

      const ok = authOk(uname, pass);
      client.write(Buffer.from([0x01, ok ? 0x00 : 0x01]));
      if (!ok) {
        log("warn", "auth-failed", { connId, src, user: uname });
        return closeWith("auth-failed");
      }

      stage = "request";

      // Stage 3: CONNECT request 
      client.once("data", (req) => {
        if (LOG_LEVEL === "debug") log("debug", "request-bytes", { connId, hex: hexDump(req) });

        if (req[0] !== 0x05 || req.length < 7) {
          log("warn", "bad-request", { connId, src });
          return closeWith("bad-request");
        }
        const cmd = req[1];
        const atyp = req[3];
        let offset = 4;

        if (atyp === 0x01) { 
          dstHost = Array.from(req.slice(offset, offset + 4)).join(".");
          offset += 4;
        } else if (atyp === 0x03) { // DOMAIN
          const len = req[offset]; offset += 1;
          dstHost = req.slice(offset, offset + len).toString(); offset += len;
        } else if (atyp === 0x04) { // IPv6 (we won't pretty print; Node can still connect via string)
          const buf = req.slice(offset, offset + 16); offset += 16;
          // Convert to standard IPv6 text (compact not required)
          const parts = [];
          for (let i = 0; i < 16; i += 2) parts.push(buf.readUInt16BE(i).toString(16));
          dstHost = parts.join(":");
        } else {
          log("warn", "addr-type-not-supported", { connId, atyp });
          return closeWith("addr-type-not-supported", 0x08);
        }

        dstPort = req.readUInt16BE(offset);
        if (cmd !== 0x01) { // only CONNECT
          log("warn", "cmd-not-supported", { connId, cmd });
          return closeWith("cmd-not-supported", 0x07);
        }

        // resolve if domain
        const doConnect = () => {
          const upstream = net.connect({ host: dstHost, port: dstPort }, () => {
            sendReply(client, 0x00, upstream.localPort || 0);
            log("info", "tunnel-open", { connId, src, dst: `${dstHost}:${dstPort}` });

            // accounting
            client.on("data", (chunk) => { bytesUp += chunk.length; });
            upstream.on("data", (chunk) => { bytesDown += chunk.length; });

            // bi-directional piping
            client.pipe(upstream);
            upstream.pipe(client);
          });

          upstream.setTimeout(120000, () => {
            log("warn", "upstream-timeout", { connId, dst: `${dstHost}:${dstPort}` });
            closeWith("upstream-timeout", 0x01);
          });

          upstream.on("error", (e) => {
            log("warn", "upstream-error", { connId, dst: `${dstHost}:${dstPort}`, err: e.message });
            closeWith("upstream-error", 0x01);
          });

          upstream.on("close", () => {
            // when remote ends, we close client; closeWith logs summary
            try { client.end(); } catch {}
          });
        };

        if (atyp === 0x03) {
          dns.lookup(dstHost, { family: 0 }, (err) => {
            if (err) {
              log("warn", "dns-fail", { connId, host: dstHost, err: err.message });
              return closeWith("dns-fail", 0x04);
            }
            doConnect();
          });
        } else {
          doConnect();
        }
      });
    });
  });

  client.on("end",   () => closeWith("client-end", null));
  client.on("close", () => closeWith("client-close", null));
});

server.on("listening", () => {
  log("info", "listening", { addr: `${LISTEN_HOST}:${LISTEN_PORT}`, user: AUTH_USER, logLevel: LOG_LEVEL, format: LOG_FORMAT });
});
server.on("error", (e) => log("error", "server-error", { err: e.message }));

server.listen(LISTEN_PORT, LISTEN_HOST);