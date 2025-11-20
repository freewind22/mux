
import React, { useState } from 'react';
import { Player, Item, ItemType, ItemOption, Rarity } from '../types';
import { generateNPCResponse } from '../services/geminiService';
import { EXCELLENT_OPTIONS_POOL, RARITY_COLORS } from '../constants';
import { DraggableWindow } from './DraggableWindow';

interface NPCInteractionProps {
  player: Player;
  onClose: () => void;
  onUpdatePlayer: (newPlayer: Player) => void;
  addLog: (msg: string, type?: any) => void;
  onHoverItem: (item: Item | null, x: number, y: number, location: string) => void;
}

const NPCs = [
  { 
    name: '铁匠汉斯', 
    role: 'Blacksmith', 
    greeting: '要修理装备吗？我这里也可以拆解不需要的装备换取材料。',
    features: ['CHAT', 'DISMANTLE', 'SELL']
  },
  { 
    name: '仙踪林精灵', 
    role: 'Alchemist', 
    greeting: '玛雅哥布林的合成机器很危险... 你想试试运气合成卓越属性吗？',
    features: ['CHAT', 'SYNTHESIS', 'UPGRADE']
  },
  { 
    name: '老板娘莉雅', 
    role: 'Barmaid', 
    greeting: '旅行者，来一杯冰镇啤酒解解乏吗？',
    features: ['CHAT', 'SELL']
  }
];

