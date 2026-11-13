import React from 'react';
import { formatPeso } from './currency.js';

export const PAYMENT_MOCK_QR_ENABLED =
  typeof import.meta !== 'undefined' && (import.meta as any).env
    ? (import.meta as any).env.VITE_PAYMENT_MOCK_QR_ENABLED !== 'false'
    : true;

/**
 * Deterministically generates a 25x25 QR-like matrix SVG based on order number and amount.
 * Zero external dependencies, zero network requests, pure local SVG.
 */
function generateQrMatrix(text: string): boolean[][] {
  const size = 25;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // Helper to draw standard 7x7 finder patterns
  const drawFinder = (startX: number, startY: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (
          r === 0 || r === 6 || c === 0 || c === 6 || // Outer ring
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)      // Inner 3x3 block
        ) {
          matrix[startY + r][startX + c] = true;
        } else {
          matrix[startY + r][startX + c] = false;
        }
      }
    }
  };

  // 1. Top-left, Top-right, Bottom-left finder patterns
  drawFinder(0, 0);
  drawFinder(size - 7, 0);
  drawFinder(0, size - 7);

  // 2. Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // 3. Deterministic pseudo-random payload pattern based on input string
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Skip finder zones
      const isTopLeft = r < 8 && c < 8;
      const isTopRight = r < 8 && c >= size - 8;
      const isBottomLeft = r >= size - 8 && c < 8;
      const isTiming = r === 6 || c === 6;

      if (!isTopLeft && !isTopRight && !isBottomLeft && !isTiming) {
        // Linear congruential generator step
        hash = (Math.imul(hash, 1103515245) + 12345) & 0x7fffffff;
        matrix[r][c] = (hash % 100) > 48;
      }
    }
  }

  return matrix;
}

interface MockQrProps {
  orderNumber: string;
  amount: string | number;
  className?: string;
}

export const MockQrDisplay: React.FC<MockQrProps> = ({ orderNumber, amount, className = '' }) => {
  const qrPayload = `AQUALICIOUS:${orderNumber}:PHP:${Number(amount).toFixed(2)}`;
  const matrix = React.useMemo(() => generateQrMatrix(qrPayload), [qrPayload]);
  const size = matrix.length;
  const cellSize = 8;
  const svgSize = size * cellSize;

  return (
    <div className={`mock-qr-container flex flex-col items-center p-4 bg-white rounded-2xl border border-gray-200 shadow-sm ${className}`}>
      {/* Demo QR Notice Banner */}
      {PAYMENT_MOCK_QR_ENABLED && (
        <div className="w-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold px-3 py-2 rounded-xl mb-3 text-center leading-snug">
          ⚠️ Demo QR — not a real payment. Replace with the station&apos;s e-wallet QR before launch.
        </div>
      )}

      {/* SVG QR Code */}
      <div className="p-3 bg-white rounded-xl border border-gray-300 shadow-inner">
        <svg
          viewBox={`0 0 ${svgSize} ${svgSize}`}
          className="w-48 h-48 sm:w-56 sm:h-56 block mx-auto"
          role="img"
          aria-label={`Mock E-Wallet QR Code for Order ${orderNumber}`}
        >
          <rect width={svgSize} height={svgSize} fill="#ffffff" />
          {matrix.map((row, rIdx) =>
            row.map((cell, cIdx) =>
              cell ? (
                <rect
                  key={`${rIdx}-${cIdx}`}
                  x={cIdx * cellSize}
                  y={rIdx * cellSize}
                  width={cellSize}
                  height={cellSize}
                  fill="#0b3d91"
                />
              ) : null
            )
          )}
        </svg>
      </div>

      <div className="mt-3 text-center">
        <div className="font-mono text-xs font-bold text-gray-500">#{orderNumber}</div>
        <div className="text-xl font-black text-[#0b3d91]">{formatPeso(amount)}</div>
        <div className="text-[11px] text-gray-400 mt-0.5">Scan with GCash, Maya, or any QRPH-supported e-wallet</div>
      </div>
    </div>
  );
};
