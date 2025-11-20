
import React, { useState, useEffect, useRef } from 'react';

interface DraggableWindowProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  initialPos?: { x: number; y: number };
  className?: string;
  width?: string;
  height?: string;
}

export const DraggableWindow: React.FC<DraggableWindowProps> = ({ 
  title, 
  onClose, 
  children, 
  initialPos, 
  className = '',
  width = 'w-80',
  height = 'auto'
}) => {
  // Default position roughly centered or offset
  const [pos, setPos] = useState(initialPos || { x: window.innerWidth / 2 - 200, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const windowRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    // Calculate offset from the top-left of the window
    dragStart.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      e.preventDefault();
      setPos({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y
      });
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div 
      ref={windowRef}
      className={`fixed z-40 bg-[#0a0a0a] border-2 border-[#4a4a4a] shadow-[0_0_20px_rgba(0,0,0,0.8)] flex flex-col ${width} ${className}`}
      style={{ left: pos.x, top: pos.y, height }}
    >
      {/* Header / Drag Handle */}
      <div 
        className="flex justify-between items-center bg-[#1a1a1a] border-b border-[#333] p-2 cursor-move select-none hover:bg-[#222] transition-colors"
        onMouseDown={handleMouseDown}
      >
        <span className="text-amber-500 font-bold font-sans text-sm pointer-events-none">{title}</span>
        <button 
          onClick={onClose} 
          className="text-gray-500 hover:text-white hover:bg-red-900/50 rounded px-2 transition-colors"
        >
          ✕
        </button>
      </div>
      
      {/* Content */}
      <div className="overflow-auto flex-1 relative bg-[#0a0a0a]/95">
        {children}
      </div>
    </div>
  );
};
