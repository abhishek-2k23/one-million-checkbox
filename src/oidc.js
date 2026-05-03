const express = require('express');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const { redis } = require('./redis');

const router = express.Router();

const CLIENT_ID = 'one-million-app';
const CLIENT_SECRET = 'app_secret';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_123';

// ------------------ DISCOVERY ------------------
router.get('/.well-known/openid-configuration', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}/oidc`;
  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    userinfo_endpoint: `${baseUrl}/me`,
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["HS256"],
  });
});

// ------------------ LOGIN UI (IDP SIDE) ------------------
router.get('/login', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Secure Login</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { 
            font-family: 'Inter', sans-serif;
            display: flex; justify-content: center; align-items: center; 
            height: 100vh; background-color: #121212; color: #e0e0e0; 
          }
          .card { 
            background: #1e1e1e; padding: 2.5rem 2rem; border-radius: 0; 
            text-align: center; border: 1px solid #333; 
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3); width: 100%; max-width: 380px;
          }
          h2 { font-weight: 700; margin-bottom: 1.5rem; font-size: 1.5rem; }
          input { 
            padding: 0.75rem; border-radius: 0; border: 1px solid #333; 
            background-color: #121212; color: #e0e0e0;
            margin-bottom: 1rem; width: 100%; font-size: 1rem;
          }
          input:focus { outline: none; border-color: #bb86fc; }
          button { 
            background-color: #bb86fc; color: #000; padding: 0.75rem; 
            border: none; border-radius: 0; cursor: pointer; width: 100%; 
            font-weight: 600; font-size: 1rem; transition: background-color 0.2s;
          }
          button:hover { background-color: #9965db; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Secure Login</h2>
          <form method="POST" action="/oidc/login">
            <input type="text" name="username" placeholder="Enter username" required autofocus autocomplete="off" />
            <button type="submit">Continue</button>
          </form>
        </div>
      </body>
    </html>
  `);
});

router.post('/login', express.urlencoded({ extended: true }), (req, res) => {
  const { username } = req.body;
  if (username) {
    req.session.oidc_user = { id: username, name: username };
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
  } else {
    res.redirect('/oidc/login');
  }
});

// ------------------ AUTHORIZE ------------------
router.get('/authorize', async (req, res) => {
  const { client_id, redirect_uri, state } = req.query;

  if (client_id !== CLIENT_ID || !redirect_uri.endsWith('/auth/callback')) {
    return res.status(400).send('Invalid client_id or redirect_uri');
  }

  // Verify IDP session
  if (!req.session.oidc_user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/oidc/login');
  }

  const code = uuidv4();
  const userId = req.session.oidc_user.id;
  
  // Store code in Redis mapped to the user, expire in 5 mins
  await redis.set(`oidc_code:${code}`, JSON.stringify({ userId }), 'EX', 300);

  return res.redirect(`${redirect_uri}?code=${code}&state=${state || ''}`);
});

// ------------------ TOKEN ------------------
router.post('/token', express.urlencoded({ extended: true }), async (req, res) => {
  const { code, client_id, client_secret, redirect_uri, grant_type } = req.body;

  if (client_id !== CLIENT_ID || client_secret !== CLIENT_SECRET || !redirect_uri.endsWith('/auth/callback')) {
    return res.status(401).json({ error: 'invalid_client' });
  }

  if (grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }

  const codeDataRaw = await redis.get(`oidc_code:${code}`);
  if (!codeDataRaw) {
    return res.status(400).json({ error: 'invalid_grant' });
  }

  await redis.del(`oidc_code:${code}`); // Single-use code

  const { userId } = JSON.parse(codeDataRaw);

  const payload = { sub: userId, name: `${userId}` };

  const access_token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
  const id_token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

  res.json({
    access_token,
    token_type: 'Bearer',
    expires_in: 3600,
    id_token
  });
});

// ------------------ USER INFO ------------------
router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    res.json({
      sub: payload.sub,
      name: payload.name
    });
  } catch (err) {
    res.status(401).json({ error: 'invalid_token' });
  }
});

module.exports = router;
