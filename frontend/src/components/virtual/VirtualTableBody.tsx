import React from 'react';
import { useVirtualScroll } from './useVirtualScroll.js';

export interface VirtualTableBodyProps<T> {
  items: T[] | undefined | null;
  containerRef: React.RefObject<HTMLElement | null>;
  rowHeight: number;
  colSpan: number;
  renderRow: (item: T, index: number) => React.ReactNode;
  renderSkeletonRow: (index: number) => React.ReactNode;
  emptyRow?: React.ReactNode;
  overscan?: number;
  velocityThreshold?: number;
  fastScrollCooldownMs?: number;
}

export function VirtualTableBody<T>({
  items,
  containerRef,
  rowHeight,
  colSpan,
  renderRow,
  renderSkeletonRow,
  emptyRow,
  overscan = 4,
  velocityThreshold = 0.6,
  fastScrollCooldownMs = 160
}: VirtualTableBodyProps<T>): React.ReactElement {
  const safeItems = items || [];
  const itemCount = safeItems.length;

  const {
    virtualItems,
    topPadding,
    bottomPadding,
    isScrollingFast,
    isScrolling
  } = useVirtualScroll({
    itemCount,
    itemHeight: rowHeight,
    containerRef,
    overscan,
    velocityThreshold,
    fastScrollCooldownMs
  });

  if (itemCount === 0) {
    return (
      <tbody data-virtual-empty="true">
        {emptyRow || (
          <tr>
            <td colSpan={colSpan} className="text-center py-8 text-gray-400">
              No records found.
            </td>
          </tr>
        )}
      </tbody>
    );
  }

  return (
    <tbody
      data-virtual-scrolling={isScrolling ? 'true' : 'false'}
      data-fast-scrolling={isScrollingFast ? 'true' : 'false'}
      data-virtual-count={itemCount}
    >
      {topPadding > 0 && (
        <tr
          style={{ height: `${topPadding}px` }}
          aria-hidden="true"
          className="border-0 p-0 pointer-events-none select-none"
        >
          <td colSpan={colSpan} className="p-0 border-0" />
        </tr>
      )}

      {virtualItems.map((vItem) => {
        const item = safeItems[vItem.index];
        if (!item) return null;

        if (isScrollingFast) {
          return (
            <React.Fragment key={`skel-${vItem.index}`}>
              {renderSkeletonRow(vItem.index)}
            </React.Fragment>
          );
        }

        return (
          <React.Fragment key={vItem.index}>
            {renderRow(item, vItem.index)}
          </React.Fragment>
        );
      })}

      {bottomPadding > 0 && (
        <tr
          style={{ height: `${bottomPadding}px` }}
          aria-hidden="true"
          className="border-0 p-0 pointer-events-none select-none"
        >
          <td colSpan={colSpan} className="p-0 border-0" />
        </tr>
      )}
    </tbody>
  );
}
