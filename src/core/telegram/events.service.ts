import { Ctx, InjectBot, Start, Update } from 'nestjs-telegraf';
import { Context, Telegraf } from 'telegraf';

@Update()
export class TelegramBotService {
  constructor(@InjectBot() private readonly bot: Telegraf<Context>) {}

  @Start()
  async onStart(@Ctx() ctx: Context) {
    await ctx.reply(
      'Добро пожаловать в RGD Bot!\n\nЭтот бот ничего не делает :)',
    );
  }
}
