
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import GameHUD from './components/GameHUD';
import NPCInteraction from './components/NPCInteraction';
import { DraggableWindow } from './components/DraggableWindow';
import { INITIAL_STATS, MONSTERS_DB, ITEMS_DB, MAPS, SKILLS, RARITY_COLORS, ITEM_OPTIONS_POOL, EXCELLENT_OPTIONS_POOL, SAFE_ZONE_WIDTH, SAFE_ZONE_HEIGHT, INVENTORY_PAGE_SIZE, MAX_INVENTORY_PAGES, MAX_INVENTORY_SIZE } from './constants';
import { Player, ClassType, Monster, Item, LogEntry, Rarity, ItemType, Position, ItemOption, Skill } from './types';

// World Config
const WORLD_WIDTH = 1200;
const WORLD_HEIGHT = 800;
const PLAYER_SIZE = 40;
const MONSTER_SIZE = 40;
const ITEM_SIZE = 30;
const SPEED = 5;

// --- Stat Helper (Level Scaling) ---
// Returns the value increased by 10% per level
const getScaledStat = (baseVal: number | undefined, level: number) => {
    if (!baseVal) return 0;
    return Math.floor(baseVal * (1 + level * 0.1));
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
     // Weight specific jewels? Random for now.
     // Maya is rare? 
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
  type: 'tree' | 'stone' | 'river' | 'grass';
  x: number;
  y: number;
  w: number;
  h: number;
  style?: React.CSSProperties;
}

