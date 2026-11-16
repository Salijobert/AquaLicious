import React from 'react';
import { useVirtualScroll, INITIAL_LOAD } from './useVirtualScroll.js';

export interface VirtualTableBodyProps<T> {
  items: T[] | undefined | null;
  containerRef?: React.RefObject<HTMLElement | null>;
  rowHeight: number;
  colSpan: number;
  renderRow: (item: T, index: number) => React.ReactNode;
  renderSkeletonRow?: (index: number) => React.ReactNode;
  emptyRow?: React.ReactNode;
  overscan?: number;
  velocityThreshold?: number;
  fastScrollCooldownMs?: number;
}

interface MemoizedTableRowProps<T> {
  item: T;
  index: number;
  renderRow: (item: T, index: number) => React.ReactNode;
}

const MemoizedTableRow = React.memo(
  function MemoizedTableRow<T>({ item, index, renderRow }: MemoizedTableRowProps<T>) {
    return <>{renderRow(item, index)}</>;
  },
  (prev, next) => prev.item === next.item && prev.index === next.index
) as <T>(props: MemoizedTableRowProps<T>) => React.ReactElement;

export function VirtualTableBody<T>({
  items,
  containerRef,
  rowHeight,
  colSpan,
  renderRow,
  emptyRow,
  velocityThreshold = 0.8,
  fastScrollCooldownMs = 150
}: VirtualTableBodyProps<T>): React.ReactElement {
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
    itemHeight: rowHeight,
    containerRef,
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

        const stableKey =
          (item as any)?.id !== undefined
            ? (item as any).id
            : (item as any)?.date || vItem.index;

        return (
          <MemoizedTableRow
            key={stableKey}
            item={item}
            index={vItem.index}
            renderRow={renderRow}
          />
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

      {/* Accessible fallback & quiet end-of-list counter for lists > 50 items */}
      {itemCount > INITIAL_LOAD && (
        <tr className="bg-gray-50/70 border-t border-gray-200" data-testid="virtual-table-footer">
          <td colSpan={colSpan} className="text-center py-3 text-xs text-gray-500 font-medium">
            Showing <span className="font-bold text-gray-700">{visibleCount}</span> of <span className="font-bold text-gray-700">{itemCount}</span> records
            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                className="btn btn-ghost btn-xs text-[#1565c0] font-bold ml-3 border border-blue-200 hover:bg-blue-50"
              >
                Show more
              </button>
            )}
          </td>
        </tr>
      )}
    </tbody>
  );
}
