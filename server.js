/**
 * 情侣生活费管家 - 实时同步服务器
 * Express + Socket.IO
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const STATIC_DIR = path.join(__dirname, 'public');

// 从文件加载数据
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf-8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error('加载数据失败:', e.message);
    }
    return {};
}

// 保存数据到文件
function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
        console.error('保存数据失败:', e.message);
    }
}

// 初始化：确保静态目录存在
if (!fs.existsSync(STATIC_DIR)) {
    fs.mkdirSync(STATIC_DIR, { recursive: true });
}

// 加载持久化数据
let sharedData = loadData();
console.log('📂 已加载数据:', sharedData);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingTimeout: 60000,
    pingInterval: 25000,
});

// 静态文件
app.use(express.static(STATIC_DIR));

// 健康检查
app.get('/health', (req, res) => {
    res.json({ status: 'ok', clients: io.engine.clientsCount });
});

// Socket.IO 连接处理
io.on('connection', (socket) => {
    const clientCount = io.engine.clientsCount;
    console.log(`🔗 新连接: ${socket.id}（当前 ${clientCount} 人在线）`);

    // 发送当前数据给新连接的客户端
    socket.emit('init-data', sharedData);

    // 通知所有人有人上线
    socket.broadcast.emit('peer-status', { online: true, count: clientCount });

    // 告诉当前客户端有多少人在线
    socket.emit('peer-status', { online: true, count: clientCount });

    // 接收数据更新
    socket.on('data-update', (update) => {
        // update: { person: 'boy'|'girl', field: 'budget'|'spent'|'payday', value: string }
        const key = `${update.person}_${update.field}`;
        // 映射字段名：boyBudget, boySpent, boyPayday, girlBudget, girlSpent, girlPayday

        const fieldMap = {
            'boy_budget': 'boyBudget',
            'boy_spent': 'boySpent',
            'boy_payday': 'boyPayday',
            'girl_budget': 'girlBudget',
            'girl_spent': 'girlSpent',
            'girl_payday': 'girlPayday',
        };

        const dataKey = fieldMap[key];
        if (dataKey) {
            sharedData[dataKey] = update.value;
            saveData(sharedData);
            console.log(`💾 ${dataKey} = ${update.value || '(空)'}`);

            // 广播给所有其他客户端
            socket.broadcast.emit('data-update', update);
        }
    });

    // 断开连接
    socket.on('disconnect', () => {
        const remaining = io.engine.clientsCount;
        console.log(`🔌 断开连接: ${socket.id}（当前 ${remaining} 人在线）`);

        // 通知其他人
        socket.broadcast.emit('peer-status', { online: remaining > 0, count: remaining });
    });
});

server.listen(PORT, () => {
    console.log(`🚀 服务器启动: http://localhost:${PORT}`);
    console.log(`📡 WebSocket 就绪，等待连接...`);
});
