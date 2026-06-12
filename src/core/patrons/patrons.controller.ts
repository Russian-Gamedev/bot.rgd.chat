import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { PatronsService } from './patrons.service';

@ApiTags('Patrons')
@Controller('patrons')
export class PatronsController {
  constructor(private readonly patronsService: PatronsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all patrons' })
  async getPatrons() {
    return this.patronsService.getPatrons();
  }
}
