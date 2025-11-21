import { ClassType, Monster, Item, ItemType, Rarity, Skill } from './types';

export const SAFE_ZONE_WIDTH = 300;
export const SAFE_ZONE_HEIGHT = 300;

// Expanded World Size
export const WORLD_WIDTH = 4000;
export const WORLD_HEIGHT = 4000;

// New Central Town Config for Lorencia (Centered in 4000x4000 world)
export const TOWN_CENTER_X = 2000;
export const TOWN_CENTER_Y = 2000;
export const TOWN_WIDTH = 400;
export const TOWN_HEIGHT = 350;

// Stats now reflect: Str, Agi, Vit, Int (Energy mapped to Int)
export const INITIAL_STATS = {
  [ClassType.DARK_KNIGHT]: { str: 28, agi: 20, vit: 25, ene: 10, hp: 110, mana: 20 },
  [ClassType.DARK_WIZARD]: { str: 18, agi: 18, vit: 15, ene: 30, hp: 80, mana: 60 },
  [ClassType.FAIRY_ELF]: { str: 22, agi: 25, vit: 20, ene: 15, hp: 90, mana: 40 },
};

export const SKILLS: Record<ClassType, Skill[]> = {
  [ClassType.DARK_KNIGHT]: [
    { id: 'dk1', name: '升龙击', damageMult: 1.2, range: 80, cooldown: 1000, manaCost: 2, effectType: 'slash', icon: '⚔️' },
    { id: 'dk2', name: '旋风斩', damageMult: 0.8, range: 150, cooldown: 1500, manaCost: 10, effectType: 'nova', icon: '🌪️' },
    { id: 'dk3', name: '雷霆裂闪', damageMult: 2.0, range: 80, cooldown: 4000, manaCost: 15, effectType: 'slash', icon: '💢' },
  ],
  [ClassType.DARK_WIZARD]: [
    { id: 'dw1', name: '能量球', damageMult: 1.0, range: 300, cooldown: 800, manaCost: 3, effectType: 'projectile', icon: '🔮' },
    { id: 'dw2', name: '黑龙波', damageMult: 0.6, range: 400, cooldown: 1500, manaCost: 15, effectType: 'nova', icon: '👻' },
    { id: 'dw3', name: '地狱火', damageMult: 2.5, range: 100, cooldown: 6000, manaCost: 40, effectType: 'nova', icon: '🔥' },
  ],
  [ClassType.FAIRY_ELF]: [
    { id: 'fe1', name: '多重箭', damageMult: 1.1, range: 350, cooldown: 800, manaCost: 5, effectType: 'projectile', icon: '🏹' },
    { id: 'fe2', name: '穿透箭', damageMult: 1.5, range: 400, cooldown: 2000, manaCost: 10, effectType: 'projectile', icon: '🎯' },
    { id: 'fe3', name: '天堂之箭', damageMult: 0.8, range: 300, cooldown: 2500, manaCost: 15, effectType: 'nova', icon: '✨' },
  ],
};

export const RARITY_COLORS = {
  [Rarity.WHITE]: 'text-gray-200 border-gray-500',
  [Rarity.GREEN]: 'text-green-400 border-green-500 shadow-[0_0_5px_#4ade80]',
  [Rarity.BLUE]: 'text-blue-400 border-blue-500 shadow-[0_0_8px_#60a5fa]',
  [Rarity.ORANGE]: 'text-orange-400 border-orange-500 shadow-[0_0_10px_#fb923c]',
  [Rarity.GOLD]: 'text-yellow-300 border-yellow-400 shadow-[0_0_15px_#facc15] animate-pulse',
};

// Pool for White/Green items mainly, but can appear on others
export const ITEM_OPTIONS_POOL = [
  { name: '追加伤害', min: 4, max: 12, isPercent: false },
  { name: '防御力', min: 2, max: 8, isPercent: false },
  { name: '体力增加', min: 5, max: 15, isPercent: false }, // Flat HP
];

// Excellent Options (Blue/Orange/Gold)
export const EXCELLENT_OPTIONS_POOL = [
  { name: '幸运一击', min: 5, max: 20, isPercent: true }, // 5-20% Chance
  { name: '卓越一击', min: 8, max: 25, isPercent: true }, // 8-25% Chance
  { name: '击杀回蓝', min: 1, max: 5, isPercent: false }, // 1-5 Mana per kill
  { name: '击杀回血', min: 2, max: 10, isPercent: false }, // 2-10 HP per kill
  { name: '攻击增加', min: 2, max: 5, isPercent: true }, // +% Dmg
  { name: '无视防御', min: 3, max: 8, isPercent: true },
];

// Increased inventory: 8 cols x 10 rows = 80 items
export const INVENTORY_PAGE_SIZE = 80;
export const MAX_INVENTORY_PAGES = 3;
export const MAX_INVENTORY_SIZE = INVENTORY_PAGE_SIZE * MAX_INVENTORY_PAGES;

