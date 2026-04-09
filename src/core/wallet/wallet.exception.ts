import { BadRequestException } from '@nestjs/common';

export class InsufficientFundsException extends BadRequestException {
  constructor(balance: bigint, required: bigint) {
    super(`Недостаточно монет. Баланс: ${balance}, требуется: ${required}`);
  }
}

export class InvalidAmountException extends BadRequestException {
  constructor(operation: string) {
    super(`Сумма должна быть положительной: ${operation}`);
  }
}
