import requestHandler from '../backend/server.js';

export default async function handler(req, res) {
  return requestHandler(req, res);
}
