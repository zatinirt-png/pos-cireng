// client/src/socket.js
import { io } from "socket.io-client";

const URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export const socket = io(URL, {
  autoConnect: false,
  transports: ["websocket"],
});

// helper
export function connectSocket(token) {
  socket.auth = token ? { token } : {};
  if (!socket.connected) socket.connect();
}

export function disconnectSocket() {
  if (socket.connected) socket.disconnect();
}
