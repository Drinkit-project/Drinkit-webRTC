import { redis } from './../redis';
import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CreateChatRoomDTO,
  RoomInfo,
  UpdateChatRoomDTO,
  UpdateRoom,
} from './types/ChatRoom.type';
import { Socket } from 'socket.io';

@Injectable()
export class ChatService {
  private readonly redis = redis.client;

  async getChatRooms(max?: string) {
    if (max) return await this.redis.json.get('chatRooms', { path: `.${max}` });
    return await this.redis.json.get('chatRooms');
  }

  async getOneChatRoomByClientId(clientId: string) {
    const data = await this.redis.json.get('chatRooms', {
      path: `$.*[?(@.roomOwner=='${clientId}')]`,
    });
    const room = JSON.parse(JSON.stringify(data));

    const result = room.length !== 0 ? room[0] : null;
    return result;
  }

  async createChatRoom(data: CreateChatRoomDTO): Promise<string | boolean> {
    try {
      const result = await this.createRoomOnRedis(data);
      console.log('service =>', result);
      return result;
    } catch (e) {
      throw new BadRequestException('fail to create room');
    }
  }

  async updateChatRoom(dto: UpdateChatRoomDTO, roomId: string) {
    const datas: UpdateRoom = {};
    dto.changeMax === undefined ? null : (datas.changeMax = dto.changeMax);
    dto.roomName === undefined ? null : (datas.roomName = dto.roomName);
    dto.password === undefined ? null : (datas.password = dto.password);

    if (Object.keys(datas).length === 0)
      throw new BadRequestException('There is no data to update.');

    const room = (
      await this.redis.json.get('chatRooms', {
        path: `$.${dto.maxNumberOfPerson}.${roomId}`,
      })
    )[0];

    const includeChangeMax: boolean = Object.keys(datas).includes('changeMax'); // 정원 변경을 하려 하는지 안하는지 체크

    if (includeChangeMax) {
      if (
        dto.currentNumberOfPerson > datas.changeMax &&
        datas.changeMax > 4 &&
        datas.changeMax < 2
      )
        throw new BadRequestException(
          'Because of wrong number of Max, it is not possible to change',
        );

      Object.entries(datas).forEach((data) => {
        room[data[0]] = data[1];
      });
      await this.redis.json.del(
        'chatRooms',
        `$.${dto.maxNumberOfPerson}.${roomId}`,
      );
      await this.redis.json.set(
        'chatRooms',
        `$.${datas.changeMax}.${roomId}`,
        room,
      );
    } else {
      Object.entries(datas).forEach((data) => {
        room[data[0]] = data[1];
      });
      await this.redis.json.set(
        'chatRooms',
        `$.${dto.maxNumberOfPerson}.${roomId}`,
        room,
      );
    }
    return;
  }

  async closeChatRoom(clientId: string): Promise<boolean> {
    try {
      await this.redis.json.del(`chatRooms','$.*[?(@.roomOwner==${clientId})]`);
      return true;
    } catch (e) {
      return false;
    }
  }

  async createRoomOnRedis(data: CreateChatRoomDTO): Promise<boolean> {
    try {
      const roomCnt = await this.redis.get('roomCnt');

      await this.redis.json.set(
        'chatRooms',
        `.${data.maxNumberOfPerson}.${roomCnt}`,
        JSON.parse(JSON.stringify(data)),
      );

      await this.redis.incr('roomCnt');
      return true;
    } catch (e) {
      return false;
    }
  }

  async joinRoom(data: RoomInfo, client: Socket) {
    const room = await this.redis.json.get('chatRooms', {
      path: `.${data.maxNumberOfPerson}.${data.roomId}`,
    });

    room['currentUser'].push(client.id);

    await this.redis.json.set(
      'chatRooms',
      `.${data.maxNumberOfPerson}.${data.roomId}`,
      room,
    );

    return;
  }

  async outRoom(client: Socket, data?: RoomInfo) {
    if (data) {
      const room = await this.redis.json.get('chatRooms', {
        path: `.${data.maxNumberOfPerson}.${data.roomId}`,
      });
      const idx = room['currentUser'].findIndex((id) => id === client.id);
      if (idx === -1)
        throw new BadRequestException('There is no ID in this room');

      room['currentUser'].splice(idx, 1);

      await this.redis.json.set(
        'chatRooms',
        `.${data.maxNumberOfPerson}.${data.roomId}`,
        room,
      );
    } else {
    }

    return;
  }
}
