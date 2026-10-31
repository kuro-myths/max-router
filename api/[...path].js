import app from "../backend/dist/vercel.js";

export const config = { maxDuration: 60, api: { bodyParser: false } };

export default function handler(req, res) {
  return app(req, res);
}
