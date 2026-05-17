export type CameraSection = 'lena' | 'aldan' | 'indi' | 'kolyma' | 'main';

export interface CameraItem {
  label: string;
  embedUrl?: string;
  pageUrl?: string;
  ysiaOnly?: boolean;
}

export interface CameraConfig {
  section: CameraSection;
  items: CameraItem[];
}

const EMBED = (id: string) => `https://cam.a-telecom.ru/${id}/embed.html?autoplay=false`;

export const CAMERA_MAP: Record<string, CameraConfig> = {
  'Ленск': {
    section: 'lena',
    items: [
      { label: 'Набережная', embedUrl: EMBED('Lensk') },
      { label: 'Город', embedUrl: EMBED('Lensk2') },
    ],
  },
  'Олекминск': {
    section: 'lena',
    items: [
      { label: 'Юг', embedUrl: EMBED('Olekminsk_Yug') },
      { label: 'Север', embedUrl: EMBED('Olekminsk_Sever') },
    ],
  },
  'Покровск': {
    section: 'lena',
    items: [{ label: 'г. Покровск', embedUrl: EMBED('Pokrovsk') }],
  },
  'Верхний Бестях': {
    section: 'lena',
    items: [{ label: 'с. Верхний Бестях', embedUrl: EMBED('Bestyah') }],
  },
  'Якутск': {
    section: 'lena',
    items: [{ label: 'г. Якутск', ysiaOnly: true }],
  },
  'Жатай': {
    section: 'lena',
    items: [{ label: 'пгт Жатай', ysiaOnly: true }],
  },
  'Намцы': {
    section: 'lena',
    items: [{ label: 'Графский берег', embedUrl: EMBED('Grafskyi_Bereg') }],
  },
  'Сангар': {
    section: 'lena',
    items: [
      { label: 'Юг', embedUrl: EMBED('Sangary_Yug') },
      { label: 'Север', embedUrl: EMBED('Sangary_Sever') },
    ],
  },
  'Жиганск': {
    section: 'lena',
    items: [{ label: 'г. Жиганск', embedUrl: EMBED('Zhigansk') }],
  },
  'Хандыга': {
    section: 'aldan',
    items: [{ label: 'п. Хандыга', embedUrl: EMBED('Handyga') }],
  },
  'Усть-Мая': {
    section: 'aldan',
    items: [{ label: 'с. Усть-Мая', embedUrl: EMBED('Ust-Maya') }],
  },
  'Усть-Нера': {
    section: 'indi',
    items: [{ label: 'п. Усть-Нера', embedUrl: EMBED('Ust-Nera') }],
  },
  'Зырянка': {
    section: 'indi',
    items: [{ label: 'п. Зырянка', embedUrl: EMBED('Ziryanka') }],
  },
  'Среднеколымск': {
    section: 'kolyma',
    items: [{ label: 'г. Среднеколымск', embedUrl: EMBED('Srednekolymsk') }],
  },
  'Белая Гора': {
    section: 'kolyma',
    items: [{ label: 'с. Белая Гора', embedUrl: EMBED('belaya_gora_reka') }],
  },
  'Графский Берег': {
    section: 'lena',
    items: [{ label: 'Графский берег', embedUrl: EMBED('Grafskyi_Bereg') }],
  },
};
