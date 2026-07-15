export interface TarotCard {
  readonly id: string;
  readonly name: string;
  readonly uprightKeywords: readonly string[];
  readonly reversedKeywords: readonly string[];
}

export const TAROT_CARDS: readonly TarotCard[] = [
  {
    id: 'fool',
    name: 'Шут',
    uprightKeywords: ['новый шанс', 'импровизация', 'готовность рискнуть'],
    reversedKeywords: ['необдуманный риск', 'действия без подготовки'],
  },
  {
    id: 'magician',
    name: 'Маг',
    uprightKeywords: [
      'достаточно ресурсов',
      'достаточно навыков',
      'влияние на результат',
    ],
    reversedKeywords: ['потраченный потенциал', 'хаотичное использование'],
  },
  {
    id: 'high-priestess',
    name: 'Верховная Жрица',
    uprightKeywords: ['наблюдение', 'сбор информации', 'не спешить'],
    reversedKeywords: ['игнорирование сигналов', 'слепые решения'],
  },
  {
    id: 'empress',
    name: 'Императрица',
    uprightKeywords: ['благоприятные условия', 'рост', 'поддержка окружения'],
    reversedKeywords: ['пассивность', 'потеря темпа'],
  },
  {
    id: 'emperor',
    name: 'Император',
    uprightKeywords: ['дисциплина', 'структура', 'чёткий лидер'],
    reversedKeywords: ['излишний контроль', 'борьба за лидерство'],
  },
  {
    id: 'hierophant',
    name: 'Иерофант',
    uprightKeywords: ['проверенная стратегия', 'надёжность'],
    reversedKeywords: ['предсказуемость', 'требуется обновление'],
  },
  {
    id: 'lovers',
    name: 'Влюблённые',
    uprightKeywords: ['слаженность', 'доверие', 'результат от команды'],
    reversedKeywords: ['несогласованность', 'разные цели'],
  },
  {
    id: 'chariot',
    name: 'Колесница',
    uprightKeywords: [
      'движение вперёд',
      'контроль',
      'воля',
      'победа',
      'высокий темп',
    ],
    reversedKeywords: [
      'потеря контроля',
      'хаос',
      'разные направления',
      'самоуверенность',
    ],
  },
  {
    id: 'strength',
    name: 'Сила',
    uprightKeywords: ['спокойствие', 'выдержка', 'отказ от агрессии'],
    reversedKeywords: ['импульсивность', 'неуверенность'],
  },
  {
    id: 'hermit',
    name: 'Отшельник',
    uprightKeywords: ['осторожность', 'анализ', 'осмысленность'],
    reversedKeywords: ['изоляция', 'отсутствие коммуникации'],
  },
  {
    id: 'wheel-of-fortune',
    name: 'Колесо Фортуны',
    uprightKeywords: ['резкие изменения', 'удача', 'благоприятный поворот'],
    reversedKeywords: ['случайность', 'неудачные обстоятельства'],
  },
  {
    id: 'justice',
    name: 'Справедливость',
    uprightKeywords: ['справедливый результат', 'качество решений'],
    reversedKeywords: ['ошибки', 'недооценка ситуации'],
  },
  {
    id: 'hanged-man',
    name: 'Повешенный',
    uprightKeywords: ['смена подхода', 'отказ от привычной тактики'],
    reversedKeywords: ['бесполезные действия', 'отсутствие выводов'],
  },
  {
    id: 'death',
    name: 'Смерть',
    uprightKeywords: ['отказ от старого', 'полная перестройка'],
    reversedKeywords: ['нежелание адаптироваться', 'затяжной кризис'],
  },
  {
    id: 'temperance',
    name: 'Умеренность',
    uprightKeywords: ['терпение', 'размеренные шаги', 'спокойствие'],
    reversedKeywords: ['поспешность', 'дисбаланс'],
  },
  {
    id: 'devil',
    name: 'Дьявол',
    uprightKeywords: ['азарт', 'жадность', 'бездумные действия'],
    reversedKeywords: ['остановиться', 'вернуть контроль'],
  },
  {
    id: 'tower',
    name: 'Башня',
    uprightKeywords: [
      'резкий кризис',
      'разрушение плана',
      'неожиданная ошибка',
      'переломный момент',
    ],
    reversedKeywords: [
      'избежание кризиса',
      'отложенная проблема',
      'частичное восстановление',
    ],
  },
  {
    id: 'star',
    name: 'Звезда',
    uprightKeywords: [
      'уверенность',
      'последовательность',
      'хорошая перспектива',
    ],
    reversedKeywords: ['ранняя потеря веры', 'нетерпеливость'],
  },
  {
    id: 'moon',
    name: 'Луна',
    uprightKeywords: ['неясная ситуация', 'непредсказуемость окружения'],
    reversedKeywords: ['страхи', 'иллюзии'],
  },
  {
    id: 'sun',
    name: 'Солнце',
    uprightKeywords: ['успех', 'ясность', 'уверенность', 'благоприятный исход'],
    reversedKeywords: ['самоуверенность', 'задержка успеха', 'неполная победа'],
  },
  {
    id: 'judgement',
    name: 'Суд',
    uprightKeywords: ['исправление ошибок', 'шанс переломить'],
    reversedKeywords: ['замеченные ошибки', 'отсутствие изменений'],
  },
  {
    id: 'world',
    name: 'Мир',
    uprightKeywords: ['успешное завершение', 'заслуженный результат'],
    reversedKeywords: ['нехватка дисциплины', 'нехватка концентрации'],
  },
] as const;
