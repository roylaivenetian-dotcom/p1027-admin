import type { MenuItem } from '../types'
import { DRINK_PRICE, MEAL_PRICE, SOUP_PRICE } from '../lib/pricing'

/** Seeded fixed menu — editable in Admin UI; also seedable to Firestore. */
export const SEED_MENU: MenuItem[] = [
  { id: 'meal-djqj', nameZh: '豉椒雞球飯', nameEn: 'Black bean chicken rice', category: 'meal', priceHkd: MEAL_PRICE, active: true },
  { id: 'meal-sjdpg', nameZh: '四季豆排骨飯', nameEn: 'Green bean spare rib rice', category: 'meal', priceHkd: MEAL_PRICE, active: true },
  { id: 'meal-wnf', nameZh: '汶腩飯', nameEn: 'Beef brisket rice', category: 'meal', priceHkd: MEAL_PRICE, aliases: ['牛腩飯'], active: true },
  { id: 'meal-jx', nameZh: '魚香茄子飯', nameEn: 'Fish-fragrant eggplant rice', category: 'meal', priceHkd: MEAL_PRICE, active: true },
  { id: 'meal-klj', nameZh: '咖喱雞飯', nameEn: 'Curry chicken rice', category: 'meal', priceHkd: MEAL_PRICE, active: true },
  { id: 'meal-xcr', nameZh: '鹹蛋肉餅飯', nameEn: 'Salted egg pork patty rice', category: 'meal', priceHkd: MEAL_PRICE, active: true },
  { id: 'meal-bcr', nameZh: '番茄牛腩飯', nameEn: 'Tomato brisket rice', category: 'meal', priceHkd: MEAL_PRICE, active: true },
  { id: 'meal-cjp', nameZh: '豉汁排骨飯', nameEn: 'Black bean spare rib rice', category: 'meal', priceHkd: MEAL_PRICE, active: true },
  { id: 'meal-gdr', nameZh: '豉油雞飯', nameEn: 'Soy sauce chicken rice', category: 'meal', priceHkd: MEAL_PRICE, active: true },
  { id: 'meal-mrp', nameZh: '麻婆豆腐飯', nameEn: 'Mapo tofu rice', category: 'meal', priceHkd: MEAL_PRICE, active: true },
  { id: 'meal-xsr', nameZh: '西炒飯', nameEn: 'Western fried rice', category: 'meal', priceHkd: MEAL_PRICE, active: true },
  { id: 'meal-hcr', nameZh: '海南雞飯', nameEn: 'Hainanese chicken rice', category: 'meal', priceHkd: MEAL_PRICE, active: true },
  { id: 'soup-default', nameZh: '湯', nameEn: 'Soup', category: 'soup', priceHkd: SOUP_PRICE, active: true },
  { id: 'drink-hlt', nameZh: '凍檸茶', nameEn: 'Iced lemon tea', category: 'drink', priceHkd: DRINK_PRICE, active: true },
  { id: 'drink-kaf', nameZh: '咖啡', nameEn: 'Coffee', category: 'drink', priceHkd: DRINK_PRICE, active: true },
  { id: 'drink-cola', nameZh: '可樂', nameEn: 'Cola', category: 'drink', priceHkd: DRINK_PRICE, active: true },
  { id: 'drink-lm', nameZh: '檸檬水', nameEn: 'Lemon water', category: 'drink', priceHkd: DRINK_PRICE, active: true },
]
