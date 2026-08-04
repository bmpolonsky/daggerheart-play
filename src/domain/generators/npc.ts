export interface GeneratedNpc {
  name: string;
  appearance: string;
  manner: string;
  motive: string;
  detail: string;
}

const NAMES = ['Аверин', 'Брина', 'Вейра', 'Гален', 'Дорн', 'Илва', 'Касс', 'Лиора', 'Мирен', 'Нив', 'Орса', 'Рен'];
const APPEARANCES = [
  'в дорожном плаще, пахнущем дождём',
  'с серебряной прядью и внимательным взглядом',
  'в безупречно чистой одежде не по погоде',
  'с обожжёнными перчатками и россыпью веснушек',
  'с тяжёлой сумкой травника через плечо',
  'с татуировкой созвездия на шее'
];
const MANNERS = [
  'говорит тихо и никогда не перебивает',
  'отвечает вопросом на вопрос',
  'нервно шутит в самые неподходящие моменты',
  'держится церемонно, даже когда злится',
  'смотрит собеседнику прямо в глаза',
  'каждую мысль сопровождает широким жестом'
];
const MOTIVES = [
  'хочет вернуть долг человеку, которого давно считает погибшим',
  'ищет доказательство старой семейной тайны',
  'пытается защитить поселение, не раскрывая настоящую угрозу',
  'мечтает заслужить уважение своего бывшего наставника',
  'собирает деньги на опасное путешествие',
  'пытается исправить ошибку, о которой никто ещё не знает'
];
const DETAILS = [
  'всегда носит с собой сломанный ключ',
  'помнит имена всех встреченных животных',
  'боится открытого огня, но скрывает это',
  'оставляет на полях книг маленькие карты',
  'никогда не садится спиной к двери',
  'узнаёт мелодию, которую не мог слышать'
];

export function generateNpc(rng: () => number = Math.random): GeneratedNpc {
  return {
    name: pick(NAMES, rng),
    appearance: pick(APPEARANCES, rng),
    manner: pick(MANNERS, rng),
    motive: pick(MOTIVES, rng),
    detail: pick(DETAILS, rng)
  };
}

export function formatNpc(npc: GeneratedNpc): string {
  return `${npc.name}\nВнешность: ${npc.appearance}.\nМанера: ${npc.manner}.\nМотив: ${npc.motive}.\nДеталь: ${npc.detail}.`;
}

function pick(values: readonly string[], rng: () => number): string {
  return values[Math.min(values.length - 1, Math.max(0, Math.floor(rng() * values.length)))]!;
}