const generateMapDecorations = (mapId: number): MapDecoration[] => {
  const decorations: MapDecoration[] = [];
  
  for (let i = 0; i < WORLD_WIDTH; i += 20) {
    if (i > SAFE_ZONE_WIDTH + 100) { 
        const riverY = 400 + Math.sin(i / 100) * 100;
        decorations.push({
            id: `river-${i}`, type: 'river', x: i, y: riverY, w: 25, h: 25
        });
    }
  }

  const numObjects = 30;
  for (let i = 0; i < numObjects; i++) {
    const x = Math.random() * WORLD_WIDTH;
    const y = Math.random() * WORLD_HEIGHT;
    if (x < SAFE_ZONE_WIDTH && y < SAFE_ZONE_HEIGHT) continue;

    const isStone = Math.random() > 0.7;
    decorations.push({
        id: `dec-${i}`,
        type: isStone ? 'stone' : 'tree',
        x, y,
        w: isStone ? 30 : 60,
        h: isStone ? 30 : 80,
        style: { opacity: 0.9 }
    });
  }
  
  for (let i=0; i < 50; i++) {
     const x = Math.random() * WORLD_WIDTH;
    const y = Math.random() * WORLD_HEIGHT;
    decorations.push({
        id: `grass-${i}`, type: 'grass', x, y, w: 20, h: 20
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
        <h2 className="text-xl text-gray-400 mb-8 tracking-widest">传奇再续</h2>
        
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

// --- Tooltip Component ---
const ItemTooltip = ({ item, comparisonItem, x, y, location }: { item: Item, comparisonItem: Item | null, x: number, y: number, location: string }) => {
    const getDiff = (val: number | undefined, compVal: number | undefined) => {
        const v1 = val || 0;
        const v2 = compVal || 0;
        return v1 - v2;
    };

    const renderStatRow = (label: string, val: number | undefined, compVal: number | undefined, colorClass: string = 'text-white', showDiff: boolean = true) => {
        if (!val) return null;
        // Diff must compare Scaled vs Scaled
        const diff = (showDiff && comparisonItem) ? getDiff(val, compVal) : 0;
        return (
            <div className={`text-xs ${colorClass} flex justify-between`}>
                <span>{label}: {val}</span>
                {showDiff && comparisonItem && diff !== 0 && (
                    <span className={diff > 0 ? 'text-green-400' : 'text-red-400'}>
                        {diff > 0 ? '+' : ''}{diff}
                    </span>
                )}
            </div>
        );
    };

    const renderCard = (itm: Item, title: string, isComparison: boolean = false) => {
        const compForDiff = isComparison ? null : comparisonItem;
        
        // Pre-calculate scaled stats for display
        const sMin = getScaledStat(itm.stats.minDmg, itm.level);
        const sMax = getScaledStat(itm.stats.maxDmg, itm.level);
        const sDef = getScaledStat(itm.stats.defense, itm.level);
        
        const cMin = compForDiff ? getScaledStat(compForDiff.stats.minDmg, compForDiff.level) : 0;
        const cMax = compForDiff ? getScaledStat(compForDiff.stats.maxDmg, compForDiff.level) : 0;
        const cDef = compForDiff ? getScaledStat(compForDiff.stats.defense, compForDiff.level) : 0;

        return (
            <div className="bg-black border-2 border-amber-700 p-2 w-56 shadow-2xl relative z-[100] pointer-events-none">
                <div className="absolute -top-3 left-2 bg-black px-1 text-[10px] text-gray-500 border border-gray-800">{title}</div>
                <div className={`font-bold ${RARITY_COLORS[itm.rarity].split(' ')[0]} border-b border-gray-700 pb-1 mb-1 break-words`}>
                    {itm.name} {itm.level > 0 && `+${itm.level}`}
                </div>
                <div className="text-[10px] text-gray-400 italic mb-2 flex justify-between">
                    <span>{itm.type}</span>
                    <span>{itm.rarity}</span>
                </div>
                
                {renderStatRow("攻击力", sMin, cMin, 'text-white', !isComparison)}
                {renderStatRow("防御力", sDef, cDef, 'text-white', !isComparison)}
                {itm.stats.reqStr && <div className="text-[10px] text-red-300">需要力量: {itm.stats.reqStr}</div>}
                
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

    const getLocationLabel = (loc: string) => {
        if (loc === 'INVENTORY') return '背包中';
        if (loc === 'EQUIPPED') return '已装备';
        if (loc === 'NPC') return '商店';
        return '详情';
    };

    return (
        <div className="fixed z-[100] pointer-events-none flex gap-2 items-start" style={{ left: Math.min(window.innerWidth - 500, x + 15), top: Math.min(window.innerHeight - 300, y + 15) }}>
            {comparisonItem && renderCard(comparisonItem, "已装备", true)}
            {renderCard(item, getLocationLabel(location))}
        </div>
    );
};

export default function App() {
  const [gameState, setGameState] = useState<'SELECT' | 'PLAYING'>('SELECT');
  const [player, setPlayer] = useState<Player | null>(null);
  const [monsters, setMonsters] = useState<Monster[]>([]);
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

  const logEndRef = useRef<HTMLDivElement>(null);

  const playerStats = useMemo(() => {
    if (!player) return { minDmg: 0, maxDmg: 0, defense: 0, luckyRate: 0, excellentRate: 0, hpRec: 0, manaRec: 0, ignoreDef: 0, killHp: 0, killMana: 0, hpRegen: 0, manaRegen: 0, cdReductionMs: 0, bonusHp: 0, bonusMana: 0 };
    return calculateStats(player);
  }, [player]);

  useEffect(() => {
    setMapDecorations(generateMapDecorations(activeMap));
  }, [activeMap]);

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
      x: SAFE_ZONE_WIDTH / 2,
      y: SAFE_ZONE_HEIGHT / 2,
      width: PLAYER_SIZE,
      height: PLAYER_SIZE
    };
    setPlayer(newPlayer);
    setGameState('PLAYING');
    setMonsters([]);
    setGroundItems([]);
    addLog(`欢迎来到奇迹MU, ${name}!`, 'info');
  };

  const tryAutoPickup = useCallback(() => {
    if (!player) return;
    const pickupRange = 150;
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

  useEffect(() => {
    if (gameState !== 'PLAYING' || !player) return;
    const loop = setInterval(() => {
      setPlayer(prevPlayer => {
        if (!prevPlayer) return null;
        let { x, y } = prevPlayer;
        if (keysPressed.has('ArrowUp')) y = Math.max(0, y - SPEED);
        if (keysPressed.has('ArrowDown')) y = Math.min(WORLD_HEIGHT - PLAYER_SIZE, y + SPEED);
        if (keysPressed.has('ArrowLeft')) x = Math.max(0, x - SPEED);
        if (keysPressed.has('ArrowRight')) x = Math.min(WORLD_WIDTH - PLAYER_SIZE, x + SPEED);
        return { ...prevPlayer, x, y };
      });

      if (keysPressed.has(' ')) tryAutoPickup();

      const isSafeZone = (x: number, y: number) => x < SAFE_ZONE_WIDTH && y < SAFE_ZONE_HEIGHT;

      setMonsters(prevMonsters => {
        if (prevMonsters.length < 5 + (activeMap * 2)) {
           const map = MAPS[activeMap];
           const validMonsters = MONSTERS_DB.filter(m => m.level >= map.minLvl);
           const template = validMonsters.length > 0 ? validMonsters[Math.floor(Math.random() * validMonsters.length)] : MONSTERS_DB[0];
           
           const isBoss = Math.random() < 0.01;
           const isElite = !isBoss && Math.random() < 0.1;
           
           const scaleFactor = 1 + (player.level * 0.05);

           const baseHp = template.maxHp * scaleFactor;
           const baseMin = template.minDmg * scaleFactor;
           const baseMax = template.maxDmg * scaleFactor;
           const baseExp = template.exp * scaleFactor;

           const hp = isBoss ? baseHp * 8 : isElite ? baseHp * 2 : baseHp;
           const minDmg = isBoss ? baseMin * 2 : isElite ? baseMin * 1.5 : baseMin;
           const maxDmg = isBoss ? baseMax * 2 : isElite ? baseMax * 1.5 : baseMax;
           const exp = isBoss ? baseExp * 15 : isElite ? baseExp * 3 : baseExp;
           
           const sizeScale = isBoss ? 2.5 : isElite ? 1.5 : 1;

           let spawnX = Math.random() * (WORLD_WIDTH - 50);
           let spawnY = Math.random() * (WORLD_HEIGHT - 50);
           if (isSafeZone(spawnX, spawnY)) {
             spawnX = SAFE_ZONE_WIDTH + 50 + Math.random() * 200;
             spawnY = SAFE_ZONE_HEIGHT + 50 + Math.random() * 200;
           }
           return [...prevMonsters, {
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
             lastAttack: 0
           }];
        }
        
        return prevMonsters.map(m => {
           if (!player) return m;
           const dx = player.x - m.x;
           const dy = player.y - m.y;
           const dist = Math.sqrt(dx*dx + dy*dy);
           let newX = m.x;
           let newY = m.y;
           const playerInSafe = isSafeZone(player.x, player.y);

           if (dist > 40 && !playerInSafe) {
             const speed = m.isBoss ? 1.5 : m.isElite ? 2.5 : 2;
             newX += (dx / dist) * speed; 
             newY += (dy / dist) * speed;
           }

           const now = Date.now();
           if (dist < (50 * (m.isBoss ? 1.5 : 1)) && now - m.lastAttack > 2000 && !playerInSafe) {
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
                  return { ...p, hp: p.maxHp, x: SAFE_ZONE_WIDTH/2, y: SAFE_ZONE_HEIGHT/2 };
                }
                return { ...p, hp: p.hp - dmg };
             });
             return { ...m, x: newX, y: newY, lastAttack: now };
           }
           return { ...m, x: newX, y: newY };
        });
      });

      if (keysPressed.has('1') || keysPressed.has('2') || keysPressed.has('3')) {
        if (!isSafeZone(player.x, player.y)) {
            const skillIdx = keysPressed.has('1') ? 0 : keysPressed.has('2') ? 1 : 2;
            const skills = SKILLS[player.class];
            if (skills[skillIdx]) useSkill(skills[skillIdx]);
        }
      }
      setFloatingTexts(prev => prev.filter(ft => Date.now() - ft.id < 1000));
    }, 30);
    return () => clearInterval(loop);
  }, [gameState, keysPressed, activeMap, tryAutoPickup, player]); 

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
           return null;
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
        
        if (drop.type === ItemType.JEWEL || drop.rarity === Rarity.GOLD) {
            playDropSound();
        }
    });
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

  return (
    <div className="h-screen w-full bg-black text-gray-200 overflow-hidden flex flex-col">
      
      <div className="h-12 bg-[#111] flex items-center justify-between px-4 border-b border-[#333] z-20">
         <div className="flex gap-4 items-center">
            <span className="text-amber-500 font-bold mu-font">{currentMap.name}</span>
            <span className="text-xs text-gray-500">坐标: {Math.floor(player.x)}, {Math.floor(player.y)}</span>
            <span className="text-xs text-gray-500">方向键移动 | 1,2,3 攻击 | 空格 拾取</span>
         </div>
      </div>

      <div className="flex-1 relative overflow-hidden bg-black cursor-crosshair select-none">
         <div className={`absolute inset-0 ${currentMap.bg}`} style={{ 
            backgroundImage: activeMap === 1 ? `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230f392b' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` : 
                             activeMap === 2 ? `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 20.5V18H0v-2h20v-2H0v-2h20v-2H0V8h20V6H0V4h20V2H0V4h20V2H0V0h20v20.5zm20 0V18H20v-2h20v-2H20v-2h20v-2H20V8h20V6H20V4h20V2H20V0h20v20.5z' fill='%233b82f6' fill-opacity='0.05' fill-rule='evenodd'/%3E%3C/svg%3E")` : 
                             `url("https://www.transparenttextures.com/patterns/dark-stone.png")`,
            backgroundSize: '200px'
         }} />

         {mapDecorations.map(dec => {
             if (dec.type === 'river') return <div key={dec.id} className="absolute water-pattern rounded-full opacity-60 blur-sm" style={{ left: dec.x, top: dec.y, width: dec.w, height: dec.h }} />
             if (dec.type === 'tree') return <div key={dec.id} className="absolute flex flex-col items-center justify-end" style={{ left: dec.x, top: dec.y }}><div className="w-12 h-24 bg-green-900 rounded-t-full opacity-80 border-b-4 border-black shadow-2xl"></div><div className="w-4 h-4 bg-amber-900"></div></div>
             if (dec.type === 'stone') return <div key={dec.id} className="absolute bg-gray-700 rounded-lg border-2 border-gray-500" style={{ left: dec.x, top: dec.y, width: dec.w, height: dec.h, boxShadow: '2px 2px 5px black' }}></div>
             if (dec.type === 'grass') return <div key={dec.id} className="absolute text-green-800 text-xs opacity-50" style={{ left: dec.x, top: dec.y }}>🌱</div>
             return null;
         })}

         <div className="absolute top-0 left-0 safe-zone-dome flex items-center justify-center z-0" style={{ width: SAFE_ZONE_WIDTH, height: SAFE_ZONE_HEIGHT }}>
            <div className="text-blue-400/20 font-bold text-4xl -rotate-45 select-none border-4 border-blue-500/20 p-4 rounded-xl">安全区</div>
         </div>

         <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-10">
            {groundItems.map(item => (
              <div key={item.id} className="absolute flex flex-col items-center justify-center pointer-events-auto cursor-pointer hover:scale-110 transition-transform" style={{ left: item.x, top: item.y, width: ITEM_SIZE, height: ITEM_SIZE }} onClick={() => pickUpItem(item)} onMouseEnter={(e) => setHoveredItem({ item, x: e.clientX, y: e.clientY, location: 'GROUND' })} onMouseLeave={() => setHoveredItem(null)}>
                {item.rarity === Rarity.GOLD && <div className="light-pillar"></div>}
                <span className={`text-xl animate-bounce ${item.rarity === Rarity.GOLD ? 'drop-shadow-[0_0_5px_rgba(255,215,0,0.8)]' : ''}`}>{item.icon}</span>
                <span className={`text-[9px] font-bold px-1 bg-black/50 rounded whitespace-nowrap ${RARITY_COLORS[item.rarity].split(' ')[0]}`}>{item.name}</span>
              </div>
            ))}
            {monsters.map(m => (
              <div key={m.id} className="absolute flex flex-col items-center transition-all duration-100" style={{ left: m.x, top: m.y, width: m.width, height: m.height }}>
                 <div className="w-full h-1 bg-red-900 border border-black mb-1"><div className="h-full bg-red-500" style={{ width: `${(m.hp/m.maxHp)*100}%` }}></div></div>
                 <div className={`text-3xl ${m.isBoss ? 'scale-150 filter drop-shadow-[0_0_15px_rgba(255,0,0,1)]' : m.isElite ? 'scale-125 filter drop-shadow-[0_0_8px_rgba(255,0,0,0.8)]' : ''}`}>{m.image}</div>
                 <span className={`text-[10px] font-bold whitespace-nowrap ${m.isBoss ? 'text-red-600 text-lg' : m.isElite ? 'text-yellow-500' : 'text-red-400'}`}>{m.name}</span>
              </div>
            ))}
            <div className="absolute transition-all duration-75 z-20" style={{ left: player.x, top: player.y, width: player.width, height: player.height }}>
               <span className="absolute top-[-30px] w-full text-center text-xs text-emerald-400 font-bold whitespace-nowrap z-50 drop-shadow-md bg-black/30 px-2 rounded">{player.name}</span>
               <PlayerAvatar player={player} isAttacking={isAttacking} />
            </div>
            {floatingTexts.map(ft => (
              <div key={ft.id} className={`absolute damage-text ${ft.color}`} style={{ left: ft.x, top: ft.y }}>{ft.text}</div>
            ))}
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
                <button key={m.name} onClick={(e) => { e.stopPropagation(); setActiveMap(i); setOpenMenu(null); }} className={`p-6 border-2 rounded ${activeMap === i ? 'border-amber-500 text-amber-500' : 'border-gray-600 text-gray-400'}`}>{m.name} (Lv {m.minLvl})</button>
              ))}
           </div>
        </div>
      )}

      {openMenu === 'NPC' && <NPCInteraction player={player} onClose={() => setOpenMenu(null)} onUpdatePlayer={setPlayer} addLog={addLog} onHoverItem={onHoverItem} />}

      <GameHUD player={player} onMenuClick={(m) => setOpenMenu(prev => prev === m ? null : m)} onSave={handleSaveGame} />
    </div>
  );
}
