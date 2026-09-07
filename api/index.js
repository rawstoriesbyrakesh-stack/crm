import server from '../backend/server.js';

export default function handler(req, res) {
  if (typeof server === 'function') {
    return server(req, res);
  } else if (server && typeof server.emit === 'function') {
    return server.emit('request', req, res);
  }
}
