import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { JoinMessage, UpdateMessage } from './types/Socket.message';
import { BadRequestException, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/common/guard/auth.guard';
import { ChatUser } from './types/ChatUser.type';
import { User } from 'src/common/decorator/user.decorator';
import { ChatService } from './chat.service';
import { RoomInfo } from './types/ChatRoom.type';
import { NestGateway } from '@nestjs/websockets/interfaces/nest-gateway.interface';

@UseGuards(JwtGuard)
@WebSocketGateway(8000, {
  namespace: 'chat',
  cookie: true,
  cors: {
    origin: ['http://localhost:8000', 'http://localhost:3200'],
    credentials: true,
  },
})
export class ChatGateway implements NestGateway {
  private connectedClients = new Map<string, any>();
  constructor(private readonly chatService: ChatService) {}

  // 채팅방 조회
  @SubscribeMessage('getRooms')
  async handleConnection(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    this.connectedClients.set(client.id, client);
    
    return await this.chatService.getChatRooms();
  }

  // 연결이 끊어지는 상황을 잡아 그 피어의 ID를 클라이언트에 전송
  async handleDisconnect(@ConnectedSocket() client: Socket) {
    if (this.connectedClients.has(client.id)){
      this.connectedClients.delete(client.id);
    }
    
    const user = client['User'];

    const message = await this.chatService.outRoom(user);
  }

  // 방 만들기
  @SubscribeMessage('drinkitRoom')
  async openChatRoom(
    @MessageBody() data: JoinMessage,
    @ConnectedSocket() client: Socket,
    @User() user: ChatUser,
  ) {
    const roomInfo: RoomInfo = {
      roomOwner: user.nickname,
      roomName: data.roomName,
      maxNumberOfPerson: data.maxNumberOfPerson,
      currentUser: [],
    };
    
    if (data.password) {
      roomInfo.password = data.password;
    }

    const createResult = await this.chatService.createChatRoom(roomInfo);

    if (!createResult){
      return {
        message: 'fail to create room. Please try again few minutes later',
      };
    }

    client.emit('welcome', `${user.nickname}님이 입장하셨습니다.`);

    return { roomId: createResult, ...roomInfo };
  }

  // 방 삭제 ( 연결된 모든 유저 연결 해지 및 방 삭제 )
  @SubscribeMessage('deleteRoom')
  async closeChatRoom(
    @MessageBody() data: UpdateMessage,
    @ConnectedSocket() client: Socket,
    @User() user: ChatUser,
  ) {
    const roomName = Array.from(client.rooms)[1];

    client.in(roomName).disconnectSockets();
    client.disconnect(true);

    await this.chatService.closeChatRoom(user.nickname);
  }

  // 방 나오기
  @SubscribeMessage('outRoom')
  async outChatRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: RoomInfo,
    @User() user: ChatUser,
  ) {
    this.chatService.outRoom(user, data);
    const roomName = Array.from(client.rooms)[1];
    client.to(roomName).emit('outUser', client.id);
    client.leave(roomName);
  }

  // 모든 사용자에게 메시지 전송
  @SubscribeMessage('sendChat')
  broadcastRoom(
    @MessageBody() data: string,
    @ConnectedSocket() client: Socket,
    @User() user,
  ) {
    const roomName = Array.from(client.rooms)[1];

    client.to(roomName).emit('broadcastMessage', `${user.nickname}: ${data}`);

    return data;
  }

  // 방에 참가
  @SubscribeMessage('joinRoom')
  async joinChatRoom(
    @MessageBody() data,
    @ConnectedSocket() client: Socket,
    @User() user: ChatUser,
  ) {
    await this.chatService.joinRoom(data, user);

    client.join(data.roomId);

    const roomName = data.roomName;

    client
      .to(data.roomId)
      .emit(
        'broadcastMessage',
        `"${user.nickname}"님, "${roomName}" 방에 입장했습니다.`,
      );

    client.to(data.roomId).emit('sharedId', client.id);
  }
}
