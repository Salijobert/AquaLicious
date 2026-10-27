import React from 'react';
import { useVirtualScroll } from './useVirtualScroll.js';

export interface VirtualCardListProps<T> {
  items: T[] | undefined | null;
  containerRef: React.RefObject<HTMLElement | null>;
  itemHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  renderSkeletonItem: (index: number) => React.ReactNode;
  emptyContent?: React.ReactNode;
  className?: string;
  overscan?: number;
  velocityThreshold?: number;
  fastScrollCooldownMs?: number;
}

export function VirtualCardList<T>({
  items,
  containerRef,
  itemHeight,
  renderItem,
  renderSkeletonItem,
  emptyContent,
  className = 'space-y-4',
  overscan = 3,
  velocityThreshold = 0.6,
  fastScrollCooldownMs = 160
}: VirtualCardListProps<T>): React.ReactElement {
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
    itemHeight,
    containerRef,
    overscan,
    velocityThreshold,
    fastScrollCooldownMs
  });

  if (itemCount === 0) {
    return (
      <div data-virtual-empty="true">
        {emptyContent || (
          <div className="card text-center py-16 text-gray-400">
            <p className="text-sm font-semibold">No records found.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        paddingTop: `${topPadding}px`,
        paddingBottom: `${bottomPadding}px`
      }}
      data-virtual-scrolling={isScrolling ? 'true' : 'false'}
      data-fast-scrolling={isScrollingFast ? 'true' : 'false'}
      data-virtual-count={itemCount}
    >
      {virtualItems.map((vItem) => {
        const item = safeItems[vItem.index];
        if (!item) return null;

        if (isScrollingFast) {
          return (
            <React.Fragment key={`skel-${vItem.index}`}>
              {renderSkeletonItem(vItem.index)}
            </React.Fragment>
          );
        }

        return (
          <React.Fragment key={vItem.index}>
            {renderItem(item, vItem.index)}
          </React.Fragment>
        );
      })}
    </div>
  );
}
