
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import GameHUD from './components/GameHUD';
import NPCInteraction from './components/NPCInteraction';
import { DraggableWindow } from './components/DraggableWindow';
import { INITIAL_STATS, MONSTERS_DB, ITEMS_DB, MAPS, SKILLS, RARITY_COLORS, ITEM_OPTIONS_POOL, EXCELLENT_OPTIONS_POOL, SAFE_ZONE_WIDTH, SAFE_ZONE_HEIGHT, INVENTORY_PAGE_SIZE, MAX_INVENTORY_PAGES, MAX_INVENTORY_SIZE, TOWN_CENTER_X, TOWN_CENTER_Y, TOWN_WIDTH, TOWN_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT } from './constants';
import { Player, ClassType, Monster, Item, LogEntry, Rarity, ItemType, Position, ItemOption, Skill } from './types';

const PLAYER_SIZE = 40;
const MONSTER_SIZE = 40;
const ITEM_SIZE = 30;
const SPEED = 5;

// AI Constants
const AGGRO_RANGE = 220; // Reduced from 300 for smaller activity range
const LEASH_RANGE = 350; // Reduced from 500 for smaller activity range
const GRID_SIZE = 400; // Size of a "Zone"

// --- Stat Helper (Level Scaling) ---
// Returns the value increased by 10% per level
const getScaledStat = (baseVal: number | undefined, level: number) => {
    if (!baseVal) return 0;
    return Math.ceil(baseVal * (1 + level * 0.1));
};

// --- Audio Helper ---
const playDropSound = () => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1500, ctx.currentTime); 
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.2);
        
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
        console.error("Audio error", e);
    }
};

// --- Helper: Loot Generation ---

const generateLoot = (monsterLevel: number, isElite: boolean, minRarity?: Rarity): Item | null => {
  let dropChance = 0.4;
  if (isElite) dropChance = 0.8;
  if (minRarity) dropChance = 1.0; 

  const dropRoll = Math.random();
  if (dropRoll > dropChance) return null;

  const rand = Math.random() * 100;
  let rarity = Rarity.WHITE;
  let optionCount = 1;
  let isJewel = false;

  if (Math.random() < 0.1) {
      isJewel = true;
      rarity = Rarity.BLUE; 
  } else {
      if (rand < 3 || minRarity === Rarity.GOLD) { rarity = Rarity.GOLD; optionCount = 5; }
      else if (rand < 10 || minRarity === Rarity.ORANGE) { rarity = Rarity.ORANGE; optionCount = 4; }
      else if (rand < 20 || minRarity === Rarity.BLUE) { rarity = Rarity.BLUE; optionCount = 3; }
      else if (rand < 50 && !minRarity) { rarity = Rarity.GREEN; optionCount = 2; }
      else { rarity = Rarity.WHITE; optionCount = 1; }
  }
  
  if (minRarity && rarity !== Rarity.GOLD && rarity !== Rarity.ORANGE && rarity !== Rarity.BLUE) {
      rarity = minRarity;
      optionCount = 3;
  }

  let baseItem: any;
  if (isJewel) {
     const jewels = ITEMS_DB.filter(i => i.type === ItemType.JEWEL);
     baseItem = jewels[Math.floor(Math.random() * jewels.length)];
  } else {
     const gear = ITEMS_DB.filter(i => i.type !== ItemType.JEWEL);
     baseItem = gear[Math.floor(Math.random() * gear.length)];
  }

  const generatedOptions: ItemOption[] = [];
  const isHighTier = rarity === Rarity.BLUE || rarity === Rarity.ORANGE || rarity === Rarity.GOLD;
  const pool = isHighTier ? [...ITEM_OPTIONS_POOL, ...EXCELLENT_OPTIONS_POOL] : ITEM_OPTIONS_POOL;

  if (!isJewel) {
    for (let i = 0; i < optionCount; i++) {
        const optTemplate = pool[Math.floor(Math.random() * pool.length)];
        if (generatedOptions.find(o => o.name === optTemplate.name)) {
            i--; continue;
        }
        const val = Math.floor(Math.random() * (optTemplate.max - optTemplate.min + 1)) + optTemplate.min;
        generatedOptions.push({ name: optTemplate.name, value: val, isPercent: optTemplate.isPercent, type: 'normal' });
    }
  }

  const rarityName = rarity === Rarity.GOLD ? '(传说)' : rarity === Rarity.ORANGE ? '(史诗)' : rarity === Rarity.BLUE ? '(卓越)' : rarity === Rarity.GREEN ? '(魔法)' : '';
  
  let itemLevel = 0;
  if (rarity === Rarity.GOLD) {
      itemLevel = 0; 
  } else if (!isJewel) {
      const maxDropLvl = Math.min(15, Math.floor(monsterLevel / 5)); 
      itemLevel = Math.floor(Math.random() * (maxDropLvl + 1));
  }

  return {
    ...baseItem,
    name: `${baseItem.name} ${rarityName}`,
    id: Math.random().toString(36).substr(2, 9),
    rarity,
    level: itemLevel,
    options: generatedOptions
  };
};

const calculateStats = (player: Player) => {
  const str = player.stats.str;
  const agi = player.stats.agi;
  const int = player.stats.ene; 
  const vit = player.stats.vit; 

  const statMinDmg = str + agi + int;
  const statMaxDmg = str + agi + int;
  const statDef = Math.floor(agi * 0.1);
  const statHp = str;
  const statMana = int;
  
  const statHpRegen = str * 0.1;
  const statManaRegen = int * 0.1;
  
  const cdReductionMs = agi * 100; 

  let equipMin = 0;
  let equipMax = 0;
  let equipDef = 0;
  
  let percentDmg = 0;
  let luckyRate = 0; 
  let excellentRate = 0;
  let killHp = 0;
  let killMana = 0;
  let ignoreDef = 0;

  const eq = player.equipment;
  const items = [eq.weapon, eq.helmet, eq.armor, eq.pants, eq.boots, eq.gloves, eq.necklace, eq.ring, eq.wings];

  items.forEach(item => {
    if (!item) return;
    
    // Apply Level Scaling (10% per level)
    const scaledMin = getScaledStat(item.stats.minDmg, item.level);
    const scaledMax = getScaledStat(item.stats.maxDmg, item.level);
    const scaledDef = getScaledStat(item.stats.defense, item.level);

    equipMin += scaledMin;
    equipMax += scaledMax;
    equipDef += scaledDef;

    item.options.forEach(opt => {
        if (opt.name === '追加伤害') { equipMin += opt.value; equipMax += opt.value; }
        if (opt.name === '防御力') equipDef += opt.value;
        if (opt.name === '攻击增加') percentDmg += opt.value;
        if (opt.name === '幸运一击') luckyRate += opt.value;
        if (opt.name === '卓越一击') excellentRate += opt.value;
        if (opt.name === '击杀回血') killHp += opt.value;
        if (opt.name === '击杀回蓝') killMana += opt.value;
        if (opt.name === '无视防御') ignoreDef += opt.value;
    });
  });

  const finalMin = (statMinDmg + equipMin) * (1 + percentDmg / 100);
  const finalMax = (statMaxDmg + equipMax) * (1 + percentDmg / 100);

  return {
    minDmg: Math.floor(finalMin),
    maxDmg: Math.floor(finalMax),
    defense: statDef + equipDef,
    luckyRate,
    excellentRate,
    killHp,
    killMana,
    hpRegen: statHpRegen,
    manaRegen: statManaRegen,
    cdReductionMs,
    bonusHp: statHp,
    bonusMana: statMana
  };
};

// --- Helper: Map Generation ---
interface MapDecoration {
  id: string;
  type: 'tree' | 'stone' | 'river' | 'grass' | 'snow' | 'lava' | 'cloud' | 'wall' | 'pavement' | 'roof' | 'fountain' | 'sand' | 'crystal';
  x: number;
  y: number;
  w: number;
  h: number;
  style?: React.CSSProperties;
}

