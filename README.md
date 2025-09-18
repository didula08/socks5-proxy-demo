# 🧩 SOCKS5 Proxy Demo (Node.js)

[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)  
A simple demonstration of a **SOCKS5 proxy server** written in Node.js.  
This repo includes **two implementations**:

- **From scratch** → using only Node.js built-in modules (`net`, `dns`).  
- **With library** → using the [`socksv5`](https://www.npmjs.com/package/socksv5) package.  

The goal of this project is to understand the **SOCKS5 protocol**, including authentication (RFC1929), request handling, and tunneling TCP connections.

---

## 📂 Project Structure

```
.
├── Torchlab assignment without sock5 library/
│   └── socks5-server.js        # Hand-written SOCKS5 implementation
│
├── Torchlab Assignment/
│   ├── alt-socksv5.js          # Library-based SOCKS5 proxy
│   └── package.json            # Dependencies for socksv5
│
└── video notes.txt             # Notes for demo video
```

---

## 🚀 How to Run

### Prerequisites
- Node.js 18 or newer
- Terminal or PowerShell

---

### 1️⃣ Run the **no-library version** (pure Node.js)

```bash
# Linux / macOS
cd "Torchlab assignment without sock5 library"
export HOST=0.0.0.0
export PORT=1080
export AUTH_USER=intern
export AUTH_PASS=password123
node socks5-server.js
```

```powershell
# Windows PowerShell
cd "Torchlab assignment without sock5 library"
$env:HOST="0.0.0.0"
$env:PORT="1080"
$env:AUTH_USER="intern"
$env:AUTH_PASS="password123"
node socks5-server.js
```

---

### 2️⃣ Run the **library version** (`socksv5`)

#### Option A: Run directly with Node
```bash
# Linux / macOS
cd "Torchlab Assignment"
npm install
export HOST=0.0.0.0
export PORT=1080
export AUTH_USER=intern
export AUTH_PASS=password123
node alt-socksv5.js
```

```powershell
# Windows PowerShell
cd "Torchlab Assignment"
npm install
$env:HOST="0.0.0.0"
$env:PORT="1080"
$env:AUTH_USER="intern"
$env:AUTH_PASS="password123"
node alt-socksv5.js
```

#### Option B: Run with npm start (recommended)
Edit `Torchlab Assignment/package.json` and ensure it contains:

```json
"scripts": {
  "start": "node alt-socksv5.js"
}
```

Then simply run:

```bash
# Linux / macOS
export HOST=0.0.0.0
export PORT=1080
export AUTH_USER=intern
export AUTH_PASS=password123
npm start
```

```powershell
# Windows PowerShell
$env:HOST="0.0.0.0"
$env:PORT="1080"
$env:AUTH_USER="intern"
$env:AUTH_PASS="password123"
npm start
```

---

## 🧪 Testing the Proxy

Use `curl` with the **SOCKS5 proxy option**.  
The `socks5h` scheme ensures that **DNS lookups are done through the proxy**, not locally.

```bash
curl.exe -x socks5h://intern:password123@127.0.0.1:1080 https://ipinfo.io/json
```

✅ If successful, you’ll see a JSON response with your IP and geolocation (as seen by the proxy).  

⚠️ If you mistype the username/password, the server will log an **auth failure** and reject the connection.

---

## 🔒 Security Notes

- For demo simplicity, usernames and passwords are **hard-coded via environment variables**.  
- In production, never hard-code secrets. Instead:
  - Use `.env` files + `dotenv` library, or
  - Load from a **secret manager** (AWS Secrets Manager, HashiCorp Vault, etc.).  
- For stronger security, you can replace static credentials with **Google Authenticator (TOTP)** or OAuth.

---

## 📝 Reflection

**What I had to learn.**  
This project pushed me to understand how SOCKS5 works internally. I studied the **handshake process** (greeting → method selection → authentication → connect request) and implemented the reply codes as defined in the RFC. I also discovered the difference between `socks5` and `socks5h` in client tools like curl, where `socks5h` ensures that DNS resolution happens through the proxy.

**How I approached debugging.**  
My debugging method was incremental. First, I logged every step of the handshake to confirm the bytes matched expectations. When something failed, I printed out the raw hex stream to see where the mismatch was. I tested with `curl` and simple scripts to verify both valid and invalid credentials. By checking reply codes and timing how the sockets closed, I could trace the exact stage of failure.

**What I would improve with more time.**  
If given more time, I would add **structured logging** with selectable formats (`plain`, `json`), support for **UDP ASSOCIATE**, and automated tests to validate end-to-end proxying. I’d also integrate a **config file or .env loader** to eliminate environment variable repetition. Finally, I would experiment with Docker packaging so the proxy could be spun up quickly in different environments.

---

## 📌 Example Workflow

1. Start the proxy server.  
2. Run `curl` through it.  
3. Verify authentication and JSON output.  
4. Observe logs to see the request/response flow.  

---

## 📜 License

Educational use only. Do not use in production without proper hardening.
