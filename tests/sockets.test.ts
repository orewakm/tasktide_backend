import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connectClient, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { pool } from '../src/db';
import { initSockets } from '../src/sockets';
import { setIo, type IoServer } from '../src/sockets/realtime';
import { addMember, api, createBoard, createCard, createColumn, createUser } from './helpers';

let server: HttpServer;
let io: IoServer;
let url: string;
const clients: Socket[] = [];

beforeAll(async () => {
    server = createServer(app);
    io = initSockets(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    url = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
    for (const client of clients) client.disconnect();
    await io.close();
    setIo(null);
});

// Connects a socket with the token and resolves once it is connected.
function connect(token: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
        const socket = connectClient(url, {
            auth: { token },
            transports: ['websocket'],
            forceNew: true,
            reconnection: false,
        });
        clients.push(socket);
        socket.once('connect', () => resolve(socket));
        socket.once('connect_error', reject);
    });
}

// Waits for the next event whose payload matches.
function waitFor<T = any>(socket: Socket, event: string, match: (payload: T) => boolean = () => true): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off(event, listener);
            reject(new Error(`no matching "${event}" within 3s`));
        }, 3000);
        // Resolves with the payload once it matches.
        function listener(payload: T) {
            if (!match(payload)) return;
            clearTimeout(timer);
            socket.off(event, listener);
            resolve(payload);
        }
        socket.on(event, listener);
    });
}

// Joins a board's room and returns the server's reply.
function joinBoard(socket: Socket, boardId: string) {
    return socket.emitWithAck('board:join', boardId);
}

describe('sockets', () => {
    it('rejects connections without a valid session', async () => {
        await expect(connect('not-a-real-token')).rejects.toThrow('Unauthorized');
    });

    it('only lets members join a board room', async () => {
        const owner = await createUser('Owner');
        const outsider = await createUser('Outsider');
        const board = await createBoard(owner);

        const socket = await connect(outsider.token);
        expect(await joinBoard(socket, board.id)).toEqual({ ok: false, error: 'Board not found' });
        expect(await joinBoard(socket, 'not-a-uuid')).toEqual({ ok: false, error: 'Invalid board id' });
    });

    it('shows who is online and pushes changes to everyone on the board', async () => {
        const owner = await createUser('Owner');
        const member = await createUser('Member');
        const board = await createBoard(owner);
        await addMember(owner, board.id, member);
        const column = await createColumn(owner, board.id);

        const ownerSocket = await connect(owner.token);
        const memberSocket = await connect(member.token);
        await joinBoard(ownerSocket, board.id);

        const bothOnline = waitFor(ownerSocket, 'presence', (p: { online: unknown[] }) => p.online.length === 2);
        const reply = await joinBoard(memberSocket, board.id);
        expect(reply.ok).toBe(true);
        expect((await bothOnline).online.map((u: { name: string }) => u.name).sort()).toEqual(['Member', 'Owner']);

        const created = waitFor(ownerSocket, 'card:created');
        await createCard(member, column.id, 'Live card');
        expect((await created).title).toBe('Live card');

        const onlyOwner = waitFor(ownerSocket, 'presence', (p: { online: unknown[] }) => p.online.length === 1);
        memberSocket.disconnect();
        expect((await onlyOwner).online[0].name).toBe('Owner');
    });

    it('sends renumbered positions before the moved card', async () => {
        const owner = await createUser('Owner');
        const board = await createBoard(owner);
        const column = await createColumn(owner, board.id);
        await createCard(owner, column.id, 'P');
        const q = await createCard(owner, column.id, 'Q');
        const r = await createCard(owner, column.id, 'R');
        await pool.query('UPDATE cards SET position = $2 WHERE id = $1', [q.id, 1000.0000001]);

        const socket = await connect(owner.token);
        await joinBoard(socket, board.id);
        const events: string[] = [];
        socket.on('cards:renumbered', () => events.push('cards:renumbered'));
        const moved = waitFor(socket, 'card:moved');

        await api().patch(`/api/cards/${r.id}/move`).set(owner.auth).send({ columnId: column.id, index: 1 });
        expect((await moved).position).toBe(1500);
        expect(events).toEqual(['cards:renumbered']);
    });

    it('tells invited users live, and removed members stop getting events', async () => {
        const owner = await createUser('Owner');
        const member = await createUser('Member');
        const guest = await createUser('Guest');
        const board = await createBoard(owner);
        await addMember(owner, board.id, member);
        const column = await createColumn(owner, board.id);

        const guestSocket = await connect(guest.token);
        const invitation = waitFor(guestSocket, 'invitation:received');
        await api().post(`/api/boards/${board.id}/members`).set(owner.auth).send({ email: guest.email });
        expect((await invitation).id).toBe(board.id);

        const memberSocket = await connect(member.token);
        await joinBoard(memberSocket, board.id);
        const removed = waitFor(memberSocket, 'board:removed');
        await api().delete(`/api/boards/${board.id}/members/${member.id}`).set(owner.auth);
        expect((await removed).id).toBe(board.id);

        let leaked = false;
        memberSocket.on('card:created', () => {
            leaked = true;
        });
        await createCard(owner, column.id, 'Secret');
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(leaked).toBe(false);
    });

    it('logging out closes the sockets of that session', async () => {
        const user = await createUser('Leaver');
        const socket = await connect(user.token);
        const disconnected = waitFor(socket, 'disconnect');
        await api().post('/api/auth/logout').set(user.auth);
        expect(await disconnected).toBe('io server disconnect');
    });
});