const generateMapDecorations = (mapId: number): MapDecoration[] => {
  const decorations: MapDecoration[] = [];
  const cx = TOWN_CENTER_X;
  const cy = TOWN_CENTER_Y;
  
  // Lorencia Special Layout (Map 0)
  if (mapId === 0) {
      const tw = TOWN_WIDTH;
      const th = TOWN_HEIGHT;
      const wallThick = 20;
      const bridgeW = 80;
      const bridgeH = 80;
      const gap = 80; // Gap for gates

      // 1. The Moat
      decorations.push({ id: 'moat-t', type: 'river', x: cx - tw/2 - 60, y: cy - th/2 - 60, w: tw + 120, h: 50 });
      decorations.push({ id: 'moat-b', type: 'river', x: cx - tw/2 - 60, y: cy + th/2 + 10, w: tw + 120, h: 50 });
      decorations.push({ id: 'moat-l', type: 'river', x: cx - tw/2 - 60, y: cy - th/2 - 10, w: 50, h: th + 20 });
      decorations.push({ id: 'moat-r', type: 'river', x: cx + tw/2 + 10, y: cy - th/2 - 10, w: 50, h: th + 20 });

      // 2. Bridges
      decorations.push({ id: 'bridge-w', type: 'pavement', x: cx - tw/2 - 65, y: cy - bridgeH/2, w: 80, h: bridgeH, style: { zIndex: 1 } });
      decorations.push({ id: 'bridge-e', type: 'pavement', x: cx + tw/2 - 15, y: cy - bridgeH/2, w: 80, h: bridgeH, style: { zIndex: 1 } });
      decorations.push({ id: 'bridge-n', type: 'pavement', x: cx - bridgeW/2, y: cy - th/2 - 65, w: bridgeW, h: 80, style: { zIndex: 1 } });
      decorations.push({ id: 'bridge-s', type: 'pavement', x: cx - bridgeW/2, y: cy + th/2 - 15, w: bridgeW, h: 80, style: { zIndex: 1 } });

      // 3. Floor
      decorations.push({ id: 'plaza-floor', type: 'pavement', x: cx - tw/2, y: cy - th/2, w: tw, h: th });

      // 4. Walls
      decorations.push({ id: 'wall-t-l', type: 'wall', x: cx - tw/2, y: cy - th/2, w: tw/2 - gap/2, h: wallThick });
      decorations.push({ id: 'wall-t-r', type: 'wall', x: cx + gap/2, y: cy - th/2, w: tw/2 - gap/2, h: wallThick });
      decorations.push({ id: 'wall-b-l', type: 'wall', x: cx - tw/2, y: cy + th/2 - wallThick, w: tw/2 - gap/2, h: wallThick });
      decorations.push({ id: 'wall-b-r', type: 'wall', x: cx + gap/2, y: cy + th/2 - wallThick, w: tw/2 - gap/2, h: wallThick });
      decorations.push({ id: 'wall-l-t', type: 'wall', x: cx - tw/2, y: cy - th/2, w: wallThick, h: th/2 - gap/2 });
      decorations.push({ id: 'wall-l-b', type: 'wall', x: cx - tw/2, y: cy + gap/2, w: wallThick, h: th/2 - gap/2 });
      decorations.push({ id: 'wall-r-t', type: 'wall', x: cx + tw/2 - wallThick, y: cy - th/2, w: wallThick, h: th/2 - gap/2 });
      decorations.push({ id: 'wall-r-b', type: 'wall', x: cx + tw/2 - wallThick, y: cy + gap/2, w: wallThick, h: th/2 - gap/2 });

      // 5. Buildings
      decorations.push({ id: 'building-bar', type: 'roof', x: cx - tw/2 + 30, y: cy - th/2 + 30, w: 120, h: 80 });
      decorations.push({ id: 'building-bar-sign', type: 'stone', x: cx - tw/2 + 80, y: cy - th/2 + 110, w: 20, h: 20 });
      decorations.push({ id: 'building-vault', type: 'roof', x: cx + tw/2 - 140, y: cy - th/2 + 30, w: 100, h: 100 });
      
      // 6. Fountain
      decorations.push({ id: 'fountain-base', type: 'stone', x: cx - 30, y: cy - 30, w: 60, h: 60, style: { borderRadius: '50%' } });
      decorations.push({ id: 'fountain-water', type: 'fountain', x: cx - 20, y: cy - 20, w: 40, h: 40 });

      // 7. Trees (Outside)
      for (let i=0; i<200; i++) {
          const tx = Math.random() * WORLD_WIDTH;
          const ty = Math.random() * WORLD_HEIGHT;
          if (tx > cx - tw/2 - 150 && tx < cx + tw/2 + 150 && ty > cy - th/2 - 150 && ty < cy + th/2 + 150) continue;
          decorations.push({ id: `tree-${i}`, type: 'tree', x: tx, y: ty, w: 60, h: 80 });
      }
      return decorations;
  }

  // Noria Special Layout (Map 1)
  if (mapId === 1) {
      // Central Crystal & Plaza
      decorations.push({ id: 'noria-crystal', type: 'crystal', x: cx - 30, y: cy - 30, w: 60, h: 60 });
      decorations.push({ 
          id: 'noria-plaza', 
          type: 'sand', 
          x: cx - 350, y: cy - 350, w: 700, h: 700, 
          style: { borderRadius: '50%', zIndex: 0 } 
      });

      // Radiating Paths (Sand)
      // 1. East Exit
      decorations.push({ id: 'path-e', type: 'sand', x: cx + 200, y: cy - 60, w: 1800, h: 120 });
      // 2. West (curving)
      decorations.push({ id: 'path-w', type: 'sand', x: cx - 2000, y: cy - 60, w: 1800, h: 120 });
      // 3. North East (Rotated)
      decorations.push({ id: 'path-ne', type: 'sand', x: cx, y: cy - 60, w: 1500, h: 120, style: { transform: 'rotate(-45deg)', transformOrigin: '0 50%' } });
      // 4. South East (Rotated)
      decorations.push({ id: 'path-se', type: 'sand', x: cx, y: cy - 60, w: 1500, h: 120, style: { transform: 'rotate(45deg)', transformOrigin: '0 50%' } });

      // Dense Forest
      for (let i=0; i<600; i++) {
          const tx = Math.random() * WORLD_WIDTH;
          const ty = Math.random() * WORLD_HEIGHT;
          
          // Distance check from center (Safe Zone)
          const dx = tx - cx;
          const dy = ty - cy;
          const dist = Math.sqrt(dx*dx + dy*dy);
          
          if (dist < 380) continue; // Leave plaza clear

          // Keep paths clear (Rough approximation)
          if (Math.abs(ty - cy) < 80 && tx > cx) continue; // East
          if (Math.abs(ty - cy) < 80 && tx < cx) continue; // West
          
          // Diagonals (approximate check)
          const relX = tx - cx;
          const relY = ty - cy;
          // NE Band
          if (relX > 0 && relY < 0 && Math.abs(relX + relY) < 100) continue;
          // SE Band
          if (relX > 0 && relY > 0 && Math.abs(relX - relY) < 100) continue;

          decorations.push({ id: `noria-tree-${i}`, type: 'tree', x: tx, y: ty, w: 60, h: 80 });
      }

      // Some random magical stones
      for (let i=0; i<50; i++) {
         const sx = Math.random() * WORLD_WIDTH;
         const sy = Math.random() * WORLD_HEIGHT;
         if (Math.sqrt(Math.pow(sx-cx,2) + Math.pow(sy-cy,2)) < 400) continue;
         decorations.push({ id: `magic-stone-${i}`, type: 'stone', x: sx, y: sy, w: 30, h: 30, style: { filter: 'hue-rotate(90deg)' } });
      }
      
      return decorations;
  }

  // Other Maps
  for (let i = 0; i < WORLD_WIDTH; i += 40) {
    if (i > SAFE_ZONE_WIDTH + 100) { 
        const riverY = (WORLD_HEIGHT / 2) + Math.sin(i / 200) * 300;
        decorations.push({
            id: `fluid-${i}`, 
            type: mapId === 4 ? 'lava' : 'river', 
            x: i, 
            y: riverY, 
            w: 50, 
            h: 50
        });
    }
  }

  const numObjects = 300; // Increased density
  for (let i = 0; i < numObjects; i++) {
    const x = Math.random() * WORLD_WIDTH;
    const y = Math.random() * WORLD_HEIGHT;
    // Safe zone check for generic maps
    if (mapId !== 0 && mapId !== 1 && x < SAFE_ZONE_WIDTH && y < SAFE_ZONE_HEIGHT) continue;

    let type: MapDecoration['type'] = 'tree';
    if (mapId === 2) type = Math.random() > 0.5 ? 'snow' : 'stone';
    else if (mapId === 4) type = 'stone';
    else if (mapId === 5) type = 'cloud';
    else type = Math.random() > 0.6 ? 'stone' : 'tree';

    decorations.push({
        id: `dec-${i}`,
        type,
        x, y,
        w: type === 'stone' ? 30 : type === 'cloud' ? 80 : 60,
        h: type === 'stone' ? 30 : type === 'cloud' ? 40 : 80,
        style: { opacity: 0.9 }
    });
  }
  
  // Ground details
  for (let i=0; i < 400; i++) {
     const x = Math.random() * WORLD_WIDTH;
    const y = Math.random() * WORLD_HEIGHT;
    decorations.push({
        id: `ground-${i}`, type: 'grass', x, y, w: 20, h: 20
    });
  }

  return decorations;
};