export const MONSTERS_DB: Omit<Monster, 'id' | 'hp' | 'x' | 'y' | 'width' | 'height' | 'lastAttack' | 'isElite' | 'originX' | 'originY'>[] = [
  { name: '蜘蛛', level: 1, maxHp: 30, minDmg: 1, maxDmg: 3, exp: 15, image: '🕷️' },
  { name: '猎犬怪', level: 5, maxHp: 80, minDmg: 5, maxDmg: 10, exp: 35, image: '🐕' },
  { name: '蛮牛怪', level: 10, maxHp: 160, minDmg: 12, maxDmg: 20, exp: 80, image: '🐂' },
  { name: '骷髅兵', level: 15, maxHp: 250, minDmg: 20, maxDmg: 35, exp: 150, image: '💀' },
  { name: '巨人', level: 25, maxHp: 800, minDmg: 50, maxDmg: 70, exp: 450, image: '👹' },
  { name: '死神戈登', level: 40, maxHp: 2000, minDmg: 80, maxDmg: 120, exp: 1000, image: '👿' },
  { name: '黄金火龙王', level: 60, maxHp: 8000, minDmg: 150, maxDmg: 300, exp: 3000, image: '🐲' },
];

export const ITEMS_DB: Omit<Item, 'id' | 'level' | 'rarity' | 'options'>[] = [
  // Weapons
  { name: '短剑', type: ItemType.WEAPON, stats: { minDmg: 6, maxDmg: 11 }, icon: '🗡️' },
  { name: '石中剑', type: ItemType.WEAPON, stats: { minDmg: 10, maxDmg: 16 }, icon: '⚔️' },
  { name: '传说之杖', type: ItemType.WEAPON, stats: { minDmg: 30, maxDmg: 50 }, icon: '🪄' },
  { name: '精灵之弓', type: ItemType.WEAPON, stats: { minDmg: 20, maxDmg: 35 }, icon: '🏹' },
  { name: '屠龙刀', type: ItemType.WEAPON, stats: { minDmg: 50, maxDmg: 80 }, icon: '🔪' },
  { name: '大天使之剑', type: ItemType.WEAPON, stats: { minDmg: 80, maxDmg: 120 }, icon: '🔱' },
  
  // Armors
  { name: '皮甲', type: ItemType.ARMOR, stats: { defense: 5 }, icon: '👕' },
  { name: '龙王铠', type: ItemType.ARMOR, stats: { defense: 25 }, icon: '🛡️' },
  { name: '传说铠', type: ItemType.ARMOR, stats: { defense: 18 }, icon: '👘' },
  { name: '黑龙王铠', type: ItemType.ARMOR, stats: { defense: 40 }, icon: '🧛' },
  
  // Helmets
  { name: '皮盔', type: ItemType.HELMET, stats: { defense: 3 }, icon: '🧢' },
  { name: '龙王盔', type: ItemType.HELMET, stats: { defense: 15 }, icon: '⛑️' },
  { name: '传说盔', type: ItemType.HELMET, stats: { defense: 10 }, icon: '👳' },

  // Pants
  { name: '皮护腿', type: ItemType.PANTS, stats: { defense: 4 }, icon: '👖' },
  { name: '龙王护腿', type: ItemType.PANTS, stats: { defense: 18 }, icon: '🩳' },
  
  // Boots
  { name: '皮靴', type: ItemType.BOOTS, stats: { defense: 2 }, icon: '👢' },
  { name: '龙王靴', type: ItemType.BOOTS, stats: { defense: 12 }, icon: '👞' },
  
  // Gloves
  { name: '皮护手', type: ItemType.GLOVES, stats: { defense: 2, reqStr: 0 }, icon: '🧤' },
  { name: '龙王护手', type: ItemType.GLOVES, stats: { defense: 10 }, icon: '🥊' },

  // Accessories
  { name: '雷之项链', type: ItemType.NECKLACE, stats: { minDmg: 5 }, icon: '📿' },
  { name: '冰之戒指', type: ItemType.RING, stats: { defense: 5 }, icon: '💍' },
  { name: '卓越戒指', type: ItemType.RING, stats: { defense: 10, minDmg: 5 }, icon: '💍' },

  // Wings
  { name: '恶魔之翼', type: ItemType.WING, stats: { defense: 30, minDmg: 10 }, icon: '🦇' },
  { name: '天使之翼', type: ItemType.WING, stats: { defense: 25, minDmg: 5 }, icon: '🕊️' },
  
  // Jewels
  { name: '祝福宝石', type: ItemType.JEWEL, stats: {}, icon: '💎' },
  { name: '灵魂宝石', type: ItemType.JEWEL, stats: {}, icon: '🔮' },
  { name: '玛雅之石', type: ItemType.JEWEL, stats: {}, icon: '💠' },
];

export const MAPS = [
  { name: '勇者大陆', minLvl: 1, bg: 'bg-[#1c1917]' },
  { name: '仙踪林', minLvl: 10, bg: 'bg-[#064e3b]' },
  { name: '冰风谷', minLvl: 20, bg: 'bg-[#1e293b]' },
  { name: '地下城', minLvl: 40, bg: 'bg-[#2e1065]' },
  { name: '失落之塔', minLvl: 60, bg: 'bg-[#450a0a]' },
  { name: '天空之城', minLvl: 80, bg: 'bg-[#0c4a6e]' },
];