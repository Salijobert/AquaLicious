import React from 'react';
import { useVirtualScroll } from './useVirtualScroll.js';

export interface VirtualCardListProps<T> {
  items: T[] | undefined | null;
  containerRef?: React.RefObject<HTMLElement | null>;
  itemHeight?: number;
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
  itemHeight = 210,
  renderItem,
  renderSkeletonItem,
  emptyContent,
  className = 'space-y-4',
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
    isScrolling,
    visibleCount,
    hasMore,
    loadMore
  } = useVirtualScroll({
    itemCount,
    itemHeight,
    containerRef,
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

        const stableKey = (item as any)?.id !== undefined ? (item as any).id : vItem.index;

        return (
          <React.Fragment key={stableKey}>
            {renderItem(item, vItem.index)}
          </React.Fragment>
        );
      })}

      {/* Accessible fallback & counter for lists > 40 items */}
      {itemCount > 40 && (
        <div className="text-center py-4 text-xs text-gray-500 font-medium">
          Showing <span className="font-bold text-gray-700">{visibleCount}</span> of <span className="font-bold text-gray-700">{itemCount}</span> items
          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              className="btn btn-outline btn-xs ml-3 text-[#1565c0] border-blue-200 hover:bg-blue-50"
            >
              Show more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
