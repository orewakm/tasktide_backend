import type { Server } from 'socket.io';
import type { Role } from '../repositories/userRepository';

// Services call the functions in this file after a change is saved, to tell
// everyone who has the board open. The Socket.IO server itself is set up in ./index.ts.

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

// Every event the server sends to a board room. A union type catches typos at compile time.
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

// Events sent to one user's own room (all their open tabs).
export type UserEvent = 'invitation:received' | 'board:added' | 'board:removed';

let io: IoServer | null = null;

export function setIo(server: IoServer | null) {
    io = server;
}

export const boardRoom = (boardId: string) => `board:${boardId}`;
export const userRoom = (userId: string) => `user:${userId}`;

// When sockets aren't running (some tests), these do nothing.
export function emitToBoard(boardId: string, event: BoardEvent, payload: unknown) {
    io?.to(boardRoom(boardId)).emit(event, payload);
}

export function emitToUser(userId: string, event: UserEvent, payload: unknown) {
    io?.to(userRoom(userId)).emit(event, payload);
}

// Who has the board open right now. One entry per user, even with several tabs open.
export async function onlineUsers(boardId: string): Promise<{ id: string; name: string }[]> {
    if (!io) return [];
    const sockets = await io.in(boardRoom(boardId)).fetchSockets();
    const users = new Map<string, { id: string; name: string }>();
    for (const socket of sockets) {
        users.set(socket.data.user.id, { id: socket.data.user.id, name: socket.data.user.name });
    }
    return [...users.values()];
}

export async function broadcastPresence(boardId: string) {
    if (!io) return;
    const online = await onlineUsers(boardId);
    io.to(boardRoom(boardId)).emit('presence', { board_id: boardId, online });
}

// A removed member stops receiving the board's events right away.
export async function removeUserFromBoard(boardId: string, userId: string) {
    if (!io) return;
    io.in(userRoom(userId)).socketsLeave(boardRoom(boardId));
    await broadcastPresence(boardId);
}

// After 'board:deleted' is sent, nobody stays in the room.
export function closeBoardRoom(boardId: string) {
    io?.in(boardRoom(boardId)).socketsLeave(boardRoom(boardId));
}

// Logging out also closes the sockets opened with that session.
export async function disconnectSession(userId: string, token: string) {
    if (!io) return;
    const sockets = await io.in(userRoom(userId)).fetchSockets();
    for (const socket of sockets) {
        if (socket.data.sessionToken === token) socket.disconnect(true);
    }
}
