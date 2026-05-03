# 🔲 One Million Checkboxes

> **A real-time, scalable checkbox grid application powered by WebSockets, Redis Pub/Sub, and OAuth authentication**

A high-performance distributed application capable of handling millions of checkboxes with real-time synchronization across multiple clients and server instances. Built with modern technologies for scalability, security, and exceptional user experience.

---

## ✨ Features

- 🚀 **Massive Scalability**: Support for handling up to 1 million checkboxes simultaneously
- 🔄 **Real-Time Synchronization**: WebSocket-based instant updates across all connected clients
- 📡 **Distributed Architecture**: Redis Pub/Sub for seamless multi-instance communication
- 🔐 **OAuth/OIDC Authentication**: Secure user authentication with OpenID Connect
- 🛡️ **Rate Limiting**: Built-in rate limiting to prevent abuse and ensure fair usage
- 💾 **Persistent State**: Redis-backed storage for checkbox states and session data
- 🚅 **High Performance**: Efficient bit manipulation and chunked data retrieval for optimal performance
- 🐳 **Docker Support**: Pre-configured Docker Compose for easy setup
- 🌐 **Multi-Instance Support**: Automatic synchronization across multiple server instances

---

## 🛠️ Tech Stack

### Backend
- **Node.js** - JavaScript runtime environment
- **Express.js** - Web application framework
- **WebSocket (ws)** - Real-time bidirectional communication
- **Redis** - In-memory data store with Pub/Sub messaging
- **ioredis** - Redis client for Node.js
- **JSON Web Tokens (JWT)** - Secure token authentication
- **OpenID Connect (openid-client)** - OAuth 2.0 authentication provider
- **Express Session** - Session management middleware
- **UUID** - Unique identifier generation
- **Nodemon** - Development auto-reload utility

### Infrastructure
- **Docker & Docker Compose** - Containerization and orchestration
- **Redis 7** - Message broker and data store

---

## 📋 Prerequisites

Before getting started, ensure you have the following installed:

- **Node.js** (v14 or higher)
- **npm** (v6 or higher) or **pnpm**
- **Redis** (v6 or higher) OR **Docker** with Docker Compose
- **Git** - For cloning the repository

Check your installations:
```bash
node --version
npm --version
redis-server --version  # Or: docker --version
git --version
```

---

## 🚀 Quick Start

### Option 1: Using Docker (Recommended)

1. **Ensure Docker is running**
   ```bash
   docker --version
   ```

2. **Start Redis using Docker Compose**
   ```bash
   docker-compose up -d
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Configure environment variables** (see Configuration section)
   ```bash
   cp .env.example .env
   ```

5. **Start the server**
   ```bash
   npm start
   ```

6. **Access the application**
   ```
   http://localhost:3000
   ```

---

### Option 2: Local Redis Setup

1. **Start Redis locally**
   ```bash
   redis-server
   ```

2. **In a new terminal, install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```

4. **Start the server**
   ```bash
   npm start
   ```

5. **Access the application**
   ```
   http://localhost:3000
   ```

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Redis Configuration
REDIS_URL=redis://localhost:6379

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here-change-in-production

# OAuth/OIDC Configuration
OIDC_CLIENT_ID=one-million-app
OIDC_CLIENT_SECRET=your-client-secret
OIDC_ISSUER_URL=http://localhost:3000

# Session Configuration
SESSION_SECRET=your-session-secret-here

# Rate Limiting (optional)
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

**Production Notes:**
- Always use strong, random secrets for `JWT_SECRET` and `SESSION_SECRET`
- Set `NODE_ENV=production` in production environments
- Use a managed Redis service (e.g., AWS ElastiCache, Redis Cloud)
- Restrict `REDIS_URL` to trusted networks

---

## 📖 Running the Application

### Development Mode

With automatic reload using nodemon:

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

The server will be accessible at `http://localhost:3000` (or your configured PORT).

---

## 📁 Project Structure

```
one-million-checkbox-ws/
├── src/
│   ├── server.js          # Main Express server & WebSocket setup
│   ├── redis.js           # Redis client configuration & operations
│   ├── rate-limiter.js    # Rate limiting middleware
│   └── oidc.js            # OAuth/OIDC authentication provider
├── public/
│   ├── index.html         # Frontend HTML
│   └── app.js             # Frontend JavaScript application
├── .env                   # Environment variables (create this)
├── .gitignore             # Git ignore rules
├── docker-compose.yaml    # Docker Compose configuration
├── package.json           # Project dependencies
├── pnpm-lock.yaml         # Lock file (if using pnpm)
└── readme.md              # This file
```

---

## 🔌 API Endpoints

### Authentication

#### `GET /auth/login`
Initiates OAuth login flow.

```bash
curl http://localhost:3000/auth/login
```

#### `GET /auth/callback`
OAuth callback endpoint (auto-handled by browser).

**Parameters:**
- `code` - Authorization code from OAuth provider
- `state` - CSRF protection state

#### `GET /auth/logout`
Logs out the current user and clears session.

```bash
curl http://localhost:3000/auth/logout
```

---

### Checkbox Operations

All WebSocket operations require authentication.

