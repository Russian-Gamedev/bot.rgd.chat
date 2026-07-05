import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status: string;
}

export class OkResponseDto {
  @ApiProperty({ example: true })
  ok: boolean;
}
