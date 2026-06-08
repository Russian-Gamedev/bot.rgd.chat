export enum EmojiMedals {
  First = '🥇',
  Second = '🥈',
  Third = '🥉',
  Medal = '🏅',
}

export const EmojiNumber: Record<string, string> = {
  '1': '1️⃣',
  '2': '2️⃣',
  '3': '3️⃣',
  '4': '4️⃣',
  '5': '5️⃣',
  '6': '6️⃣',
  '7': '7️⃣',
  '8': '8️⃣',
  '9': '9️⃣',
  '0': '0️⃣',
};

export enum EmojiCoinId {
  Top = '1428759054402191482',
  Bottom = '1428759056486502496',
  Animated = '1428758842602426560',
}

export enum EmojiCoin {
  Top = `<:coin:${EmojiCoinId.Top}>`,
  Bottom = `<:coin_flipped:${EmojiCoinId.Bottom}>`,
  Animated = `<a:coin_flip:${EmojiCoinId.Animated}>`,
}
