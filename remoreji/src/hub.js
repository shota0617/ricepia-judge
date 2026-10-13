// WebSocket：ビデオ通話の接続情報（WebRTC シグナリング）の中継と、レジ画面の状態のリアルタイム配信。
import { WebSocketServer } from 'ws';
import { config, iceServers } from './config.js';
import * as rooms from './rooms.js';
import * as payments from './payments.js';
import { isStaff, sameOrigin } from './auth.js';
import { UserError, computeTotals } from './util.js';

/** roomId -> { staff?: ws, customer?: ws, emptySince?: number } */
const conns = new Map();
const staffWatchers = new Set(); // 店員ダッシュボード（呼び出し一覧の更新通知用）

const sendTo = (ws, msg) => ws?.readyState === 1 && ws.send(JSON.stringify(msg));
const other = (role) => (role === 'staff' ? 'customer' : 'staff');

export function peers(roomId) {
  const c = conns.get(roomId);
  return { staff: !!c?.staff, customer: !!c?.customer };
}

function stateFor(room, role) {
  const sale = room.sale_id ? payments.getSale(room.sale_id) : null;
  return {
    type: 'state',
    room: {
      status: room.status,
      origin: room.origin,
      ...(role === 'staff' ? { code: room.code, inviteUrl: rooms.inviteUrl(room) } : {}),
    },
    cart: room.cart.map(({ id, name, price, qty, taxRate }) => ({ id, name, price, qty, taxRate })),
    totals: computeTotals(room.cart),
    sale: payments.saleView(sale, role),
    peers: peers(room.id),
  };
}

export function broadcast(roomId) {
  const room = rooms.getRoom(roomId);
  const c = conns.get(roomId);
  if (room && c) {
    for (const role of ['staff', 'customer']) sendTo(c[role], stateFor(room, role));
    if (room.status === 'closed') {
      for (const role of ['staff', 'customer']) c[role]?.close(4000, 'closed');
      conns.delete(roomId);
    }
  }
  notifyDashboards();
}

let dashTimer;
function notifyDashboards() {
  clearTimeout(dashTimer);
  dashTimer = setTimeout(() => staffWatchers.forEach((ws) => sendTo(ws, { type: 'rooms-changed' })), 100);
}

rooms.onRoomChange(broadcast);

async function handleStaffMessage(roomId, msg) {
  switch (msg.type) {
    case 'cart:add': return rooms.addProduct(roomId, msg.productId);
    case 'cart:custom': return rooms.addCustom(roomId, msg);
    case 'cart:qty': return rooms.setQty(roomId, msg.lineId, msg.qty);
    case 'cart:remove': return rooms.removeLine(roomId, msg.lineId);
    case 'cart:clear': return rooms.clearCart(roomId);
    case 'checkout:start': return payments.startCheckout(roomId);
    case 'checkout:cancel': return payments.cancelCheckout(roomId);
    case 'checkout:next': return payments.nextCheckout(roomId);
    case 'room:close': return rooms.closeRoom(roomId);
    default: throw new UserError('不明な操作です');
  }
}

function attach(ws, room, role) {
  const roomId = room.id;
  const c = conns.get(roomId) ?? {};
  conns.set(roomId, c);
  // 同じ役割の古い接続（再読み込み前の画面など）は置き換える
  if (c[role]) {
    sendTo(c[role], { type: 'replaced' });
    c[role].close(4001, 'replaced');
  }
  c[role] = ws;
  delete c.emptySince;
  if (role === 'staff') rooms.answerRoom(roomId);

  sendTo(ws, { type: 'hello', role, iceServers: iceServers() });
  broadcast(roomId);
  // 相手がすでにいれば通話を始める（発信は常に店員側）
  if (c[other(role)]) sendTo(c.staff, { type: 'peer-joined' });

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (c[role] !== ws) return;
    // 通話の接続情報・マイク/カメラの状態は相手にそのまま渡す
    if (msg.type === 'signal' || msg.type === 'media') return sendTo(c[other(role)], { type: msg.type, data: msg.data });
    if (role !== 'staff') return;
    try {
      await handleStaffMessage(roomId, msg);
    } catch (e) {
      sendTo(ws, { type: 'error', message: e instanceof UserError ? e.message : 'エラーが発生しました' });
      if (!(e instanceof UserError)) console.error(e);
    }
  });

  ws.on('close', () => {
    if (c[role] !== ws) return;
    delete c[role];
    sendTo(c[other(role)], { type: 'peer-left' });
    if (!c.staff && !c.customer) c.emptySince = Date.now();
    broadcast(roomId);
  });
}

export function createHub(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, config.baseUrl);
    const reject = (code = 403) => {
      socket.write(`HTTP/1.1 ${code} ${code === 404 ? 'Not Found' : 'Forbidden'}\r\n\r\n`);
      socket.destroy();
    };
    if (url.pathname !== '/ws' || !sameOrigin(req)) return reject();
    const role = url.searchParams.get('role');
    let room;
    if (role === 'staff' || role === 'dashboard') {
      if (!isStaff(req)) return reject();
      if (role === 'dashboard') {
        return wss.handleUpgrade(req, socket, head, (ws) => {
          staffWatchers.add(ws);
          ws.on('close', () => staffWatchers.delete(ws));
          alive(ws);
        });
      }
      room = rooms.getRoom(url.searchParams.get('room') ?? '');
    } else if (role === 'customer') {
      room = rooms.getRoomByToken(url.searchParams.get('token') ?? '');
    } else return reject();
    if (!room || room.status === 'closed') return reject(404);
    wss.handleUpgrade(req, socket, head, (ws) => {
      alive(ws);
      attach(ws, room, role);
    });
  });

  // 切れた接続を検知（スマホのスリープ・回線断）
  const alive = (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));
  };
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) ws.terminate();
      else {
        ws.isAlive = false;
        ws.ping();
      }
    }
  }, 25_000);
  heartbeat.unref();

  // 放置されたルームを片付ける
  const sweeper = setInterval(sweepRooms, 60_000);
  sweeper.unref();
  wss.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(sweeper);
  });
  return wss;
}

const WAITING_TIMEOUT = 3 * 60_000; // お客様が呼び出し画面を閉じてから
const IDLE_TIMEOUT = 60 * 60_000; // 誰もいなくなってから

export function sweepRooms(now = Date.now()) {
  for (const room of rooms.listActiveRooms()) {
    const c = conns.get(room.id);
    if (c?.staff || c?.customer) continue;
    const since = c?.emptySince ?? Date.parse(room.answered_at ?? room.created_at);
    const limit = room.status === 'waiting' ? WAITING_TIMEOUT : IDLE_TIMEOUT;
    if (now - since < limit) continue;
    try {
      rooms.closeRoom(room.id);
    } catch {
      // お会計の途中なら残しておく
    }
  }
}
