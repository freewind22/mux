
export enum ClassType {
  DARK_KNIGHT = '剑士',
  DARK_WIZARD = '魔法师',
  FAIRY_ELF = '弓箭手'
}

export enum ItemType {
  WEAPON = '武器',
  HELMET = '头盔',
  ARMOR = '铠甲',
  PANTS = '护腿',
  BOOTS = '鞋子',
  GLOVES = '护手',
  NECKLACE = '项链',
  RING = '戒指',
  WING = '翅膀',
  JEWEL = '宝石'
}

export enum Rarity {
  WHITE = '普通',    // Common
  GREEN = '魔法',    // Uncommon
  BLUE = '卓越',     // Rare
  ORANGE = '史诗',   // Epic
  GOLD = '传说'      // Ancient/Legendary
}

export interface ItemOption {
  name: string;
  value: number;
  isPercent: boolean;
  type?: 'synthesis' | 'normal'; // Track if added via synthesis
}

export interface Item {
  id: string;
  name: string;
  type: ItemType;
  rarity: Rarity;
  level: number; // +0 to +15
  stats: {
    minDmg?: number;
    maxDmg?: number;
    defense?: number;
    reqStr?: number;
    reqAgi?: number;
  };
  options: ItemOption[]; // 1-5 attributes
  icon: string;
}

export interface Position {
  x: number;
  y: number;
}

export interface Entity extends Position {
  id: string;
  width: number;
  height: number;
}

export interface Monster extends Entity {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  minDmg: number;
  maxDmg: number;
  exp: number;
  image: string;
  lastAttack: number;
  isElite: boolean; 
  isBoss?: boolean; // New property for 1% boss chance
}

export interface Skill {
  id: string;
  name: string;
  damageMult: number;
  range: number;
  cooldown: number;
  manaCost: number;
  effectType: 'slash' | 'projectile' | 'nova' | 'buff';
  icon: string;
}

export interface Player extends Entity {
  name: string;
  class: ClassType;
  level: number;
  exp: number;
  nextLevelExp: number;
  points: number; 
  zen: number; 
  stats: {
    str: number;
    agi: number;
    vit: number;
    ene: number;
  };
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  inventory: Item[];
  equipment: {
    weapon: Item | null;
    helmet: Item | null;
    armor: Item | null;
    pants: Item | null;
    boots: Item | null;
    gloves: Item | null;
    necklace: Item | null;
    ring: Item | null;
    wings: Item | null;
  };
}

export interface LogEntry {
  id: string;
  message: string;
  type: 'info' | 'damage' | 'loot' | 'level' | 'error';
}