const NPCInteraction: React.FC<NPCInteractionProps> = ({ player, onClose, onUpdatePlayer, addLog, onHoverItem }) => {
  const [selectedNPC, setSelectedNPC] = useState(NPCs[0]);
  const [activeTab, setActiveTab] = useState<'CHAT' | 'DISMANTLE' | 'SYNTHESIS' | 'SELL' | 'UPGRADE'>('CHAT');
  const [chatHistory, setChatHistory] = useState<{role: 'user'|'npc', text: string}[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Crafting State
  const [selectedSlotA, setSelectedSlotA] = useState<Item | null>(null); // Equipment
  const [selectedSlotB, setSelectedSlotB] = useState<Item | null>(null); // Jewel
  
  // Sell State
  const [sellRarities, setSellRarities] = useState<Rarity[]>([]);

  const handleNPCChange = (npc: typeof NPCs[0]) => {
    setSelectedNPC(npc);
    setChatHistory([]);
    setActiveTab('CHAT');
    setSelectedSlotA(null);
    setSelectedSlotB(null);
    setSellRarities([]);
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input;
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setLoading(true);
    const response = await generateNPCResponse(selectedNPC.name, player.class, player.level, userMsg);
    setChatHistory(prev => [...prev, { role: 'npc', text: response }]);
    setLoading(false);
  };

  // --- Dismantle Logic ---
  const handleDismantle = () => {
    if (!selectedSlotA) return;
    let rewardMsg = "";
    let newInventory = player.inventory.filter(i => i.id !== selectedSlotA.id);
    
    const isRare = [Rarity.BLUE, Rarity.ORANGE, Rarity.GOLD].includes(selectedSlotA.rarity);
    const chance = isRare ? 0.6 : 0.1;
    
    if (Math.random() < chance) {
        const jewelType = Math.random() > 0.5 ? '祝福宝石' : '灵魂宝石';
        const jewel: Item = {
            id: Math.random().toString(),
            name: jewelType,
            type: ItemType.JEWEL,
            rarity: Rarity.BLUE,
            level: 0,
            stats: {},
            options: [],
            icon: jewelType === '祝福宝石' ? '💎' : '🔮'
        };
        newInventory.push(jewel);
        rewardMsg = `获得: ${jewelType}`;
    } else {
        const zen = 500 * (selectedSlotA.level + 1);
        player.zen += zen;
        rewardMsg = `获得: ${zen} 金币`;
    }

    onUpdatePlayer({ ...player, inventory: newInventory, zen: player.zen });
    addLog(`拆解了 ${selectedSlotA.name}, ${rewardMsg}`, 'info');
    setSelectedSlotA(null);
  };

  // --- Synthesis Logic (Add Option) ---
  const handleSynthesis = () => {
    if (!selectedSlotA || !selectedSlotB) return;
    if (selectedSlotB.type !== ItemType.JEWEL) return;

    let newInventory = player.inventory.filter(i => i.id !== selectedSlotB.id);
    const itemIndex = newInventory.findIndex(i => i.id === selectedSlotA.id);
    
    if (itemIndex === -1) return;

    const targetItem = { ...newInventory[itemIndex] };
    const optTemplate = EXCELLENT_OPTIONS_POOL[Math.floor(Math.random() * EXCELLENT_OPTIONS_POOL.length)];
    
    if (targetItem.options.length >= 6) {
        addLog("该装备属性已满。", 'error');
        return;
    }

    const newOption: ItemOption = {
        name: optTemplate.name,
        value: optTemplate.max, 
        isPercent: optTemplate.isPercent,
        type: 'synthesis'
    };

    targetItem.options = [...targetItem.options, newOption];
    
    if (targetItem.rarity === Rarity.WHITE || targetItem.rarity === Rarity.GREEN) {
        targetItem.rarity = Rarity.BLUE;
    }

    newInventory[itemIndex] = targetItem;
    onUpdatePlayer({ ...player, inventory: newInventory });
    addLog(`玛雅合成成功! ${targetItem.name} 获得了 [${newOption.name}]`, 'loot');
    setSelectedSlotA(null);
    setSelectedSlotB(null);
  };

  // --- Upgrade Logic (+1 ~ +15) ---
  const getUpgradeReqs = (lvl: number) => {
      // Current Level -> Target Level
      // 0->1 ... 5->6 : Bless Only, 100%
      if (lvl < 6) return { bless: 1, soul: 0, maya: 0, rate: 1.0 };
      
      // 6->7 ... 8->9 : Bless + Soul, Decreasing Rate
      // 6->7: 80%, 7->8: 70%, 8->9: 60%
      if (lvl < 9) return { bless: 1, soul: 1, maya: 0, rate: 0.8 - ((lvl-6)*0.1) }; 
      
      // 9->10 ... 12->13+ : Bless + Soul + Maya
      // 9->10: 50%, 10->11: 45%, etc
      return { bless: 1, soul: 1, maya: 1, rate: Math.max(0.1, 0.5 - ((lvl-9)*0.05)) }; 
  };

  const handleUpgradeClick = () => {
      if (!selectedSlotA) return;
      const lvl = selectedSlotA.level;
      
      if (lvl >= 15) {
          addLog("装备已达最高等级!", 'error');
          return;
      }

      const reqs = getUpgradeReqs(lvl);

      const bless = player.inventory.find(i => i.name === '祝福宝石');
      const soul = player.inventory.find(i => i.name === '灵魂宝石');
      const maya = player.inventory.find(i => i.name === '玛雅之石');

      if (reqs.bless > 0 && !bless) { addLog("缺少材料: 祝福宝石", 'error'); return; }
      if (reqs.soul > 0 && !soul) { addLog("缺少材料: 灵魂宝石", 'error'); return; }
      if (reqs.maya > 0 && !maya) { addLog("缺少材料: 玛雅之石", 'error'); return; }

      // Consume Mats
      let newInv = player.inventory.filter(i => i.id !== selectedSlotA.id);
      
      // Helper to remove one instance of item
      const consume = (inv: Item[], name: string) => {
          const idx = inv.findIndex(i => i.name === name);
          if (idx > -1) inv.splice(idx, 1);
      };

      if (reqs.bless > 0) consume(newInv, '祝福宝石');
      if (reqs.soul > 0) consume(newInv, '灵魂宝石');
      if (reqs.maya > 0) consume(newInv, '玛雅之石');

      const success = Math.random() < reqs.rate;
      let resultItem = { ...selectedSlotA };

      if (success) {
          resultItem.level += 1;
          addLog(`强化成功! 装备升级为 +${resultItem.level}`, 'level');
          playDing();
      } else {
          addLog(`强化失败! 材料消失，装备保持 +${resultItem.level}`, 'error');
          playFailSound();
      }

      newInv.push(resultItem);
      onUpdatePlayer({ ...player, inventory: newInv });
      setSelectedSlotA(null); 
  };
  
  const playDing = () => {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
  };

  const playFailSound = () => {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(50, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
  };

  // --- Sell Logic ---
  const getSellPrice = (item: Item) => {
    let mult = 1;
    if (item.rarity === Rarity.GREEN) mult = 5;
    if (item.rarity === Rarity.BLUE) mult = 20;
    if (item.rarity === Rarity.ORANGE) mult = 50;
    if (item.rarity === Rarity.GOLD) mult = 100;
    return Math.floor(100 * mult * (1 + item.level * 0.2));
  };

  const toggleSellRarity = (r: Rarity) => {
    setSellRarities(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  };

  const handleBatchSell = () => {
    const itemsToSell = player.inventory.filter(item => 
        item.type !== ItemType.JEWEL &&
        sellRarities.includes(item.rarity)
    );

    if (itemsToSell.length === 0) {
        addLog("没有符合条件的装备", "error");
        return;
    }

    const totalZen = itemsToSell.reduce((sum, i) => sum + getSellPrice(i), 0);
    const newInventory = player.inventory.filter(i => !itemsToSell.includes(i));

    onUpdatePlayer({
        ...player,
        inventory: newInventory,
        zen: player.zen + totalZen
    });

    addLog(`批量出售了 ${itemsToSell.length} 件装备，获得 ${totalZen} 金币`, 'info');
    setSellRarities([]);
  };

  return (
    <DraggableWindow 
        title={`NPC 对话 - ${selectedNPC.role}`} 
        onClose={onClose} 
        width="w-[600px]" 
        height="h-[500px]"
        initialPos={{ x: window.innerWidth/2 - 300, y: window.innerHeight/2 - 250 }}
    >
        <div className="flex flex-col h-full">
        {/* NPC Selection */}
        <div className="flex p-2 bg-[#111] gap-2 overflow-x-auto border-b border-[#222]">
          {NPCs.map(npc => (
            <button
              key={npc.name}
              onClick={() => handleNPCChange(npc)}
              className={`px-3 py-1 text-xs border rounded transition-colors whitespace-nowrap ${selectedNPC.name === npc.name ? 'border-amber-500 text-amber-500 bg-amber-900/20' : 'border-gray-700 text-gray-400 hover:text-gray-200'}`}
            >
              {npc.name}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex p-2 bg-[#0f0f0f] border-b border-[#222] overflow-x-auto">
            <button onClick={() => setActiveTab('CHAT')} className={`px-3 py-1 text-sm font-bold whitespace-nowrap ${activeTab === 'CHAT' ? 'text-white underline' : 'text-gray-500'}`}>交谈</button>
            {selectedNPC.features.includes('DISMANTLE') && (
                <button onClick={() => setActiveTab('DISMANTLE')} className={`px-3 py-1 text-sm font-bold whitespace-nowrap ${activeTab === 'DISMANTLE' ? 'text-red-400 underline' : 'text-gray-500'}`}>装备拆解</button>
            )}
            {selectedNPC.features.includes('SYNTHESIS') && (
                <button onClick={() => setActiveTab('SYNTHESIS')} className={`px-3 py-1 text-sm font-bold whitespace-nowrap ${activeTab === 'SYNTHESIS' ? 'text-blue-400 underline' : 'text-gray-500'}`}>玛雅合成</button>
            )}
            {selectedNPC.features.includes('UPGRADE') && (
                <button onClick={() => setActiveTab('UPGRADE')} className={`px-3 py-1 text-sm font-bold whitespace-nowrap ${activeTab === 'UPGRADE' ? 'text-purple-400 underline' : 'text-gray-500'}`}>装备强化</button>
            )}
            {selectedNPC.features.includes('SELL') && (
                <button onClick={() => setActiveTab('SELL')} className={`px-3 py-1 text-sm font-bold whitespace-nowrap ${activeTab === 'SELL' ? 'text-yellow-400 underline' : 'text-gray-500'}`}>批量出售</button>
            )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex relative">
            
            {/* CHAT TAB */}
            {activeTab === 'CHAT' && (
                <div className="flex flex-col w-full h-full">
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0f0f0f]">
                        <div className="bg-[#1a1a1a] p-3 rounded border border-gray-800 text-amber-200 italic text-sm">
                            <span className="font-bold text-amber-500">{selectedNPC.name}:</span> {selectedNPC.greeting}
                        </div>
                        {chatHistory.map((msg, i) => (
                            <div key={i} className={`p-3 rounded text-sm ${msg.role === 'user' ? 'bg-blue-900/30 ml-8 border border-blue-900' : 'bg-[#1a1a1a] mr-8 border border-gray-800'}`}>
                            <span className={`font-bold block text-xs mb-1 ${msg.role === 'user' ? 'text-blue-400' : 'text-amber-500'}`}>
                                {msg.role === 'user' ? player.name : selectedNPC.name}
                            </span>
                            {msg.text}
                            </div>
                        ))}
                        {loading && <div className="text-xs text-gray-500 animate-pulse">思考中...</div>}
                    </div>
                    <div className="p-4 bg-[#111] border-t border-[#333] flex gap-2">
                        <input 
                            type="text" 
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder={`与 ${selectedNPC.name} 交谈...`}
                            className="flex-1 bg-black border border-gray-700 text-white px-3 py-2 text-sm focus:border-amber-500 outline-none rounded"
                        />
                        <button onClick={handleSend} disabled={loading} className="bg-amber-700 hover:bg-amber-600 text-white px-4 py-2 rounded text-sm font-bold">发送</button>
                    </div>
                </div>
            )}

            {/* UPGRADE TAB */}
            {activeTab === 'UPGRADE' && (
                 <div className="flex w-full h-full">
                    {/* Left: Anvil */}
                    <div className="w-1/2 bg-[#050505] flex flex-col items-center justify-center border-r border-[#333] relative p-4">
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] opacity-50"></div>
                        
                        <h3 className="text-purple-500 font-bold mb-4 z-10">装备强化系统</h3>
                        
                        <div 
                            className="w-24 h-24 border-2 border-purple-900 bg-black/80 flex items-center justify-center cursor-pointer relative z-10 mb-2 shadow-[0_0_20px_rgba(120,0,255,0.2)]"
                            onClick={() => setSelectedSlotA(null)}
                        >
                             {selectedSlotA ? (
                                <div className="flex flex-col items-center animate-pulse">
                                    <span className="text-4xl">{selectedSlotA.icon}</span>
                                    <span className="text-xs mt-1 text-purple-300">+{selectedSlotA.level}</span>
                                </div>
                             ) : <span className="text-gray-700 text-xs">点击选择装备</span>}
                        </div>

                        {selectedSlotA ? (
                            <div className="z-10 text-center mb-4 bg-black/60 p-2 rounded border border-purple-900/50">
                                <div className="text-xs text-gray-400 mb-1 border-b border-gray-700 pb-1">升级需求 (+{selectedSlotA.level} → +{selectedSlotA.level + 1})</div>
                                <div className="flex flex-col gap-1 mt-1">
                                    {selectedSlotA.level < 6 && <span className="text-xs text-cyan-300">💎 祝福宝石 x1</span>}
                                    {selectedSlotA.level >= 6 && selectedSlotA.level < 9 && (
                                        <>
                                            <span className="text-xs text-cyan-300">💎 祝福宝石 x1</span>
                                            <span className="text-xs text-pink-300">🔮 灵魂宝石 x1</span>
                                        </>
                                    )}
                                    {selectedSlotA.level >= 9 && (
                                        <>
                                            <span className="text-xs text-cyan-300">💎 祝福宝石 x1</span>
                                            <span className="text-xs text-pink-300">🔮 灵魂宝石 x1</span>
                                            <span className="text-xs text-blue-400">💠 玛雅之石 x1</span>
                                        </>
                                    )}
                                </div>
                                <div className="text-xs text-green-400 mt-2 font-bold">
                                    成功率: {(getUpgradeReqs(selectedSlotA.level).rate * 100).toFixed(0)}%
                                </div>
                            </div>
                        ) : (
                             <div className="z-10 text-center mb-4 p-2 text-[10px] text-gray-500">
                                 <p>+1~+6: 100% (祝福)</p>
                                 <p>+7~+9: 概率成功 (祝福+灵魂)</p>
                                 <p>+10~+13: 概率成功 (祝福+灵魂+玛雅)</p>
                             </div>
                        )}

                        <button 
                            disabled={!selectedSlotA}
                            onClick={handleUpgradeClick}
                            className="z-10 bg-gradient-to-b from-purple-900 to-purple-950 hover:from-purple-700 hover:to-purple-800 disabled:opacity-20 disabled:cursor-not-allowed text-white border border-purple-500 px-8 py-2 rounded font-bold shadow-[0_0_10px_rgba(168,85,247,0.4)]"
                        >
                            开始强化
                        </button>
                        <p className="z-10 text-[10px] text-gray-400 mt-4 text-center bg-black/40 p-1 rounded">
                            <span className="text-red-400 font-bold">!</span> 失败时材料消失，装备不降级
                        </p>
                    </div>

                    {/* Right: Inventory */}
                    <div className="w-1/2 p-2 bg-[#111] overflow-y-auto">
                         <div className="text-xs text-gray-400 mb-2 text-center">选择要强化的装备</div>
                         <div className="grid grid-cols-4 gap-1">
                            {player.inventory.filter(i => i.type !== ItemType.JEWEL).map((item, i) => (
                                <div key={i} 
                                    onClick={() => setSelectedSlotA(item)}
                                    onMouseEnter={(e) => onHoverItem(item, e.clientX, e.clientY, 'INVENTORY')}
                                    onMouseLeave={() => onHoverItem(null, 0, 0, '')}
                                    className={`h-10 w-10 border bg-black flex items-center justify-center cursor-pointer hover:bg-gray-800 relative
                                        ${selectedSlotA?.id === item.id ? 'border-purple-500 shadow-[0_0_5px_purple]' : 'border-gray-700'}
                                    `}
                                >
                                    <span className="text-lg">{item.icon}</span>
                                    <span className="absolute top-0 right-0 text-[8px] bg-black/80 px-1 text-white">+{item.level}</span>
                                </div>
                            ))}
                         </div>
                         
                         <div className="mt-4 text-xs text-gray-400 mb-2 text-center border-t border-gray-800 pt-2">持有材料</div>
                         <div className="flex justify-center gap-2">
                             {['祝福宝石', '灵魂宝石', '玛雅之石'].map(name => {
                                 const count = player.inventory.filter(i => i.name === name).length;
                                 const icon = name === '祝福宝石' ? '💎' : name === '灵魂宝石' ? '🔮' : '💠';
                                 return (
                                     <div key={name} className="flex flex-col items-center bg-black border border-gray-800 p-1 rounded w-16">
                                         <span className="text-lg">{icon}</span>
                                         <span className="text-[10px] text-gray-400">{name.slice(0,2)}</span>
                                         <span className="text-xs font-bold text-white">x{count}</span>
                                     </div>
                                 )
                             })}
                         </div>
                    </div>
                 </div>
            )}

            {/* DISMANTLE TAB */}
            {activeTab === 'DISMANTLE' && (
                <div className="flex w-full h-full">
                    <div className="w-1/2 p-4 border-r border-[#333] flex flex-col items-center justify-center bg-[#080808]">
                        <h3 className="text-red-500 font-bold mb-4">装备拆解</h3>
                        <div className="w-20 h-20 border-2 border-dashed border-gray-600 rounded flex items-center justify-center bg-black mb-4 relative cursor-pointer" onClick={() => setSelectedSlotA(null)}>
                            {selectedSlotA ? (
                                <div className="flex flex-col items-center">
                                    <span className="text-3xl">{selectedSlotA.icon}</span>
                                    <span className={`text-[9px] ${RARITY_COLORS[selectedSlotA.rarity].split(' ')[0]}`}>{selectedSlotA.name}</span>
                                </div>
                            ) : <span className="text-gray-700 text-xs">放入装备</span>}
                        </div>
                        <button 
                            disabled={!selectedSlotA}
                            onClick={handleDismantle}
                            className="bg-red-900 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white border border-red-500 px-8 py-2 rounded font-bold"
                        >
                            拆解
                        </button>
                    </div>
                    <div className="w-1/2 p-2 bg-[#111] overflow-y-auto">
                        <div className="grid grid-cols-4 gap-1">
                            {player.inventory.map((item, i) => (
                                item.type !== ItemType.JEWEL && (
                                    <div key={i} 
                                        onClick={() => setSelectedSlotA(item)}
                                        onMouseEnter={(e) => onHoverItem(item, e.clientX, e.clientY, 'INVENTORY')}
                                        onMouseLeave={() => onHoverItem(null, 0, 0, '')}
                                        className={`h-10 w-10 border bg-black flex items-center justify-center cursor-pointer hover:bg-gray-800 ${selectedSlotA?.id === item.id ? 'border-amber-500' : 'border-gray-700'}`}
                                    >
                                        <span className="text-lg">{item.icon}</span>
                                    </div>
                                )
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* SYNTHESIS TAB */}
            {activeTab === 'SYNTHESIS' && (
                <div className="flex w-full h-full">
                    {/* Left: Action Area */}
                    <div className="w-5/12 p-2 border-r border-[#333] flex flex-col items-center bg-[#080808]">
                        <h3 className="text-blue-400 font-bold mb-4 text-sm">玛雅合成</h3>
                        <div className="flex gap-2 mb-4 justify-center">
                            <div className="flex flex-col items-center gap-1">
                                <span className="text-[10px] text-gray-400">装备</span>
                                <div className="w-12 h-12 border border-blue-900 bg-black/50 flex items-center justify-center cursor-pointer" onClick={() => setSelectedSlotA(null)}>
                                    {selectedSlotA ? <span className="text-2xl">{selectedSlotA.icon}</span> : <span className="text-gray-800">+</span>}
                                </div>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                                <span className="text-[10px] text-gray-400">宝石</span>
                                <div className="w-12 h-12 border border-purple-900 bg-black/50 flex items-center justify-center cursor-pointer" onClick={() => setSelectedSlotB(null)}>
                                    {selectedSlotB ? <span className="text-2xl">{selectedSlotB.icon}</span> : <span className="text-gray-800">+</span>}
                                </div>
                            </div>
                        </div>
                        <button 
                            disabled={!selectedSlotA || !selectedSlotB}
                            onClick={handleSynthesis}
                            className="bg-blue-900 hover:bg-blue-800 text-white px-4 py-1 rounded text-xs w-full border border-blue-500"
                        >
                            合成
                        </button>
                    </div>

                    {/* Right: Inventory */}
                    <div className="w-7/12 p-0 bg-[#111] flex">
                        <div className="w-1/2 border-r border-[#333] overflow-y-auto p-1">
                            <div className="text-[10px] text-center text-gray-500 mb-1">装备</div>
                            <div className="grid grid-cols-2 gap-1">
                                {player.inventory.filter(i => i.type !== ItemType.JEWEL).map((item, i) => (
                                    <div key={i} onClick={() => setSelectedSlotA(item)} className={`h-8 w-8 border bg-black flex items-center justify-center cursor-pointer ${selectedSlotA?.id === item.id ? 'border-green-500' : 'border-gray-700'}`}>
                                        <span className="text-sm">{item.icon}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="w-1/2 overflow-y-auto p-1">
                             <div className="text-[10px] text-center text-gray-500 mb-1">宝石</div>
                            <div className="grid grid-cols-2 gap-1">
                                {player.inventory.filter(i => i.type === ItemType.JEWEL).map((item, i) => (
                                    <div key={i} onClick={() => setSelectedSlotB(item)} className={`h-8 w-8 border bg-black flex items-center justify-center cursor-pointer ${selectedSlotB?.id === item.id ? 'border-purple-500' : 'border-gray-700'}`}>
                                        <span className="text-sm">{item.icon}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* SELL TAB */}
            {activeTab === 'SELL' && (
                <div className="flex w-full h-full flex-col bg-[#080808] p-4 items-center">
                    <h3 className="text-yellow-500 font-bold mb-4">批量出售</h3>
                    <div className="space-y-2 w-full max-w-xs mb-4">
                        {[Rarity.WHITE, Rarity.GREEN, Rarity.BLUE, Rarity.ORANGE].map(rarity => (
                            <label key={rarity} className="flex items-center gap-3 cursor-pointer p-2 border border-gray-800 hover:bg-[#111] rounded">
                                <div className={`w-4 h-4 border rounded flex items-center justify-center ${sellRarities.includes(rarity) ? 'bg-yellow-600 border-yellow-400' : 'border-gray-600 bg-black'}`}>
                                    {sellRarities.includes(rarity) && <span className="text-white text-[10px]">✓</span>}
                                </div>
                                <input type="checkbox" className="hidden" checked={sellRarities.includes(rarity)} onChange={() => toggleSellRarity(rarity)} />
                                <span className={`${RARITY_COLORS[rarity].split(' ')[0]} font-bold text-sm`}>{rarity}</span>
                            </label>
                        ))}
                    </div>
                    <div className="text-center mb-4">
                         <div className="text-yellow-500 font-mono text-xl">{player.inventory.filter(i => i.type !== ItemType.JEWEL && sellRarities.includes(i.rarity)).reduce((acc, i) => acc + getSellPrice(i), 0).toLocaleString()} G</div>
                    </div>
                    <button onClick={handleBatchSell} disabled={sellRarities.length === 0} className="bg-yellow-800 text-white px-8 py-2 rounded font-bold border border-yellow-500 w-full max-w-xs disabled:opacity-50">出售</button>
                </div>
            )}

        </div>
        </div>
    </DraggableWindow>
  );
};

export default NPCInteraction;
