require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const { initRedis, pub, sub, getBitsChunk, setBit, getBit } = require('./redis');
const { checkRateLimit } = require('./rate-limiter');
const oidc = require('./oidc');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_123';
const TOTAL_CHECKBOXES = 10000; // 10k Checkboxes

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: 'session_secret',
  resave: false,
  saveUninitialized: true,
}));

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

async function start() {
  await initRedis();

  const server = http.createServer(app);
  const wss = new WebSocket.Server({ noServer: true });

  const CHANNEL = 'checkbox_updates';
  const sockets = new Map();

  // Handle Pub/Sub updates from other instances
  await sub.subscribe(CHANNEL, (message) => {
    const update = JSON.parse(message);
    // Broadcast to local clients
    for (const ws of sockets.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(update));
      }
    }
  });

  // OIDC Provider Routes
  app.use('/oidc', oidc);

  // ------------------ OAUTH LOGIN FLOW ------------------
  app.get('/auth/login', (req, res) => {
    // Generate state and store in session
    const state = require('crypto').randomBytes(16).toString('hex');
    req.session.oauth_state = state;
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const baseUrl = `${protocol}://${req.get('host')}`;
    
    const url = `${baseUrl}/oidc/authorize` +
      `?client_id=one-million-app` +
      `&redirect_uri=${baseUrl}/auth/callback` +
      `&response_type=code` +
      `&scope=openid profile` +
      `&state=${state}`;
      
    res.redirect(url);
  });

  app.get('/auth/callback', async (req, res) => {
    const { code, state, error } = req.query;
    
    if (error) {
      return res.status(400).send(`Auth Error: ${error}`);
    }

    // Verify state
    if (!state || state !== req.session.oauth_state) {
      return res.status(400).send('Invalid state');
    }
    delete req.session.oauth_state;

    try {
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const baseUrl = `${protocol}://${req.get('host')}`;

      // Exchange code for token
      const tokenRes = await fetch(`http://localhost:${PORT}/oidc/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: 'one-million-app',
          client_secret: 'app_secret',
          grant_type: 'authorization_code',
          redirect_uri: `${baseUrl}/auth/callback`,
          code
        })
      });
      const tokenData = await tokenRes.json();
      
      if (!tokenData.access_token) {
        return res.status(400).send('Failed to obtain token');
      }

      // Fetch user info
      const userInfoRes = await fetch(`http://localhost:${PORT}/oidc/me`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      const userInfo = await userInfoRes.json();

      req.session.user = userInfo;
      
      // Issue our own lightweight JWT for WebSocket auth and frontend usage
      const token = jwt.sign(userInfo, JWT_SECRET, { expiresIn: '24h' });
      res.cookie('token', token, { maxAge: 24 * 60 * 60 * 1000, httpOnly: false });
      
      res.redirect('/');
    } catch (err) {
      console.error(err);
      res.status(500).send('OAuth failed');
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.json({ message: "Logged out" });
    });
  });

  // API: Get metadata
  app.get('/api/meta', (req, res) => {
    res.json({ total: TOTAL_CHECKBOXES });
  });

  // API: Get a chunk of bits (Efficient)
  app.get('/api/bits', async (req, res) => {
    const start = parseInt(req.query.start || 0);
    const end = parseInt(req.query.end || 1000);
    
    if (isNaN(start) || isNaN(end) || start < 0 || end > TOTAL_CHECKBOXES) {
      return res.status(400).json({ error: 'Invalid range' });
    }

    try {
      const buffer = await getBitsChunk(start, end);
      // Send as base64 to save bandwidth/complexity in JSON
      res.json({
        start,
        end,
        data: buffer.toString('base64')
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch bits' });
    }
  });

  // Upgrade HTTP to WebSocket
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', async (ws, req) => {
    const params = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const token = params.get('token');
    let user = null;

    if (token) {
      try {
        user = jwt.verify(token, JWT_SECRET);
      } catch (e) {
        // invalid token, treat as anonymous
      }
    }

    const socketId = uuidv4();
    ws.socketId = socketId;
    ws.user = user;
    sockets.set(socketId, ws);

    // Send initial greeting
    ws.send(JSON.stringify({
      type: 'init',
      socketId,
      user: user ? { sub: user.sub, name: user.name } : null
    }));

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'toggle') {
          const { index } = msg;
          if (typeof index !== 'number' || index < 0 || index >= TOTAL_CHECKBOXES) return;

          // Rate limit
          const rlKey = user ? `user:${user.sub}` : `socket:${socketId}`;
          const allowed = await checkRateLimit(rlKey, 30, 5); // 30 toggles per 5 seconds
          
          if (!allowed) {
            return ws.send(JSON.stringify({ type: 'error', code: 'RATE_LIMIT', message: 'Too fast! Slow down.' }));
          }

          // Toggle in Redis
          const current = await getBit(index);
          const newValue = current === 1 ? 0 : 1;
          await setBit(index, newValue);

          const update = { type: 'update', index, value: newValue, actor: user ? user.sub : 'anonymous' };
          
          // Publish to Redis for other instances
          await pub.publish(CHANNEL, JSON.stringify(update));
          
          // Broadcast locally immediately
          for (const client of sockets.values()) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(update));
            }
          }
        }
      } catch (err) {
        console.error('WS Error:', err);
      }
    });

    ws.on('close', () => {
      sockets.delete(socketId);
    });
  });

  server.listen(PORT, () => {
    console.log(`\n🚀 Server running at http://localhost:${PORT}`);
    console.log(`   - WebSocket: ws://localhost:${PORT}/ws`);
    console.log(`   - OIDC Provider: http://localhost:${PORT}/oidc\n`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
