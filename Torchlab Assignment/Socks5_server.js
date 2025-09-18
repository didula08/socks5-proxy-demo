require('dotenv').config();
const socks = require('@heroku/socksv5');

const HOST = process.env.HOST;
const PORT = parseInt(process.env.PORT ,10);
const AUTH_USER = process.env.AUTH_USER ;
const AUTH_PASS = process.env.AUTH_PASS ;

const srv = socks.createServer((info, accept, deny) => {
  console.log(`[CONN] ${info.srcAddr}:${info.srcPort} -> ${info.dstAddr}:${info.dstPort}`);
  const socket = accept(); 
  if (!socket) deny();
});

srv.useAuth(
  socks.auth.UserPassword((user, pass, cb) => {
    const ok = (user === AUTH_USER && pass === AUTH_PASS);
    if (!ok) console.log(`[AUTH FAIL] user="${user}"`);
    cb(ok);
  })
);

srv.listen(PORT, HOST, () => {
  console.log(`SOCKS5 listening on ${HOST}:${PORT}`);
  console.log(`auth user="${AUTH_USER}" pass="${AUTH_PASS}"`);
});

srv.on('error', (e) => console.error('[server error]', e));
