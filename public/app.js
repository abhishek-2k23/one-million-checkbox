(function() {
    const scrollContainer = document.getElementById('scroll-container');
    const gridContainer = document.getElementById('grid-container');
    const viewportRange = document.getElementById('viewport-range');
    const connStatus = document.getElementById('conn-status');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginForm = document.getElementById('login-form');
    const userInfo = document.getElementById('user-info');
    const displayName = document.getElementById('display-name');
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');

    const CELL_SIZE = 28; // 24px + 4px gap
    let COLS = 10;
    const TOTAL = 1000000;
    const CHUNK_SIZE = 1000;

    let socket = null;
    
    function getToken() {
        const match = document.cookie.match(/(?:^| )token=([^;]+)/);
        return match ? match[1] : null;
    }
    
    let token = getToken();
    let user = null;
    let bitCache = new Uint8Array(Math.ceil(TOTAL / 8));
    let renderedCells = new Map();
    let fetchedChunks = new Set();

    // --- Auth Logic ---

    function login() {
        window.location.href = '/auth/login';
    }

    async function logout() {
        document.cookie = 'token=; Max-Age=-99999999; path=/';
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.reload();
    }

    function updateAuthUI() {
        if (token) {
            loginForm.style.display = 'none';
            userInfo.style.display = 'flex';
            displayName.textContent = user ? user.name : 'User';
        } else {
            loginForm.style.display = 'flex';
            userInfo.style.display = 'none';
        }
    }

    // --- WebSocket Logic ---

    function connectWS() {
        if (socket) socket.close();

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${window.location.host}/ws${token ? '?token=' + token : ''}`;
        
        socket = new WebSocket(url);

        socket.onopen = () => {
            connStatus.textContent = 'Connected';
            connStatus.style.color = 'var(--success-color)';
        };

        socket.onclose = () => {
            connStatus.textContent = 'Disconnected';
            connStatus.style.color = 'var(--danger-color)';
            setTimeout(connectWS, 3000); // Reconnect
        };

        socket.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'init') {
                user = msg.user;
                updateAuthUI();
            } else if (msg.type === 'update') {
                handleRemoteUpdate(msg.index, msg.value);
            } else if (msg.type === 'error') {
                showToast(msg.message, true);
            }
        };
    }

    function handleRemoteUpdate(index, value) {
        const byteIndex = Math.floor(index / 8);
        const bitOffset = index % 8;
        if (value) {
            bitCache[byteIndex] |= (1 << (7 - bitOffset));
        } else {
            bitCache[byteIndex] &= ~(1 << (7 - bitOffset));
        }

        const cell = renderedCells.get(index);
        if (cell) {
            const cb = cell.querySelector('.checkbox');
            if (value) cb.classList.add('checked');
            else cb.classList.remove('checked');
            
            cell.classList.add('updated-remote');
            setTimeout(() => cell.classList.remove('updated-remote'), 3000);
        }
    }

    // --- Grid Logic ---

    async function fetchChunk(chunkIndex) {
        if (fetchedChunks.has(chunkIndex)) return true;
        fetchedChunks.add(chunkIndex);

        const start = chunkIndex * CHUNK_SIZE;
        let end = start + CHUNK_SIZE;
        if (end > TOTAL) end = TOTAL;

        try {
            const resp = await fetch(`/api/bits?start=${start}&end=${end}`);
            if (!resp.ok) {
                fetchedChunks.delete(chunkIndex);
                return false;
            }
            const data = await resp.json();
            const binaryString = atob(data.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const cacheStartByte = Math.floor(start / 8);
            bitCache.set(bytes, cacheStartByte);

            for (const [index, el] of renderedCells.entries()) {
                if (index >= start && index < end) {
                    const val = getBitFromCache(index);
                    const cb = el.querySelector('.checkbox');
                    if (val) cb.classList.add('checked');
                    else cb.classList.remove('checked');
                }
            }
            return true;
        } catch (e) {
            fetchedChunks.delete(chunkIndex);
            return false;
        }
    }

    function getBitFromCache(index) {
        const byteIndex = Math.floor(index / 8);
        const bitOffset = index % 8;
        return (bitCache[byteIndex] >> (7 - bitOffset)) & 1;
    }

    function renderVisible() {
        const scrollTop = scrollContainer.scrollTop;
        const scrollLeft = scrollContainer.scrollLeft;
        const width = scrollContainer.clientWidth;
        const height = scrollContainer.clientHeight;

        const startRow = Math.floor(scrollTop / CELL_SIZE);
        const endRow = Math.ceil((scrollTop + height) / CELL_SIZE);
        const startCol = Math.floor(scrollLeft / CELL_SIZE);
        const endCol = Math.ceil((scrollLeft + width) / CELL_SIZE);

        viewportRange.textContent = `${startRow * COLS + startCol} - ${endRow * COLS + endCol}`;

        const currentVisible = new Set();
        const neededChunks = new Set();

        for (let r = startRow; r <= endRow; r++) {
            if (r >= Math.ceil(TOTAL / COLS)) break;
            for (let c = startCol; c <= endCol; c++) {
                if (c >= COLS) break;
                const index = r * COLS + c;
                if (index >= TOTAL) break;
                currentVisible.add(index);
                neededChunks.add(Math.floor(index / CHUNK_SIZE));

                if (!renderedCells.has(index)) {
                    createCell(index, r, c);
                }
            }
        }

        neededChunks.forEach(chunkIndex => fetchChunk(chunkIndex));

        for (const [index, el] of renderedCells.entries()) {
            if (!currentVisible.has(index)) {
                el.remove();
                renderedCells.delete(index);
            }
        }
    }

    function createCell(index, r, c) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.style.left = `${c * CELL_SIZE}px`;
        cell.style.top = `${r * CELL_SIZE}px`;

        const isChecked = getBitFromCache(index);
        
        const cb = document.createElement('div');
        cb.className = 'checkbox' + (isChecked ? ' checked' : '');
        
        cb.onclick = () => {
            if (!socket || socket.readyState !== WebSocket.OPEN) {
                return showToast('Connection lost', true);
            }
            if (!token) {
                return showToast('Please login to toggle checkboxes!', true);
            }
            
            const wasChecked = cb.classList.contains('checked');
            if (wasChecked) cb.classList.remove('checked');
            else cb.classList.add('checked');

            socket.send(JSON.stringify({ type: 'toggle', index }));
        };

        cell.appendChild(cb);
        gridContainer.appendChild(cell);
        renderedCells.set(index, cell);
    }

    function showToast(message, isError = false) {
        toastMessage.textContent = message;
        toast.style.borderLeftColor = isError ? '#ef4444' : '#3b82f6';
        toast.style.borderLeftWidth = '4px';
        toast.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
        toast.classList.add('visible');
        setTimeout(() => toast.classList.remove('visible'), 3000);
    }

    function updateLayout() {
        const width = scrollContainer.clientWidth;
        if (width > 0) {
            const newCols = Math.max(1, Math.floor(width / CELL_SIZE));
            if (newCols !== COLS) {
                COLS = newCols;
                for (const el of renderedCells.values()) el.remove();
                renderedCells.clear();
            }
            const rows = Math.ceil(TOTAL / COLS);
            gridContainer.style.height = `${rows * CELL_SIZE}px`;
        }
    }

    scrollContainer.onscroll = renderVisible;
    window.addEventListener('resize', () => {
        updateLayout();
        renderVisible();
    });
    loginBtn.onclick = login;
    logoutBtn.onclick = logout;

    updateLayout();
    renderVisible();

    setInterval(() => {
        const neededChunks = new Set();
        for (const index of renderedCells.keys()) {
            neededChunks.add(Math.floor(index / CHUNK_SIZE));
        }
        // Force refresh visible chunks periodically
        neededChunks.forEach(chunkIndex => {
            fetchedChunks.delete(chunkIndex);
            fetchChunk(chunkIndex);
        });
    }, 5000);

    updateAuthUI();
    connectWS();

})();
