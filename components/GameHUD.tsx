
import React from 'react';
import { Player, ClassType } from '../types';
import { SKILLS } from '../constants';

interface GameHUDProps {
  player: Player;
  onMenuClick: (menu: string) => void;
  onSave?: () => void;
}

const GameHUD: React.FC<GameHUDProps> = ({ player, onMenuClick, onSave }) => {
  const hpPercent = (player.hp / player.maxHp) * 100;
  const manaPercent = (player.mana / player.maxMana) * 100;
  const xpPercent = (player.exp / player.nextLevelExp) * 100;
  const classSkills = SKILLS[player.class];

  return (
    <div className="fixed bottom-0 left-0 w-full h-24 bg-[#111] border-t-2 border-[#444] flex items-center justify-between px-4 z-50 select-none bg-opacity-95">
      {/* Left Orb (HP) */}
      <div className="relative w-20 h-20 md:w-28 md:h-28 -mt-8 md:-mt-12 rounded-full bg-black border-4 border-[#333] overflow-hidden shadow-[0_0_20px_rgba(255,0,0,0.5)] z-10" title="生命值">
        <div 
          className="absolute bottom-0 w-full transition-all duration-300 ease-out bg-[radial-gradient(circle_at_30%_30%,_#ff4d4d,_#990000)]"
          style={{ height: `${hpPercent}%` }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-white font-bold text-sm md:text-lg drop-shadow-md mu-font">
          {Math.floor(player.hp)}
        </span>
      </div>

      {/* Middle Bar (Skills/XP) */}
      <div className="flex-1 px-4 flex flex-col gap-2 items-center">
        
        {/* Skills Bar */}
        <div className="flex gap-2 mb-1">
          {classSkills.map((skill, index) => (
            <div key={skill.id} className="relative group">
              <div className="w-10 h-10 bg-gray-900 border border-gray-600 rounded flex items-center justify-center text-xl hover:border-amber-500 cursor-pointer shadow-inner">
                {skill.icon}
                <span className="absolute bottom-0 right-0 text-[10px] bg-black/80 text-white px-1">{index + 1}</span>
              </div>
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-32 bg-black/90 border border-amber-700 p-2 text-xs hidden group-hover:block pointer-events-none z-50">
                <div className="font-bold text-amber-500">{skill.name}</div>
                <div className="text-blue-300">魔法: {skill.manaCost}</div>
                <div className="text-gray-400">冷却: {skill.cooldown/1000}秒</div>
              </div>
            </div>
          ))}
        </div>

        {/* XP Bar */}
        <div className="w-full max-w-2xl h-2 bg-black border border-gray-600 relative rounded-full overflow-hidden">
           <div 
            className="h-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.8)]"
            style={{ width: `${xpPercent}%` }}
           />
           <div className="absolute top-0 w-full text-[9px] text-center text-white opacity-80 leading-[8px]">
             经验值 {Math.floor(player.exp)} / {player.nextLevelExp}
           </div>
        </div>

        {/* Menu Buttons */}
        <div className="flex gap-2 mt-1">
           <MenuButton label="C" title="角色 (C)" onClick={() => onMenuClick('CHARACTER')} />
           <MenuButton label="I" title="背包 (I)" onClick={() => onMenuClick('INVENTORY')} />
           <MenuButton label="M" title="地图" onClick={() => onMenuClick('MAP')} />
           <MenuButton label="Q" title="任务" onClick={() => onMenuClick('NPC')} />
           {onSave && <MenuButton label="S" title="保存进度" onClick={onSave} />}
        </div>
      </div>

      {/* Right Orb (Mana) */}
      <div className="relative w-20 h-20 md:w-28 md:h-28 -mt-8 md:-mt-12 rounded-full bg-black border-4 border-[#333] overflow-hidden shadow-[0_0_20px_rgba(0,0,255,0.5)] z-10" title="魔法值">
        <div 
          className="absolute bottom-0 w-full transition-all duration-300 ease-out bg-[radial-gradient(circle_at_30%_30%,_#4d79ff,_#000099)]"
          style={{ height: `${manaPercent}%` }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-white font-bold text-sm md:text-lg drop-shadow-md mu-font">
          {Math.floor(player.mana)}
        </span>
      </div>
    </div>
  );
};

const MenuButton: React.FC<{label: string, title: string, onClick: () => void}> = ({ label, title, onClick }) => (
  <button 
    onClick={onClick}
    className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-b from-gray-700 to-gray-900 border border-gray-500 rounded text-gray-200 font-bold hover:text-amber-400 hover:border-amber-400 active:scale-95 transition-all text-xs md:text-sm flex items-center justify-center"
    title={title}
  >
    {label}
  </button>
);

export default GameHUD;
