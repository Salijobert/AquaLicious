import React from 'react';

interface GraphicProps {
  className?: string;
  category?: string;
  name?: string;
}

export const BottleGraphic: React.FC<GraphicProps> = ({ className = "w-24 h-24", category = "", name = "" }) => {
  const lowerName = (name + ' ' + category).toLowerCase();

  // 1. Slim Container / Slim Refill
  if (lowerName.includes('slim')) {
    return (
      <div className={`relative flex items-center justify-center p-2 rounded-2xl bg-gradient-to-b from-[#e3f2fd]/80 to-[#bbdefb]/40 ${className}`}>
        <svg viewBox="0 0 100 130" className="w-full h-full drop-shadow-md">
          {/* Blue Cap */}
          <rect x="42" y="8" width="16" height="8" rx="2" fill="#0b3d91" />
          <rect x="40" y="14" width="20" height="4" rx="1" fill="#1565c0" />
          {/* Neck */}
          <rect x="44" y="18" width="12" height="8" fill="#90caf9" />
          {/* Bottle Body (Slim rectangular profile) */}
          <rect x="25" y="26" width="50" height="92" rx="8" fill="#e1f5fe" stroke="#0288d1" strokeWidth="2.5" />
          {/* Water Fill Level */}
          <rect x="28" y="44" width="44" height="71" rx="5" fill="#4fc3f7" fillOpacity="0.4" />
          {/* Slim Molded Handle */}
          <rect x="18" y="45" width="9" height="36" rx="4.5" fill="#e1f5fe" stroke="#0288d1" strokeWidth="2" />
          <rect x="21" y="52" width="3" height="22" rx="1.5" fill="white" />
          {/* Water Surface Wave */}
          <path d="M 28 46 Q 39 42, 50 46 T 72 46 L 72 49 L 28 49 Z" fill="#29b6f6" fillOpacity="0.6" />
          {/* Front Label Stamp */}
          <rect x="36" y="62" width="28" height="28" rx="4" fill="white" fillOpacity="0.85" stroke="#81d4fa" strokeWidth="1" />
          <circle cx="50" cy="73" r="6" fill="#1565c0" />
          <path d="M 50 69 C 48 72, 47 74, 47 76 A 3 3 0 0 0 53 76 C 53 74, 52 72, 50 69 Z" fill="white" />
          <rect x="40" y="82" width="20" height="3" rx="1" fill="#0288d1" />
          {/* Highlight Glare */}
          <path d="M 67 36 L 69 36 L 69 110 L 67 110 Z" fill="white" fillOpacity="0.7" />
        </svg>
      </div>
    );
  }

  // 2. Round Container / Round Refill
  if (lowerName.includes('round')) {
    return (
      <div className={`relative flex items-center justify-center p-2 rounded-2xl bg-gradient-to-b from-[#e3f2fd]/80 to-[#bbdefb]/40 ${className}`}>
        <svg viewBox="0 0 100 130" className="w-full h-full drop-shadow-md">
          {/* Blue Dispenser Cap */}
          <rect x="42" y="8" width="16" height="8" rx="2" fill="#0b3d91" />
          <rect x="40" y="14" width="20" height="4" rx="1" fill="#1565c0" />
          {/* Neck */}
          <rect x="43" y="18" width="14" height="10" fill="#90caf9" />
          {/* Round Shoulder */}
          <path d="M 43 28 C 34 32, 22 42, 22 55 L 22 108 C 22 116, 28 120, 36 120 L 64 120 C 72 120, 78 116, 78 108 L 78 55 C 78 42, 66 32, 57 28 Z" fill="#e1f5fe" stroke="#0288d1" strokeWidth="2.5" />
          {/* Water Fill Level */}
          <path d="M 24 58 L 24 108 C 24 114, 30 118, 38 118 L 62 118 C 70 118, 76 114, 76 108 L 76 58 Z" fill="#4fc3f7" fillOpacity="0.4" />
          {/* Round Ribbed Indentations */}
          <line x1="28" y1="68" x2="72" y2="68" stroke="#81d4fa" strokeWidth="2" strokeDasharray="3 3" />
          <line x1="28" y1="84" x2="72" y2="84" stroke="#81d4fa" strokeWidth="2" strokeDasharray="3 3" />
          <line x1="28" y1="100" x2="72" y2="100" stroke="#81d4fa" strokeWidth="2" strokeDasharray="3 3" />
          {/* Front Label Stamp */}
          <circle cx="50" cy="76" r="14" fill="white" fillOpacity="0.85" stroke="#81d4fa" strokeWidth="1" />
          <circle cx="50" cy="76" r="9" fill="#1565c0" />
          <path d="M 50 71 C 48 74, 46 76, 46 78 A 4 4 0 0 0 54 78 C 54 76, 52 74, 50 71 Z" fill="white" />
          {/* Highlight Glare */}
          <path d="M 72 48 C 74 54, 74 65, 74 72" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.8" />
        </svg>
      </div>
    );
  }

  // 3. Bottled Water (500ml / 1L / 1.5L / Mineral / Purified bottle)
  if (lowerName.includes('bottle') || lowerName.includes('500ml') || lowerName.includes('1l') || lowerName.includes('purified') || lowerName.includes('mineral')) {
    return (
      <div className={`relative flex items-center justify-center p-2 rounded-2xl bg-gradient-to-b from-[#e3f2fd]/80 to-[#bbdefb]/40 ${className}`}>
        <svg viewBox="0 0 100 130" className="w-full h-full drop-shadow-md">
          {/* Cap */}
          <rect x="44" y="10" width="12" height="7" rx="1.5" fill="#1565c0" />
          <rect x="43" y="16" width="14" height="3" rx="1" fill="#0b3d91" />
          {/* Neck */}
          <rect x="46" y="19" width="8" height="8" fill="#b3e5fc" />
          {/* Bottle Body */}
          <path d="M 46 27 C 38 32, 34 38, 34 48 L 34 110 C 34 116, 38 118, 44 118 L 56 118 C 62 118, 66 116, 66 110 L 66 48 C 66 38, 62 32, 54 27 Z" fill="#e1f5fe" stroke="#0288d1" strokeWidth="2.5" />
          {/* Water Fill */}
          <path d="M 36 48 L 36 110 C 36 114, 40 116, 45 116 L 55 116 C 60 116, 64 114, 64 110 L 64 48 Z" fill="#4fc3f7" fillOpacity="0.45" />
          {/* Grip Ribs */}
          <path d="M 36 70 Q 50 72, 64 70" stroke="#81d4fa" strokeWidth="1.5" fill="none" />
          <path d="M 36 76 Q 50 78, 64 76" stroke="#81d4fa" strokeWidth="1.5" fill="none" />
          <path d="M 36 82 Q 50 84, 64 82" stroke="#81d4fa" strokeWidth="1.5" fill="none" />
          {/* Brand Band */}
          <rect x="35" y="88" width="30" height="16" rx="2" fill="#1565c0" fillOpacity="0.9" />
          <text x="50" y="99" textAnchor="middle" fill="white" fontSize="6" fontWeight="bold" fontFamily="sans-serif">AQUA</text>
        </svg>
      </div>
    );
  }

  // 4. Dispenser / Tap / Accessories Default
  return (
    <div className={`relative flex items-center justify-center p-2 rounded-2xl bg-gradient-to-b from-[#e3f2fd]/80 to-[#bbdefb]/40 ${className}`}>
      <svg viewBox="0 0 100 130" className="w-full h-full drop-shadow-md">
        <circle cx="50" cy="65" r="32" fill="#e1f5fe" stroke="#0288d1" strokeWidth="2.5" />
        <path d="M 50 40 C 44 48, 38 56, 38 68 A 12 12 0 0 0 62 68 C 62 56, 56 48, 50 40 Z" fill="#1e88e5" />
        <circle cx="56" cy="66" r="3" fill="white" opacity="0.8" />
        <rect x="42" y="102" width="16" height="5" rx="2" fill="#0b3d91" />
      </svg>
    </div>
  );
};
