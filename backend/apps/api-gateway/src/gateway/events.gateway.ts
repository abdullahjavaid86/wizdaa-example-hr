import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { WsRequestEvent, WsBalanceEvent } from '@app/common';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  },
  namespace: '/',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    const token =
      client.handshake.auth.token ??
      client.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify(token);
      client.data.userId = payload.sub;
      client.data.role = payload.role;
      await client.join(`user:${payload.sub}`);
      if (payload.role === 'MANAGER' || payload.role === 'ADMIN') {
        await client.join(`managers`);
      }
      if (payload.role === 'ADMIN') {
        await client.join(`admins`);
      }
      this.logger.log(`Client connected: ${payload.sub} (${payload.role})`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.data.userId ?? client.id}`);
  }

  notifyEmployee(employeeId: string, event: string, payload: unknown) {
    this.server.to(`user:${employeeId}`).emit(event, payload);
  }

  notifyManager(managerId: string | undefined, payload: WsRequestEvent) {
    if (managerId) {
      this.server.to(`user:${managerId}`).emit('request.created', payload);
    } else {
      this.server.to('managers').emit('request.created', payload);
    }
  }

  notifyManagers(event: string, payload: unknown) {
    this.server.to('managers').emit(event, payload);
  }

  notifyAdmins(event: string, payload: unknown) {
    this.server.to('admins').emit(event, payload);
  }
}
