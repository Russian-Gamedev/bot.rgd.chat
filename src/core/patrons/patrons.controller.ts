import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PatronDto } from './dto/patron.dto';
import { PatronsService } from './patrons.service';

@ApiTags('Patrons')
@Controller('patrons')
export class PatronsController {
  constructor(private readonly patronsService: PatronsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all patrons' })
  @ApiOkResponse({ type: [PatronDto] })
  async getPatrons() {
    return this.patronsService.getPatrons();
  }
}
