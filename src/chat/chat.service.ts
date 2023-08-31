import { redis } from './../redis';
import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateChatRoomDTO, UpdateChatRoomDTO } from './types/ChatRoom.type';

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

  async createChatRoom(data: CreateChatRoomDTO): Promise<boolean> {
    try {
      const result = await this.createRoomOnRedis(data);
      return result;
    } catch (e) {
      throw new BadRequestException('fail to create room');
    }
  }

  async updateChatRoom(dto: UpdateChatRoomDTO, clientId: string) {
    const datas = Object.entries(dto);

    if (datas.length === 0)
      throw new BadRequestException('There is no data to update.');
    const room = (
      await this.redis.json.get('chatRooms', {
        path: `$.${dto.maxNumberOfPerson}.${dto.roomId}`,
      })
    )[0];

    if (room.roomOwner !== clientId)
      throw new BadRequestException(
        'Only can change information by room owner',
      );

    const includeChangeMax = Object.keys(dto).includes('changeMax'); // 정원 변경을 하려 하는지 안하는지 체크
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
        JSON.stringify(data),
      );

      await this.redis.incr('roomCnt');
      return true;
    } catch (e) {
      return false;
    }
  }
}
