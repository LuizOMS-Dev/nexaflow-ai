type Client = {
  socket: { send: (data: string) => void; readyState: number };
  userId: string;
  tenantId?: string | null;
};

const clients = new Set<Client>();

export function addClient(client: Client) {
  clients.add(client);
}

export function removeClient(client: Client) {
  clients.delete(client);
}

export function broadcastToTenant(tenantId: string, event: string, payload: unknown) {
  const message = JSON.stringify({ event, payload, at: new Date().toISOString() });
  for (const client of clients) {
    if (client.tenantId === tenantId && client.socket.readyState === 1) {
      try {
        client.socket.send(message);
      } catch {
        // ignore broken sockets
      }
    }
  }
}

/** Evento para um usuário (ex.: notificação global de release da plataforma). */
export function broadcastToUser(userId: string, event: string, payload: unknown) {
  const message = JSON.stringify({ event, payload, at: new Date().toISOString() });
  for (const client of clients) {
    if (client.userId === userId && client.socket.readyState === 1) {
      try {
        client.socket.send(message);
      } catch {
        // ignore broken sockets
      }
    }
  }
}

/** Broadcast a todos os sockets autenticados (releases públicas da plataforma). */
export function broadcastToAllUsers(event: string, payload: unknown) {
  const message = JSON.stringify({ event, payload, at: new Date().toISOString() });
  for (const client of clients) {
    if (client.socket.readyState === 1) {
      try {
        client.socket.send(message);
      } catch {
        // ignore broken sockets
      }
    }
  }
}
