// src/common/dto/move.dto.ts
import { IsIn } from 'class-validator';

// The body of POST /modules/:id/move and POST /lessons/:id/move
export class MoveDto {
  @IsIn(['up', 'down'], { message: 'The direction must be "up" or "down".' })
  direction: 'up' | 'down';
}