// --- Components ---
const CharacterSelect = ({ onSelect, onLoad }: { onSelect: (c: ClassType, n: string) => void, onLoad: () => void }) => {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<ClassType>(ClassType.DARK_KNIGHT);
  const [hasSave, setHasSave] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('mu_save_v1');
    if (saved) setHasSave(true);
  }, []);

  return (
    <div className="h-screen w-full bg-black flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('https://picsum.photos/seed/mu_login/1920/1080')] bg-cover opacity-30"></div>
      <div className="z-10 bg-black/80 p-8 border-2 border-amber-800 rounded-lg shadow-[0_0_50px_rgba(180,83,9,0.3)] max-w-2xl w-full text-center">
        <h1 className="text-5xl font-bold text-amber-500 mb-2 mu-font drop-shadow-lg">MU ONLINE</h1>
        <h2 className="text-xl text-gray-400 mb-8 tracking-widest">传奇再续 - 网页版</h2>
        
        <div className="grid grid-cols-3 gap-4 mb-8">
          {Object.values(ClassType).map((c) => (
            <button 
              key={c}
              onClick={() => setSelected(c)}
              className={`p-4 border-2 transition-all duration-300 transform hover:-translate-y-1 ${selected === c ? 'border-amber-500 bg-amber-900/30 scale-105' : 'border-gray-700 bg-gray-900/50 grayscale hover:grayscale-0'}`}
            >
              <div className="text-4xl mb-2">{c === ClassType.DARK_KNIGHT ? '⚔️' : c === ClassType.DARK_WIZARD ? '🪄' : '🏹'}</div>
              <div className="font-bold text-gray-200 text-sm">{c}</div>
            </button>
          ))}
        </div>

        <input 
          type="text" 
          placeholder="输入角色名称" 
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full bg-black border border-amber-700 text-amber-100 p-3 text-center mb-6 outline-none focus:ring-2 focus:ring-amber-500 text-lg"
          maxLength={10}
        />

        <div className="flex gap-4">
            <button 
            onClick={() => name && onSelect(selected, name)}
            className={`flex-1 py-3 font-bold text-lg tracking-widest border-2 ${name ? 'border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-black' : 'border-gray-700 text-gray-700 cursor-not-allowed'} transition-colors`}
            >
            开始冒险
            </button>
            
            {hasSave && (
                <button 
                onClick={onLoad}
                className="flex-1 py-3 font-bold text-lg tracking-widest border-2 border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white transition-colors"
                >
                读取存档
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

const PlayerAvatar = ({ player, isAttacking }: { player: Player, isAttacking: boolean }) => {
  const isKnight = player.class === ClassType.DARK_KNIGHT;
  const isWizard = player.class === ClassType.DARK_WIZARD;
  const headColor = isKnight ? 'bg-orange-200' : isWizard ? 'bg-blue-200' : 'bg-yellow-100';
  const bodyColor = isKnight ? 'bg-red-800' : isWizard ? 'bg-blue-800' : 'bg-green-700';
  const weaponIcon = player.equipment.weapon ? player.equipment.weapon.icon : (isKnight ? '🗡️' : isWizard ? '🪄' : '🏹');

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center">
       {player.equipment.wings && (
          <div className="absolute -top-4 -z-10 text-5xl opacity-90 animate-pulse scale-150">
             {player.equipment.wings.icon}
          </div>
       )}
       <div className={`w-4 h-4 rounded-full ${headColor} border border-black z-20 relative`}>
         {player.equipment.helmet && <div className="absolute -top-1 -left-1 w-6 h-6 text-center">{player.equipment.helmet.icon}</div>}
       </div>
       <div className={`w-6 h-6 rounded-sm ${bodyColor} border border-black z-10 flex items-center justify-center relative`}>
          {player.equipment.armor && <span className="text-[10px] absolute">🛡️</span>}
          <div className={`absolute -right-2 top-0 origin-bottom-left transition-transform ${isAttacking ? 'anim-swing' : ''}`}>
             <div className="text-xl filter drop-shadow-md" style={{ transform: 'rotate(45deg)' }}>
               {weaponIcon}
             </div>
          </div>
       </div>
       <div className="flex gap-1 mt-[-2px] z-0">
          <div className="w-2 h-3 bg-gray-800 rounded-b"></div>
          <div className="w-2 h-3 bg-gray-800 rounded-b"></div>
       </div>
    </div>
  );
};

const ItemTooltip = ({ item, comparisonItem, x, y, location }: { item: Item, comparisonItem: Item | null, x: number, y: number, location: string }) => {
    const renderStatRow = (label: string, baseVal: number | undefined, level: number, compBaseVal: number | undefined, compLevel: number, colorClass: string = 'text-white') => {
        if (!baseVal) return null;
        const currentVal = getScaledStat(baseVal, level);
        const compVal = compBaseVal ? getScaledStat(compBaseVal, compLevel) : 0;
        const bonus = currentVal - baseVal;
        const diff = comparisonItem ? currentVal - compVal : 0;

        return (
            <div className={`text-xs ${colorClass} flex justify-between items-center gap-4`}>
                <div className="flex items-center gap-1">
                    <span className="text-gray-400">{label}:</span>
                    <span className="font-bold">{currentVal}</span>
                    {level > 0 && bonus > 0 && (
                        <span className="text-[9px] text-gray-500">
                            ({baseVal}<span className="text-green-700">+{bonus}</span>)
                        </span>
                    )}
                </div>
                {comparisonItem && diff !== 0 && (
                    <span className={diff > 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                        {diff > 0 ? '+' : ''}{diff}
                    </span>
                )}
            </div>
        );
    };

    const renderCard = (itm: Item, title: string, isComparison: boolean = false) => {
        const compForDiff = isComparison ? null : comparisonItem;
        return (
            <div className="bg-black/95 border-2 border-amber-700 p-2 w-64 shadow-[0_0_15px_rgba(0,0,0,1)] relative z-[100] pointer-events-none rounded">
                <div className="absolute -top-3 left-2 bg-black px-1 text-[10px] text-gray-500 border border-gray-800">{title}</div>
                <div className={`font-bold text-sm ${RARITY_COLORS[itm.rarity].split(' ')[0]}`}>{itm.name} {itm.level > 0 ? `+${itm.level}` : ''}</div>
                <div className="text-[10px] text-gray-500 italic mb-2 flex justify-between">
                    <span>{itm.type}</span>
                    <span>{itm.rarity}</span>
                </div>
                
                <div className="space-y-0.5">
                    {renderStatRow("攻击力", itm.stats.minDmg, itm.level, compForDiff?.stats.minDmg, compForDiff?.level || 0)}
                    {renderStatRow("防御力", itm.stats.defense, itm.level, compForDiff?.stats.defense, compForDiff?.level || 0)}
                    {itm.stats.reqStr && <div className="text-[10px] text-red-300 mt-1">需要力量: {itm.stats.reqStr}</div>}
                </div>
                
                {itm.options.length > 0 && <div className="mt-2 pt-1 border-t border-gray-700 space-y-0.5">
                    {itm.options.filter(o => o.type !== 'synthesis').map((opt, idx) => (
                        <div key={idx} className={`text-[10px] ${EXCELLENT_OPTIONS_POOL.find(e=>e.name===opt.name) ? 'text-blue-300 font-bold' : 'text-gray-300'}`}>
                            {opt.name}: +{opt.value}{opt.isPercent ? '%' : ''}
                        </div>
                    ))}
                    {itm.options.filter(o => o.type === 'synthesis').map((opt, idx) => (
                        <div key={`syn-${idx}`} className="text-[10px] text-pink-400 font-bold flex items-center gap-1 animate-pulse bg-pink-900/20 px-1 rounded mt-1">
                            <span>(合成) {opt.name}: +{opt.value}{opt.isPercent ? '%' : ''}</span>
                        </div>
                    ))}
                </div>}
            </div>
        );
    };

    return (
        <div className="fixed z-[100] pointer-events-none flex gap-2 items-start" style={{ left: Math.min(window.innerWidth - 550, x + 15), top: Math.min(window.innerHeight - 300, y + 15) }}>
            {comparisonItem && renderCard(comparisonItem, "已装备", true)}
            {renderCard(item, location === 'INVENTORY' ? '背包中' : location === 'EQUIPPED' ? '已装备' : location === 'NPC' ? '商店' : '详情')}
        </div>
    );
};

export default function App() {
  const [gameState, setGameState] = useState<'SELECT' | 'PLAYING'>('SELECT');
  const [player, setPlayer] = useState<Player | null>(null);
  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [respawnQueue, setRespawnQueue] = useState<Omit<Monster, 'id' | 'respawnTime'> & { respawnTime: number }[]>([]);
  const [groundItems, setGroundItems] = useState<(Item & Position)[]>([]);
  const [activeMap, setActiveMap] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [floatingTexts, setFloatingTexts] = useState<{id: number, x: number, y: number, text: string, color: string}[]>([]);
  const [keysPressed, setKeysPressed] = useState<Set<string>>(new Set());
  const [lastSkillTime, setLastSkillTime] = useState<Record<string, number>>({});
  const [inventoryPage, setInventoryPage] = useState(0);
  const [hoveredItem, setHoveredItem] = useState<{item: Item, x: number, y: number, location: string} | null>(null);
  const [isAttacking, setIsAttacking] = useState(false);
  const [mapDecorations, setMapDecorations] = useState<MapDecoration[]>([]);
  
  // Camera and Zoom State
  const [cameraOffset, setCameraOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDraggingMap, setIsDraggingMap] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const logEndRef = useRef<HTMLDivElement>(null);

  const playerStats = useMemo(() => {
    if (!player) return { minDmg: 0, maxDmg: 0, defense: 0, luckyRate: 0, excellentRate: 0, hpRec: 0, manaRec: 0, ignoreDef: 0, killHp: 0, killMana: 0, hpRegen: 0, manaRegen: 0, cdReductionMs: 0, bonusHp: 0, bonusMana: 0 };
    return calculateStats(player);
  }, [player]);

  useEffect(() => {
    setMapDecorations(generateMapDecorations(activeMap));
  }, [activeMap]);

  // Map Specific Safe Zone Logic
  const getSafeZoneRect = useCallback((mapId: number) => {
      if (mapId === 0) {
          return { x: TOWN_CENTER_X - TOWN_WIDTH/2, y: TOWN_CENTER_Y - TOWN_HEIGHT/2, w: TOWN_WIDTH, h: TOWN_HEIGHT };
      }
      return { x: 0, y: 0, w: SAFE_ZONE_WIDTH, h: SAFE_ZONE_HEIGHT };
  }, []);

  const isSafeZone = useCallback((x: number, y: number, mapId: number) => {
      // Lorencia (Rectangular)
      if (mapId === 0) {
          const rect = { x: TOWN_CENTER_X - TOWN_WIDTH/2, y: TOWN_CENTER_Y - TOWN_HEIGHT/2, w: TOWN_WIDTH, h: TOWN_HEIGHT };
          return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
      }
      // Noria (Circular)
      if (mapId === 1) {
          const dx = x - TOWN_CENTER_X;
          const dy = y - TOWN_CENTER_Y;
          return (dx*dx + dy*dy) < (350 * 350);
      }
      // Default (Top Left)
      const rect = getSafeZoneRect(mapId);
      return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }, [getSafeZoneRect]);

  // Zone-Based Monster Generation
  const generateFixedMonsters = useCallback((mapId: number) => {
    const map = MAPS[mapId];
    // Get potential monsters for this map
    const validMonsters = MONSTERS_DB.filter(m => m.level >= map.minLvl);
    if (validMonsters.length === 0) return [];

    const newMonsters: Monster[] = [];
    const cols = Math.floor(WORLD_WIDTH / GRID_SIZE);
    const rows = Math.floor(WORLD_HEIGHT / GRID_SIZE);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const gridX = c * GRID_SIZE;
            const gridY = r * GRID_SIZE;

            // Skip if grid is substantially inside Safe Zone
            if (isSafeZone(gridX + GRID_SIZE/2, gridY + GRID_SIZE/2, mapId)) continue;

            // Pick one monster type for this zone
            const template = validMonsters[Math.floor(Math.random() * validMonsters.length)];
            
            // Spawn 0-2 monsters per grid (approx 80-150 per map)
            // 20% chance for 0, 40% for 1, 40% for 2
            const rand = Math.random();
            const count = rand < 0.2 ? 0 : (rand < 0.6 ? 1 : 2);
            
            for (let i = 0; i < count; i++) {
                const isBoss = Math.random() < 0.005; // Rare per grid
                const isElite = !isBoss && Math.random() < 0.08;

                const scaleFactor = 1 + (map.minLvl * 0.02);
                const baseHp = template.maxHp * scaleFactor;
                const baseMin = template.minDmg * scaleFactor;
                const baseMax = template.maxDmg * scaleFactor;
                const baseExp = template.exp * scaleFactor;
     
                const hp = isBoss ? baseHp * 8 : isElite ? baseHp * 2 : baseHp;
                const minDmg = isBoss ? baseMin * 2 : isElite ? baseMin * 1.5 : baseMin;
                const maxDmg = isBoss ? baseMax * 2 : isElite ? baseMax * 1.5 : baseMax;
                const exp = isBoss ? baseExp * 15 : isElite ? baseExp * 3 : baseExp;
                
                const sizeScale = isBoss ? 2.5 : isElite ? 1.5 : 1;

                // Random pos within grid
                const spawnX = gridX + Math.random() * (GRID_SIZE - 40);
                const spawnY = gridY + Math.random() * (GRID_SIZE - 40);

                // Ensure monster doesn't spawn in safe zone
                if (isSafeZone(spawnX, spawnY, mapId)) continue;

                newMonsters.push({
                    ...template,
                    id: Math.random().toString(),
                    name: isBoss ? `世界BOSS ${template.name}` : isElite ? `精英 ${template.name}` : template.name,
                    hp: Math.floor(hp),
                    maxHp: Math.floor(hp),
                    minDmg: Math.floor(minDmg),
                    maxDmg: Math.floor(maxDmg),
                    exp: Math.floor(exp),
                    isElite: isElite,
                    isBoss: isBoss,
                    x: spawnX,
                    y: spawnY,
                    width: MONSTER_SIZE * sizeScale,
                    height: MONSTER_SIZE * sizeScale,
                    lastAttack: 0,
                    originX: spawnX,
                    originY: spawnY
                });
            }
        }
    }
    return newMonsters;
  }, [isSafeZone]);

  // Generate monsters when map changes
  useEffect(() => {
      if (gameState === 'PLAYING') {
          const initialMobs = generateFixedMonsters(activeMap);
          setMonsters(initialMobs);
          setRespawnQueue([]); // Clear old respawns
      }
  }, [activeMap, gameState, generateFixedMonsters]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      setKeysPressed(prev => new Set(prev).add(e.key));
      if (e.key.toLowerCase() === 'c') setOpenMenu(prev => prev === 'CHARACTER' ? null : 'CHARACTER');
      if (e.key.toLowerCase() === 'i') setOpenMenu(prev => prev === 'INVENTORY' ? null : 'INVENTORY');
      if (e.key.toLowerCase() === 'm') setOpenMenu(prev => prev === 'MAP' ? null : 'MAP');
      if (e.key === 'Escape') setOpenMenu(null);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      setKeysPressed(prev => {
        const next = new Set(prev);
        next.delete(e.key);
        return next;
      });
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Map Dragging Handlers
  const handleMapMouseDown = (e: React.MouseEvent) => {
    setIsDraggingMap(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMapMouseMove = (e: React.MouseEvent) => {
    if (isDraggingMap) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setCameraOffset(prev => ({ x: prev.x - dx, y: prev.y - dy }));
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMapMouseUp = () => {
    setIsDraggingMap(false);
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = -e.deltaY * 0.001;
    setZoom(z => Math.min(2.0, Math.max(0.5, z + delta)));
  }, []);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev.slice(-19), { id: Math.random().toString(), message, type }]);
  };

  const handleSaveGame = useCallback(() => {
    if (!player) return;
    const saveData = {
        player,
        activeMap,
        groundItems,
    };
    try {
        localStorage.setItem('mu_save_v1', JSON.stringify(saveData));
        addLog("游戏进度已保存到本地。", "info");
    } catch (e) {
        addLog("保存失败: 存储空间不足或受限。", "error");
    }
  }, [player, activeMap, groundItems]);

  const handleLoadGame = () => {
    try {
        const saved = localStorage.getItem('mu_save_v1');
        if (!saved) return;
        const data = JSON.parse(saved);
        if (data.player) {
            setPlayer(data.player);
            setActiveMap(data.activeMap || 0);
            setGroundItems(data.groundItems || []);
            setGameState('PLAYING');
            addLog(`欢迎回来, ${data.player.name}!`, 'info');
        }
    } catch (e) {
        console.error(e);
    }
  };

  const initializePlayer = (cls: ClassType, name: string) => {
    const base = INITIAL_STATS[cls];
    const startX = activeMap === 0 ? TOWN_CENTER_X : SAFE_ZONE_WIDTH / 2;
    const startY = activeMap === 0 ? TOWN_CENTER_Y : SAFE_ZONE_HEIGHT / 2;
    
    const newPlayer: Player = {
      id: 'player-1',
      name,
      class: cls,
      level: 1,
      exp: 0,
      nextLevelExp: 100,
      points: 0,
      zen: 0,
      stats: { str: base.str, agi: base.agi, vit: base.vit, ene: base.ene },
      hp: base.hp, 
      maxHp: base.hp,
      mana: base.mana,
      maxMana: base.mana,
      inventory: [],
      equipment: { weapon: null, helmet: null, armor: null, pants: null, boots: null, gloves: null, necklace: null, ring: null, wings: null },
      x: startX,
      y: startY,
      width: PLAYER_SIZE,
      height: PLAYER_SIZE
    };
    setPlayer(newPlayer);
    setGameState('PLAYING');
    setMonsters([]); // Cleared initially, useEffect triggers generation
    setGroundItems([]);
    setCameraOffset({ x: 0, y: 0 });
    addLog(`欢迎来到奇迹MU, ${name}!`, 'info');
  };

  const tryAutoPickup = useCallback(() => {
    if (!player) return;
    const pickupRange = 300;
    const itemsToPickup = groundItems.filter(item => {
      const dx = item.x - player.x;
      const dy = item.y - player.y;
      return Math.sqrt(dx*dx + dy*dy) <= pickupRange;
    });

    if (itemsToPickup.length > 0) {
      if (player.inventory.length + itemsToPickup.length > MAX_INVENTORY_SIZE) {
        addLog("背包已满!", "error");
        return;
      }
      const newItems = itemsToPickup.map(({x, y, ...item}) => item);
      setPlayer(p => p ? ({ ...p, inventory: [...p.inventory, ...newItems] }) : null);
      const pickedIds = new Set(itemsToPickup.map(i => i.id));
      setGroundItems(prev => prev.filter(i => !pickedIds.has(i.id)));
      itemsToPickup.forEach(i => addLog(`拾取了 ${i.name}`, 'info'));
      
      if (itemsToPickup.some(i => i.type === ItemType.JEWEL)) {
          playDropSound();
      }
    }
  }, [player, groundItems]);

  // Game Loop: Movement, AI, Respawn
  useEffect(() => {
    if (gameState !== 'PLAYING' || !player) return;
    const loop = setInterval(() => {
      setPlayer(prevPlayer => {
        if (!prevPlayer) return null;
        let { x, y } = prevPlayer;
        let nextX = x;
        let nextY = y;

        if (keysPressed.has('ArrowUp')) nextY = Math.max(0, y - SPEED);
        if (keysPressed.has('ArrowDown')) nextY = Math.min(WORLD_HEIGHT - PLAYER_SIZE, y + SPEED);
        if (keysPressed.has('ArrowLeft')) nextX = Math.max(0, x - SPEED);
        if (keysPressed.has('ArrowRight')) nextX = Math.min(WORLD_WIDTH - PLAYER_SIZE, x + SPEED);
        
        return { ...prevPlayer, x: nextX, y: nextY };
      });

      if (keysPressed.has(' ')) tryAutoPickup();

      const playerInSafe = player ? isSafeZone(player.x, player.y, activeMap) : false;
      const now = Date.now();

      // --- Handle Monster AI ---
      setMonsters(prevMonsters => {
        return prevMonsters.map(m => {
           if (!player) return m;
           
           const distToPlayer = Math.sqrt(Math.pow(player.x - m.x, 2) + Math.pow(player.y - m.y, 2));
           const distToOrigin = Math.sqrt(Math.pow(m.originX - m.x, 2) + Math.pow(m.originY - m.y, 2));
           
           let newX = m.x;
           let newY = m.y;
           
           // State 1: Aggro (Chase Player)
           // Condition: Player nearby AND not Leashed AND Player not in safe zone
           if (distToPlayer < AGGRO_RANGE && distToOrigin < LEASH_RANGE && !playerInSafe) {
               const speed = m.isBoss ? 1.5 : m.isElite ? 2.5 : 2;
               const dx = player.x - m.x;
               const dy = player.y - m.y;
               // Normalize vector
               const vx = (dx / distToPlayer) * speed;
               const vy = (dy / distToPlayer) * speed;
               
               const nextX = m.x + vx;
               const nextY = m.y + vy;
               
               // Check collision with safe zone
               if (!isSafeZone(nextX, nextY, activeMap)) {
                   newX = nextX;
                   newY = nextY;
               }
           } 
           // State 2: Return to Origin (Leashed or Player ran away)
           else if (distToOrigin > 10) {
               // Return slowly
               const returnSpeed = 2;
               const dx = m.originX - m.x;
               const dy = m.originY - m.y;
               const dist = Math.sqrt(dx*dx + dy*dy);
               newX = m.x + (dx / dist) * returnSpeed;
               newY = m.y + (dy / dist) * returnSpeed;
           }
           // State 3: Idle (At origin) - No movement or slight wobble
           else {
               // Optional: add tiny wobble here if desired, but "don't move" was requested
           }

           // Attack Logic
           if (distToPlayer < (50 * (m.isBoss ? 1.5 : 1)) && now - m.lastAttack > 2000 && !playerInSafe) {
             setPlayer(p => {
                if (!p) return null;
                const stats = calculateStats(p);
                let rawDmg = Math.max(1, Math.floor(m.minDmg + Math.random() * (m.maxDmg - m.minDmg)));
                const dmg = Math.max(1, rawDmg - stats.defense);
                
                setFloatingTexts(ft => [...ft, { 
                  id: now, x: p.x, y: p.y - 20, text: `-${dmg}`, color: 'text-red-500 font-bold' 
                }]);
                
                if (p.hp - dmg <= 0) {
                  addLog("你死亡了! 重生中...", "error");
                  const respawnX = (activeMap === 0 || activeMap === 1) ? TOWN_CENTER_X : SAFE_ZONE_WIDTH/2;
                  const respawnY = (activeMap === 0 || activeMap === 1) ? TOWN_CENTER_Y : SAFE_ZONE_HEIGHT/2;
                  return { ...p, hp: p.maxHp, x: respawnX, y: respawnY };
                }
                return { ...p, hp: p.hp - dmg };
             });
             return { ...m, x: newX, y: newY, lastAttack: now };
           }
           return { ...m, x: newX, y: newY };
        });
      });

      // --- Handle Respawn Queue ---
      setRespawnQueue(prevQ => {
          const readyToSpawn = prevQ.filter(task => task.respawnTime <= now);
          const pending = prevQ.filter(task => task.respawnTime > now);

          if (readyToSpawn.length > 0) {
              const spawnedMobs: Monster[] = readyToSpawn.map(task => ({
                  ...task,
                  id: Math.random().toString(),
                  hp: task.maxHp, // Full HP on respawn
                  x: task.originX, // Reset to origin
                  y: task.originY,
                  lastAttack: 0,
                  // No respawnTime on live monster
              }));
              
              setMonsters(prev => [...prev, ...spawnedMobs]);
              // Optional: addLog(`Map Entity Respawned (${spawnedMobs.length})`, 'info');
          }
          return pending;
      });

      if (keysPressed.has('1') || keysPressed.has('2') || keysPressed.has('3')) {
        if (!playerInSafe) {
            const skillIdx = keysPressed.has('1') ? 0 : keysPressed.has('2') ? 1 : 2;
            const skills = SKILLS[player.class];
            if (skills[skillIdx]) useSkill(skills[skillIdx]);
        }
      }
      setFloatingTexts(prev => prev.filter(ft => Date.now() - ft.id < 1000));
    }, 30);
    return () => clearInterval(loop);
  }, [gameState, keysPressed, activeMap, tryAutoPickup, player, isSafeZone]); 

  useEffect(() => {
    if (!player) return;
    const regen = setInterval(() => {
      setPlayer(p => {
          if (!p) return null;
          const stats = calculateStats(p);
          const hpRegenAmount = 1 + Math.floor(stats.hpRegen);
          const manaRegenAmount = 1 + Math.floor(stats.manaRegen);
          return { 
              ...p, 
              hp: Math.min(p.maxHp, p.hp + hpRegenAmount), 
              mana: Math.min(p.maxMana, p.mana + manaRegenAmount) 
          };
      });
    }, 2000);
    return () => clearInterval(regen);
  }, [player?.class, player?.stats]);

  const useSkill = (skill: Skill) => {
    if (!player) return;
    const now = Date.now();
    const stats = calculateStats(player);
    const actualCooldown = Math.max(200, skill.cooldown - stats.cdReductionMs); 

    if ((lastSkillTime[skill.id] || 0) + actualCooldown > now) return;
    if (player.mana < skill.manaCost) return;

    setLastSkillTime(prev => ({ ...prev, [skill.id]: now }));
    setPlayer(p => p ? ({ ...p, mana: p.mana - skill.manaCost }) : null);
    setIsAttacking(true);
    setTimeout(() => setIsAttacking(false), 300);

    setFloatingTexts(prev => [...prev, { 
      id: now, x: player.x + 10, y: player.y - 20, text: skill.name, color: 'text-blue-200 font-bold text-xs' 
    }]);

    setMonsters(prev => prev.map(m => {
       const dx = m.x - player.x;
       const dy = m.y - player.y;
       const dist = Math.sqrt(dx*dx + dy*dy);

       if (dist <= skill.range) {
         let baseDmg = Math.floor(stats.minDmg + Math.random() * (stats.maxDmg - stats.minDmg));
         
         let isExcel = Math.random() * 100 < stats.excellentRate;
         let isLucky = !isExcel && Math.random() * 100 < stats.luckyRate;
         
         if (isExcel) {
             const multi = 2 + (Math.random() * 0.5);
             baseDmg = Math.floor(baseDmg * multi);
         } else if (isLucky) {
             const multi = 1.5 + (Math.random() * 0.5);
             baseDmg = Math.floor(baseDmg * multi);
         }

         const totalDmg = Math.floor(baseDmg * skill.damageMult);
         
         let color = 'text-yellow-400'; 
         if (isExcel) color = 'text-green-400 text-2xl shadow-green-500 font-bold';
         else if (isLucky) color = 'text-blue-400 text-xl font-bold';

         setFloatingTexts(ft => [...ft, { 
            id: Math.random(), x: m.x, y: m.y - 20, text: totalDmg.toString(), color: `${color}` 
         }]);

         if (m.hp - totalDmg <= 0) {
           handleMonsterKill(m, stats);
           return null; // Remove from active list, handled in handleMonsterKill
         }
         return { ...m, hp: m.hp - totalDmg };
       }
       return m;
    }).filter(Boolean) as Monster[]);
  };

  const handleMonsterKill = (m: Monster, stats: any) => {
    if (!player) return;
    let newExp = player.exp + m.exp;
    let newLvl = player.level;
    let newPoints = player.points;
    let nextExp = player.nextLevelExp;
    let leveledUp = false;
    let hp = player.hp;
    let maxHp = player.maxHp;
    let mana = player.mana;
    let maxMana = player.maxMana;

    hp = Math.min(maxHp, hp + stats.killHp);
    mana = Math.min(maxMana, mana + stats.killMana);
    if (stats.killHp > 0 || stats.killMana > 0) {
        setFloatingTexts(ft => [...ft, { 
            id: Math.random(), x: player.x, y: player.y - 40, text: `+${stats.killHp}HP +${stats.killMana}MP`, color: 'text-purple-400 text-xs' 
        }]);
    }

    if (newExp >= nextExp) {
      newLvl++;
      newPoints += 5;
      newExp -= nextExp;
      nextExp = Math.floor(nextExp * 1.5);
      leveledUp = true;
      maxHp += 2;
      maxMana += 2;
      hp = maxHp;
      mana = maxMana;
      addLog(`等级提升! ${newLvl}`, 'level');
    }

    setPlayer(p => p ? ({ 
      ...p, exp: newExp, level: newLvl, points: newPoints, nextLevelExp: nextExp,
      zen: p.zen + (m.level * 50 * (m.isElite ? 2 : 1) * (m.isBoss ? 10 : 1)), hp, maxHp, mana, maxMana
    }) : null);
    
    if (!leveledUp) addLog(`击杀 ${m.name} (+${m.exp} 经验)`, 'info');
    
    const itemsToDrop = [];
    const dropsCount = m.isBoss ? Math.floor(Math.random() * 3) + 1 : 1; 
    
    for (let i = 0; i < dropsCount; i++) {
        const loot = generateLoot(m.level, m.isElite, m.isBoss ? Rarity.BLUE : undefined);
        if (loot) itemsToDrop.push(loot);
    }

    itemsToDrop.forEach(drop => {
        const offX = (Math.random() - 0.5) * 50;
        const offY = (Math.random() - 0.5) * 50;
        setGroundItems(prev => [...prev, { ...drop, x: m.x + offX, y: m.y + offY }]);
        addLog(`掉落: ${drop.name}`, 'loot');
        if (drop.type === ItemType.JEWEL || drop.rarity === Rarity.GOLD) playDropSound();
    });

    // Queue Respawn
    const respawnDelay = 3000 + Math.random() * 7000; // 3 to 10 seconds
    const { id, ...monsterData } = m;
    setRespawnQueue(prev => [...prev, { ...monsterData, respawnTime: Date.now() + respawnDelay }]);
  };

  const pickUpItem = (item: Item & Position) => {
    if (!player) return;
    if (player.inventory.length >= MAX_INVENTORY_SIZE) {
      addLog("背包已满!", "error");
      return;
    }
    const { x, y, ...invItem } = item;
    setPlayer(p => p ? ({ ...p, inventory: [...p.inventory, invItem] }) : null);
    setGroundItems(prev => prev.filter(i => i.id !== item.id));
    addLog(`拾取 ${item.name}`, 'info');
    if (invItem.type === ItemType.JEWEL) playDropSound();
  };

  const equipItem = (item: Item) => {
    if (!player) return;
    const newEquip = { ...player.equipment };
    let returnedItem: Item | null = null;

    switch (item.type) {
      case ItemType.WEAPON: returnedItem = newEquip.weapon; newEquip.weapon = item; break;
      case ItemType.HELMET: returnedItem = newEquip.helmet; newEquip.helmet = item; break;
      case ItemType.ARMOR: returnedItem = newEquip.armor; newEquip.armor = item; break;
      case ItemType.PANTS: returnedItem = newEquip.pants; newEquip.pants = item; break;
      case ItemType.BOOTS: returnedItem = newEquip.boots; newEquip.boots = item; break;
      case ItemType.GLOVES: returnedItem = newEquip.gloves; newEquip.gloves = item; break;
      case ItemType.NECKLACE: returnedItem = newEquip.necklace; newEquip.necklace = item; break;
      case ItemType.RING: returnedItem = newEquip.ring; newEquip.ring = item; break;
      case ItemType.WING: returnedItem = newEquip.wings; newEquip.wings = item; break;
      default: return;
    }

    const newInv = player.inventory.filter(i => i.id !== item.id);
    if (returnedItem) newInv.push(returnedItem);
    setPlayer({ ...player, equipment: newEquip, inventory: newInv });
    setHoveredItem(null);
  };

  const upgradeStat = (stat: 'str' | 'agi' | 'vit' | 'ene', amount: number) => {
    if (!player || player.points < amount) return;
    
    let hpIncrease = 0;
    let manaIncrease = 0;

    if (stat === 'str') hpIncrease = amount * 1;
    if (stat === 'vit') hpIncrease = amount * 2;
    if (stat === 'ene') manaIncrease = amount * 1;

    setPlayer({
      ...player, points: player.points - amount,
      stats: { ...player.stats, [stat]: player.stats[stat] + amount },
      maxHp: player.maxHp + hpIncrease,
      maxMana: player.maxMana + manaIncrease,
      hp: player.hp + hpIncrease, 
      mana: player.mana + manaIncrease
    });
  };

  const onHoverItem = (item: Item | null, x: number, y: number, location: string) => {
      if (item) {
          setHoveredItem({ item, x, y, location });
      } else {
          setHoveredItem(null);
      }
  };

  if (gameState === 'SELECT') {
    return <CharacterSelect onSelect={initializePlayer} onLoad={handleLoadGame} />;
  }

  if (!player) return null;
  const currentMap = MAPS[activeMap];

  let mapClass = '';
  if (activeMap === 0) mapClass = 'bg-grass-pattern'; 
  else if (activeMap === 1) mapClass = 'bg-grass-pattern';
  else if (activeMap === 2) mapClass = 'bg-snow-pattern';
  else if (activeMap === 3) mapClass = 'bg-stone-pattern';
  else if (activeMap === 4) mapClass = 'bg-lava-pattern';
  else if (activeMap === 5) mapClass = 'bg-sky-pattern';
  else mapClass = 'bg-[#0c0a09]';

  const getComparisonItem = (hoverItem: Item): Item | null => {
      if (!hoverItem) return null;
      const eq = player.equipment;
      switch (hoverItem.type) {
          case ItemType.WEAPON: return eq.weapon;
          case ItemType.HELMET: return eq.helmet;
          case ItemType.ARMOR: return eq.armor;
          case ItemType.PANTS: return eq.pants;
          case ItemType.BOOTS: return eq.boots;
          case ItemType.GLOVES: return eq.gloves;
          case ItemType.NECKLACE: return eq.necklace;
          case ItemType.RING: return eq.ring;
          case ItemType.WING: return eq.wings;
          default: return null;
      }
  };
  
  const viewX = (window.innerWidth / 2) - cameraOffset.x - (player.x * zoom);
  const viewY = (window.innerHeight / 2) - cameraOffset.y - (player.y * zoom);
  
  // Only render visible entities (Optimization)
  const visibleMonsters = monsters.filter(m => {
      const screenX = viewX + m.x * zoom;
      const screenY = viewY + m.y * zoom;
      return screenX > -100 && screenX < window.innerWidth + 100 && screenY > -100 && screenY < window.innerHeight + 100;
  });

  const visibleGroundItems = groundItems.filter(i => {
      const screenX = viewX + i.x * zoom;
      const screenY = viewY + i.y * zoom;
      return screenX > -100 && screenX < window.innerWidth + 100 && screenY > -100 && screenY < window.innerHeight + 100;
  });

  return (
    <div className="h-screen w-full bg-black text-gray-200 overflow-hidden flex flex-col">
      
      <div className="h-12 bg-[#111] flex items-center justify-between px-4 border-b border-[#333] z-20 relative">
         <div className="flex gap-4 items-center">
            <span className="text-amber-500 font-bold mu-font">{currentMap.name}</span>
            <span className="text-xs text-gray-500">坐标: {Math.floor(player.x)}, {Math.floor(player.y)}</span>
            <span className="text-xs text-gray-500 hidden md:inline">方向键移动 | 鼠标拖拽平移 | 滚轮缩放 | 1,2,3 攻击 | 空格 拾取</span>
            <span className="text-xs text-blue-400 font-bold">缩放: {(zoom * 100).toFixed(0)}%</span>
            <span className="text-xs text-red-900">Mobs: {monsters.length}</span>
         </div>
      </div>

      {/* Main Game Viewport */}
      <div 
        className="flex-1 relative overflow-hidden bg-black cursor-crosshair select-none"
        onMouseDown={handleMapMouseDown}
        onMouseMove={handleMapMouseMove}
        onMouseUp={handleMapMouseUp}
        onMouseLeave={handleMapMouseUp}
        onWheel={handleWheel}
      >
         {/* Static Overlay Effects */}
         <div className="map-vignette z-10" />
         <div className="absolute inset-0 opacity-10 pointer-events-none z-[1] mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]"></div>

         {/* Transformed World Container */}
         <div 
            className="absolute top-0 left-0"
            style={{ 
                width: WORLD_WIDTH, 
                height: WORLD_HEIGHT,
                transform: `translate(${viewX}px, ${viewY}px) scale(${zoom})`,
                transformOrigin: '0 0',
                willChange: 'transform'
            }}
         >
             <div className={`absolute inset-0 ${mapClass}`} />
             
             {mapDecorations.map(dec => {
                 // Viewport culling for decorations could be added here for extra performance
                 if (dec.type === 'pavement') return <div key={dec.id} className="absolute bg-pavement border-2 border-gray-700 z-[1] shadow-inner" style={{ left: dec.x, top: dec.y, width: dec.w, height: dec.h, ...dec.style }}></div>
                 if (dec.type === 'wall') return <div key={dec.id} className="absolute bg-wall border border-black z-[2] shadow-xl" style={{ left: dec.x, top: dec.y, width: dec.w, height: dec.h }}></div>
                 if (dec.type === 'roof') return <div key={dec.id} className="absolute bg-roof border-4 border-gray-800 z-[3] shadow-2xl flex items-center justify-center" style={{ left: dec.x, top: dec.y, width: dec.w, height: dec.h }}><div className="w-[90%] h-[90%] border border-gray-600/30"></div></div>
                 if (dec.type === 'fountain') return <div key={dec.id} className="absolute fountain-water rounded-full blur-sm z-[2] border-4 border-white/20" style={{ left: dec.x, top: dec.y, width: dec.w, height: dec.h }}></div>
                 
                 if (dec.type === 'sand') return <div key={dec.id} className="absolute bg-sand-pattern opacity-80 z-[0]" style={{ left: dec.x, top: dec.y, width: dec.w, height: dec.h, ...dec.style }}></div>
                 if (dec.type === 'crystal') return <div key={dec.id} className="absolute crystal-glow z-[2]" style={{ left: dec.x, top: dec.y, width: dec.w, height: dec.h }}></div>

                 if (dec.type === 'river') return <div key={dec.id} className="absolute water-pattern opacity-60 blur-sm z-0" style={{ left: dec.x, top: dec.y, width: dec.w, height: dec.h, borderRadius: activeMap === 0 ? '5px' : '50%' }} />
                 if (dec.type === 'lava') return <div key={dec.id} className="absolute bg-red-600 rounded-full opacity-60 blur-md animate-pulse" style={{ left: dec.x, top: dec.y, width: dec.w, height: dec.h, boxShadow: '0 0 20px red' }} />
                 if (dec.type === 'tree') return <div key={dec.id} className="absolute flex flex-col items-center justify-end z-[2]" style={{ left: dec.x, top: dec.y }}><div className="w-12 h-24 bg-green-900 rounded-t-full opacity-80 border-b-4 border-black shadow-2xl"></div><div className="w-4 h-4 bg-amber-900"></div></div>
                 if (dec.type === 'stone') return <div key={dec.id} className="absolute bg-gray-700 rounded-lg border-2 border-gray-500 z-[2]" style={{ left: dec.x, top: dec.y, width: dec.w, height: dec.h, boxShadow: '2px 2px 5px black', ...dec.style }}></div>
                 if (dec.type === 'snow') return <div key={dec.id} className="absolute bg-slate-200 rounded-full blur-[1px] z-[2]" style={{ left: dec.x, top: dec.y, width: dec.w, height: dec.h, opacity: 0.8 }}></div>
                 if (dec.type === 'cloud') return <div key={dec.id} className="absolute bg-white rounded-full blur-xl opacity-20 z-[5]" style={{ left: dec.x, top: dec.y, width: dec.w, height: dec.h }}></div>
                 if (dec.type === 'grass') return <div key={dec.id} className={`absolute text-xs opacity-50 z-[1] ${activeMap === 1 ? 'text-green-600' : activeMap === 2 ? 'text-white' : 'text-gray-600'}`} style={{ left: dec.x, top: dec.y }}>{activeMap === 2 ? '❄️' : '🌱'}</div>
                 return null;
             })}
             
             {/* Safe Zone Indicator for Maps 0, 1 or standard safe zone */}
             {(activeMap !== 0 && activeMap !== 1) ? (
                <div className="absolute top-0 left-0 safe-zone-dome flex items-center justify-center z-0" style={{ width: SAFE_ZONE_WIDTH, height: SAFE_ZONE_HEIGHT }}>
                    <div className="text-blue-400/20 font-bold text-4xl -rotate-45 select-none border-4 border-blue-500/20 p-4 rounded-xl">安全区</div>
                </div>
             ) : (
                 <div className="absolute safe-zone-dome flex items-center justify-center z-0" 
                      style={ activeMap === 0 ? 
                        { left: TOWN_CENTER_X - TOWN_WIDTH/2, top: TOWN_CENTER_Y - TOWN_HEIGHT/2, width: TOWN_WIDTH, height: TOWN_HEIGHT } :
                        { left: TOWN_CENTER_X - 350, top: TOWN_CENTER_Y - 350, width: 700, height: 700, borderRadius: '50%' }
                      }
                 >
                    {/* Safe zone visual only */}
                 </div>
             )}

             {activeMap === 0 && (
                 <div className="absolute text-center z-[1] pointer-events-none" style={{ left: TOWN_CENTER_X - 50, top: TOWN_CENTER_Y + 120 }}>
                      <div className="text-gray-500/30 font-bold text-2xl select-none">勇者大陆</div>
                 </div>
             )}

             {activeMap === 1 && (
                 <div className="absolute text-center z-[1] pointer-events-none" style={{ left: TOWN_CENTER_X - 40, top: TOWN_CENTER_Y + 50 }}>
                      <div className="text-green-300/40 font-bold text-2xl select-none mu-font">仙踪林</div>
                 </div>
             )}

             {/* Entities Layer */}
             <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-10">
                {visibleGroundItems.map(item => (
                  <div key={item.id} className="absolute flex flex-col items-center justify-center pointer-events-auto cursor-pointer hover:scale-110 transition-transform z-[3]" style={{ left: item.x, top: item.y, width: ITEM_SIZE, height: ITEM_SIZE }} onClick={(e) => { e.stopPropagation(); pickUpItem(item); }} onMouseEnter={(e) => setHoveredItem({ item, x: e.clientX, y: e.clientY, location: 'GROUND' })} onMouseLeave={() => setHoveredItem(null)}>
                    {item.rarity === Rarity.GOLD && <div className="light-pillar"></div>}
                    <span className={`text-xl animate-bounce ${item.rarity === Rarity.GOLD ? 'drop-shadow-[0_0_5px_rgba(255,215,0,0.8)]' : ''}`}>{item.icon}</span>
                    <span className={`text-[9px] font-bold px-1 bg-black/50 rounded whitespace-nowrap ${RARITY_COLORS[item.rarity].split(' ')[0]}`}>{item.name}</span>
                  </div>
                ))}
                
                {visibleMonsters.map(m => (
                  <div key={m.id} className="absolute flex flex-col items-center transition-all duration-100 z-[4]" style={{ left: m.x, top: m.y, width: m.width, height: m.height }}>
                     <div className="absolute -top-4 w-[120%] left-[-10%] h-3 bg-black border border-gray-500 rounded overflow-hidden shadow-sm">
                        <div className="h-full bg-gradient-to-r from-red-600 to-red-800 transition-all duration-200" style={{ width: `${(m.hp/m.maxHp)*100}%` }}></div>
                        <span className="absolute inset-0 flex items-center justify-center text-[8px] text-white font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] leading-none">
                            {m.hp}/{m.maxHp}
                        </span>
                     </div>
                     <div className={`text-3xl ${m.isBoss ? 'scale-150 filter drop-shadow-[0_0_15px_rgba(255,0,0,1)]' : m.isElite ? 'scale-125 filter drop-shadow-[0_0_8px_rgba(255,0,0,0.8)]' : ''}`}>{m.image}</div>
                     <span className={`text-[10px] font-bold whitespace-nowrap drop-shadow-md ${m.isBoss ? 'text-red-500 text-lg mt-1' : m.isElite ? 'text-yellow-400' : 'text-gray-300'}`}>{m.name}</span>
                  </div>
                ))}

                <div className="absolute transition-all duration-75 z-20" style={{ left: player.x, top: player.y, width: player.width, height: player.height }}>
                   <span className="absolute top-[-30px] w-full text-center text-xs text-emerald-400 font-bold whitespace-nowrap z-50 drop-shadow-md bg-black/30 px-2 rounded">{player.name}</span>
                   <PlayerAvatar player={player} isAttacking={isAttacking} />
                </div>
                {floatingTexts.map(ft => (
                  <div key={ft.id} className={`absolute damage-text ${ft.color} z-[100]`} style={{ left: ft.x, top: ft.y }}>{ft.text}</div>
                ))}
             </div>
         </div>
      </div>
      
      {hoveredItem && (
        <ItemTooltip 
            item={hoveredItem.item} 
            comparisonItem={hoveredItem.location === 'INVENTORY' ? getComparisonItem(hoveredItem.item) : null} 
            x={hoveredItem.x} 
            y={hoveredItem.y} 
            location={hoveredItem.location}
        />
      )}

      <div className="fixed bottom-28 left-4 w-80 h-40 bg-black/70 border border-gray-600 rounded overflow-y-auto p-2 text-xs font-sans z-30 pointer-events-auto">
          {logs.map(log => (
            <div key={log.id} className={`mb-1 break-words ${log.type === 'damage' ? 'text-gray-400' : log.type === 'error' ? 'text-red-400' : log.type === 'loot' ? 'text-yellow-200' : log.type === 'level' ? 'text-yellow-400 font-bold' : 'text-gray-300'}`}>
              {log.message}
            </div>
          ))}
          <div ref={logEndRef} />
      </div>

      {openMenu === 'CHARACTER' && (
        <DraggableWindow title="角色属性 (C)" onClose={() => setOpenMenu(null)} initialPos={{ x: 50, y: 100 }} width="w-64">
           <div className="p-4 font-mono text-sm">
           <div className="flex justify-between mt-2"><span>等级</span> <span className="text-white">{player.level}</span></div>
           <div className="flex justify-between"><span>点数</span> <span className="text-yellow-500 font-bold">{player.points}</span></div>
           
           <div className="my-2 space-y-1 border-b border-gray-800 pb-2">
             {[
               { key: 'str', label: '力量', desc: '1攻 1血 0.1回血' },
               { key: 'agi', label: '敏捷', desc: '1攻 1攻速 0.1防' },
               { key: 'ene', label: '智力', desc: '1攻 1蓝 0.1回蓝' },
               { key: 'vit', label: '体力', desc: '生命上限' },
             ].map((stat) => (
               <div key={stat.key} className="flex flex-col">
                 <div className="flex justify-between items-center">
                   <span className="text-gray-400 w-10 font-bold" title={stat.desc}>{stat.label}</span>
                   <span className="flex-1 text-right mr-4 text-white">{player.stats[stat.key as keyof typeof player.stats]}</span>
                 </div>
                 {player.points > 0 && (
                   <div className="flex gap-1 justify-end mt-1 mb-1">
                     <button onClick={()=>upgradeStat(stat.key as any, 1)} className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 rounded text-[10px] text-gray-300">+1</button>
                     <button onClick={()=>upgradeStat(stat.key as any, 5)} className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 rounded text-[10px] text-gray-300">+5</button>
                     <button onClick={()=>upgradeStat(stat.key as any, 10)} className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 rounded text-[10px] text-gray-300">+10</button>
                   </div>
                 )}
               </div>
             ))}
           </div>

           <div className="space-y-1 text-xs">
             <div className="flex justify-between text-blue-300"><span>攻击力:</span> <span>{playerStats.minDmg} ~ {playerStats.maxDmg}</span></div>
             <div className="flex justify-between text-green-300"><span>防御力:</span> <span>{playerStats.defense}</span></div>
             <div className="flex justify-between text-red-300"><span>生命值:</span> <span>{Math.floor(player.hp)}/{player.maxHp}</span></div>
             <div className="flex justify-between text-blue-400"><span>魔法值:</span> <span>{Math.floor(player.mana)}/{player.maxMana}</span></div>
             <div className="border-t border-gray-800 my-1 pt-1"></div>
             <div className="flex justify-between text-purple-300"><span>幸运一击:</span> <span>{playerStats.luckyRate.toFixed(1)}%</span></div>
             <div className="flex justify-between text-green-400"><span>卓越一击:</span> <span>{playerStats.excellentRate.toFixed(1)}%</span></div>
           </div>
           </div>
        </DraggableWindow>
      )}

      {openMenu === 'INVENTORY' && (
        <DraggableWindow title="背包 (I)" onClose={() => setOpenMenu(null)} initialPos={{ x: window.innerWidth - 460, y: 100 }} width="w-[440px]">
           <div className="p-4">
           <div className="relative h-[280px] mb-4 border border-[#222] bg-[#050505] mx-auto w-full select-none bg-[radial-gradient(circle_at_center,_#111,_#000)]">
              <div className="absolute top-1/2 left-0 w-full h-px bg-gray-900"></div>
              <div className="absolute left-1/2 top-0 w-px h-full bg-gray-900"></div>
              <div className="absolute top-8 left-8 w-16 h-24 border border-gray-800 flex items-center justify-center text-gray-800 text-xs">武器</div>
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-14 h-14 border border-gray-800 flex items-center justify-center text-gray-800 text-xs">头盔</div>
              <div className="absolute top-8 right-8 w-16 h-20 border border-gray-800 flex items-center justify-center text-gray-800 text-xs">翅膀</div>
              <div className="absolute top-20 left-1/2 -translate-x-1/2 w-16 h-20 border border-gray-800 flex items-center justify-center text-gray-800 text-xs">铠甲</div>
              <div className="absolute top-36 left-8 w-14 h-14 border border-gray-800 flex items-center justify-center text-gray-800 text-xs">护手</div>
              <div className="absolute top-36 right-8 w-14 h-14 border border-gray-800 flex items-center justify-center text-gray-800 text-xs">项链</div>
              <div className="absolute top-[170px] left-1/2 -translate-x-1/2 w-14 h-14 border border-gray-800 flex items-center justify-center text-gray-800 text-xs">护腿</div>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-14 h-14 border border-gray-800 flex items-center justify-center text-gray-800 text-xs">鞋子</div>
              <div className="absolute bottom-8 left-12 w-10 h-10 border border-gray-800 flex items-center justify-center text-gray-800 text-xs">戒指</div>
              {[
                { item: player.equipment.weapon, style: { top: 32, left: 32, width: 64, height: 96 } },
                { item: player.equipment.helmet, style: { top: 16, left: '50%', marginLeft: -28, width: 56, height: 56 } },
                { item: player.equipment.wings, style: { top: 32, right: 32, width: 64, height: 80 } },
                { item: player.equipment.armor, style: { top: 80, left: '50%', marginLeft: -32, width: 64, height: 80 } },
                { item: player.equipment.gloves, style: { top: 144, left: 32, width: 56, height: 56 } },
                { item: player.equipment.necklace, style: { top: 144, right: 32, width: 56, height: 56 } },
                { item: player.equipment.pants, style: { top: 170, left: '50%', marginLeft: -28, width: 56, height: 56 } },
                { item: player.equipment.boots, style: { bottom: 16, left: '50%', marginLeft: -28, width: 56, height: 56 } },
                { item: player.equipment.ring, style: { bottom: 32, left: 48, width: 40, height: 40 } },
              ].map((slot, i) => slot.item && (
                <div key={i} className={`absolute flex items-center justify-center bg-black/80 ${RARITY_COLORS[slot.item.rarity]}`} style={slot.style as any} onMouseEnter={(e) => setHoveredItem({ item: slot.item!, x: e.clientX, y: e.clientY, location: 'EQUIPPED' })} onMouseLeave={() => setHoveredItem(null)}>
                  <span className="text-3xl filter drop-shadow-md">{slot.item.icon}</span>
                </div>
              ))}
           </div>
           <div className="flex justify-between items-center mb-1 px-1">
              <button onClick={() => setInventoryPage(p => Math.max(0, p-1))} disabled={inventoryPage === 0} className="text-xs bg-gray-800 px-2 py-1 rounded disabled:opacity-30 hover:bg-gray-700">&lt;</button>
              <span className="text-xs text-gray-400">背包页 {inventoryPage + 1} / {MAX_INVENTORY_PAGES}</span>
              <button onClick={() => setInventoryPage(p => Math.min(MAX_INVENTORY_PAGES-1, p+1))} disabled={inventoryPage === MAX_INVENTORY_PAGES - 1} className="text-xs bg-gray-800 px-2 py-1 rounded disabled:opacity-30 hover:bg-gray-700">&gt;</button>
           </div>
           <div className="grid grid-cols-8 gap-1 select-none">
              {Array.from({length: INVENTORY_PAGE_SIZE}).map((_, i) => {
                const actualIndex = inventoryPage * INVENTORY_PAGE_SIZE + i;
                const item = player.inventory[actualIndex];
                return (
                  <div key={i} onClick={() => item && equipItem(item)} className={`w-10 h-10 border flex flex-col items-center justify-center relative cursor-pointer transition-colors ${item ? `bg-[#111] hover:bg-[#222] ${RARITY_COLORS[item.rarity]}` : 'bg-[#080808] border-[#222]'}`} onMouseEnter={(e) => item && setHoveredItem({ item, x: e.clientX, y: e.clientY, location: 'INVENTORY' })} onMouseLeave={() => setHoveredItem(null)}>
                    {item && (<><span className="text-xl filter drop-shadow-sm">{item.icon}</span>{item.level > 0 && <span className="absolute top-0 right-0 text-[8px] font-bold text-white bg-black/60 px-0.5 rounded-bl">+{item.level}</span>}</>)}
                  </div>
                );
              })}
           </div>
           <div className="mt-2 flex justify-between items-center text-xs"><span className="text-gray-500">空格自动拾取</span><span className="text-yellow-600 font-bold text-sm">金币: {player.zen.toLocaleString()}</span></div>
           </div>
        </DraggableWindow>
      )}

      {openMenu === 'MAP' && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center" onClick={() => setOpenMenu(null)}>
           <div className="grid grid-cols-2 gap-4 p-4">
              {MAPS.map((m, i) => (
                <button key={m.name} onClick={(e) => { 
                  e.stopPropagation(); 
                  setActiveMap(i); 
                  setOpenMenu(null);
                  
                  // Teleport to Map Center/Safe Zone
                  const newX = (i === 0 || i === 1) ? TOWN_CENTER_X : SAFE_ZONE_WIDTH / 2;
                  const newY = (i === 0 || i === 1) ? TOWN_CENTER_Y : SAFE_ZONE_HEIGHT / 2;
                  setPlayer(prev => prev ? ({ ...prev, x: newX, y: newY }) : null);
                  setCameraOffset({ x: 0, y: 0 });

                }} className={`p-6 border-2 rounded ${activeMap === i ? 'border-amber-500 text-amber-500' : 'border-gray-600 text-gray-400'}`}>{m.name} (Lv {m.minLvl})</button>
              ))}
           </div>
        </div>
      )}

      {openMenu === 'NPC' && <NPCInteraction player={player} onClose={() => setOpenMenu(null)} onUpdatePlayer={setPlayer} addLog={addLog} onHoverItem={onHoverItem} />}

      <GameHUD player={player} onMenuClick={(m) => setOpenMenu(prev => prev === m ? null : m)} onSave={handleSaveGame} />
    </div>
  );
}