#### Connect to WebSocket
```javascript
const ws = new WebSocket('ws://localhost:3000');

ws.onopen = () => {
  console.log('Connected to server');
  // Authenticate with JWT token
  ws.send(JSON.stringify({
    type: 'authenticate',
    token: 'your-jwt-token'
  }));
};
```

#### Update Checkbox State
```javascript
ws.send(JSON.stringify({
  type: 'update_checkbox',
  index: 42,
  value: true
}));
```

#### Get Checkbox Chunk
```javascript
ws.send(JSON.stringify({
  type: 'get_chunk',
  startBit: 0,
  endBit: 1000
}));
```

---

## 🔐 Authentication Flow

1. User clicks "Login"
2. Browser redirected to `/auth/login`
3. User redirected to OAuth provider
4. User grants permissions
5. Browser receives authorization code
6. Server exchanges code for access token
7. JWT token generated and returned to client
8. Client stores token and uses for WebSocket authentication
9. WebSocket connection established with authenticated user

---

## 📊 Performance Considerations

### Optimization Techniques
- **Bit Manipulation**: Uses Redis SETBIT/GETBIT for efficient storage
- **Chunked Retrieval**: Retrieves checkbox states in efficient byte chunks
- **Pub/Sub Broadcasting**: Distributes updates across all server instances in real-time
- **Session Caching**: Express-session with Redis backend for fast session lookups
- **Rate Limiting**: Prevents abuse and ensures fair resource distribution

### Scalability
- Horizontal scaling with multiple server instances
- Redis Pub/Sub for cross-instance synchronization
- Efficient memory usage with bit-level storage
- Connection pooling via ioredis

---

## 🐳 Docker Deployment

### Using Docker Compose

Start all services:
```bash
docker-compose up -d
```

Stop all services:
```bash
docker-compose down
```

View logs:
```bash
docker-compose logs -f
```

### Custom Docker Image

Build:
```bash
docker build -t one-million-checkboxes .
```

Run:
```bash
docker run -p 3000:3000 -e REDIS_URL=redis://host.docker.internal:6379 one-million-checkboxes
```

---

## 🐛 Troubleshooting

### Issue: "Connection refused" error
- Ensure Redis is running: `redis-cli ping`
- Check REDIS_URL in .env matches your Redis server
- If using Docker: `docker-compose ps`

### Issue: WebSocket connection fails
- Check browser console for errors
- Ensure JWT token is valid
- Verify WebSocket endpoint is correct

### Issue: Rate limit exceeded
- Adjust `RATE_LIMIT_MAX_REQUESTS` in .env
- Wait for rate limit window to reset (default: 60 seconds)
- Implement exponential backoff in client

### Issue: Memory usage growing
- Monitor Redis memory: `redis-cli INFO memory`
- Check for memory leaks in WebSocket handlers
- Consider implementing data expiration policies

---

## 🚢 Deployment

### Deploying to Production

1. **Use managed Redis service** (AWS ElastiCache, Redis Cloud, etc.)
2. **Set production environment variables**:
   ```bash
   NODE_ENV=production
   JWT_SECRET=<strong-random-secret>
   REDIS_URL=<production-redis-url>
   ```

3. **Deploy to hosting platform** (Heroku, AWS, DigitalOcean, Render, etc.)

4. **Enable HTTPS** for WebSocket connections (WSS)

5. **Setup monitoring and logging**

---

## 📝 Usage Example

### Frontend JavaScript
```javascript
// Connect to server
const ws = new WebSocket('ws://localhost:3000');

// Handle authentication
ws.onopen = () => {
  const token = localStorage.getItem('authToken');
  ws.send(JSON.stringify({
    type: 'authenticate',
    token
  }));
};

// Toggle checkbox
document.querySelectorAll('.checkbox').forEach((cb, idx) => {
  cb.addEventListener('change', (e) => {
    ws.send(JSON.stringify({
      type: 'update_checkbox',
      index: idx,
      value: e.target.checked
    }));
  });
});

// Receive updates
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'checkbox_updated') {
    updateCheckboxUI(data.index, data.value);
  }
};
```

---

## 📄 License

MIT License - feel free to use this project for commercial or personal purposes.

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📧 Support

For issues, questions, or suggestions, please open an issue on GitHub or contact the project maintainer.

---

## 🎯 Roadmap

- [ ] WebRTC for peer-to-peer synchronization
- [ ] Real-time collaboration features
- [ ] Advanced filtering and searching
- [ ] Data export functionality
- [ ] Admin dashboard and analytics
- [ ] Mobile application

---

---

## 🔗 Clone Instructions

### Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/one-million-checkbox-ws.git
cd one-million-checkbox-ws
```

### Step 2: Clone with SSH (If you have SSH key configured)

```bash
git clone https://github.com/abhishek-2k23/one-million-checkbox
cd one-million-checkbox
```

### Step 3: Update Submodules (if any)

```bash
git submodule update --init --recursive
```

### Step 4: Verify Clone

```bash
git log --oneline -5
```

### Step 5: Create Feature Branch (For Development)

```bash
git checkout -b feature/your-feature-name
```

### Quick Clone & Setup Command

Copy-paste this single command to clone and install in one go:

```bash
git clone https://github.com/yourusername/one-million-checkbox-ws.git && cd one-million-checkbox-ws && npm install
```

---

**Last Updated**: May 2026  
**Author**: Abhishek (Cohort 26)
