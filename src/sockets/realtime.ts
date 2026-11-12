import type { Server } from 'socket.io';
import type { Role } from '../repositories/userRepository';

export interface SocketUser {
    id: string;
    name: string;
    role: Role;
}

export interface SocketData {
    user: SocketUser;
    sessionToken: string;
}

type Events = Record<string, (...args: any[]) => void>;
export type IoServer = Server<Events, Events, Events, SocketData>;

export type BoardEvent =
    | 'board:updated'
    | 'board:deleted'
    | 'member:added'
    | 'member:updated'
    | 'member:removed'
    | 'column:created'
    | 'column:updated'
    | 'column:moved'
    | 'column:deleted'
    | 'columns:renumbered'
    | 'card:created'
    | 'card:updated'
    | 'card:moved'
    | 'card:deleted'
    | 'cards:renumbered'
    | 'note:created'
    | 'note:updated'
    | 'note:deleted'
    | 'timer:started'
    | 'timer:stopped'
    | 'time-entry:deleted';

export type UserEvent = 'invitation:received' | 'board:added' | 'board:removed';

let io: IoServer | null = null;

// Stores the Socket.IO server so services can send events.
export function setIo(server: IoServer | null) {
    io = server;
}

// Returns the room name of a board.
export const boardRoom = (boardId: string) => `board:${boardId}`;
// Returns the room name of a user.
export const userRoom = (userId: string) => `user:${userId}`;

// Sends an event to everyone who has the board open.
export function emitToBoard(boardId: string, event: BoardEvent, payload: unknown) {
    io?.to(boardRoom(boardId)).emit(event, payload);
}

// Sends an event to all of one user's connections.
export function emitToUser(userId: string, event: UserEvent, payload: unknown) {
    io?.to(userRoom(userId)).emit(event, payload);
}

// Returns the users who have the board open right now, once each.
export async function onlineUsers(boardId: string): Promise<{ id: string; name: string }[]> {
    if (!io) return [];
    const sockets = await io.in(boardRoom(boardId)).fetchSockets();
    const users = new Map<string, { id: string; name: string }>();
    for (const socket of sockets) {
        users.set(socket.data.user.id, { id: socket.data.user.id, name: socket.data.user.name });
    }
    return [...users.values()];
}

// Sends the board's online users to everyone in its room.
export async function broadcastPresence(boardId: string) {
    if (!io) return;
    const online = await onlineUsers(boardId);
    io.to(boardRoom(boardId)).emit('presence', { board_id: boardId, online });
}

// Takes all of a user's sockets out of a board's room.
export async function removeUserFromBoard(boardId: string, userId: string) {
    if (!io) return;
    io.in(userRoom(userId)).socketsLeave(boardRoom(boardId));
    await broadcastPresence(boardId);
}

// Removes every socket from a board's room.
export function closeBoardRoom(boardId: string) {
    io?.in(boardRoom(boardId)).socketsLeave(boardRoom(boardId));
}

// Disconnects the sockets that were opened with the given session.
export async function disconnectSession(userId: string, token: string) {
    if (!io) return;
    const sockets = await io.in(userRoom(userId)).fetchSockets();
    for (const socket of sockets) {
        if (socket.data.sessionToken === token) socket.disconnect(true);
    }
}
