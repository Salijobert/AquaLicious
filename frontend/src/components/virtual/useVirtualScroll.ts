import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

export interface UseVirtualScrollOptions {
  itemCount: number;
  itemHeight: number;
  containerRef: React.RefObject<HTMLElement | null>;
  overscan?: number;
  velocityThreshold?: number; // px per ms (default: 0.6)
  fastScrollCooldownMs?: number; // ms to keep skeleton after rapid scroll stops (default: 160)
}

export interface VirtualItem {
  index: number;
  start: number;
  size: number;
}

export interface UseVirtualScrollReturn {
  virtualItems: VirtualItem[];
  totalSize: number;
  topPadding: number;
  bottomPadding: number;
  startIndex: number;
  endIndex: number;
  isScrollingFast: boolean;
  isScrolling: boolean;
  scrollTop: number;
  scrollToIndex: (index: number, behavior?: ScrollBehavior) => void;
}

export function useVirtualScroll({
  itemCount,
  itemHeight,
  containerRef,
  overscan = 4,
  velocityThreshold = 0.6,
  fastScrollCooldownMs = 160
}: UseVirtualScrollOptions): UseVirtualScrollReturn {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(400);
  const [isScrollingFast, setIsScrollingFast] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);

  const lastScrollTop = useRef(0);
  const lastScrollTime = useRef(performance.now());
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Total scrollable height
  const totalSize = useMemo(() => itemCount * itemHeight, [itemCount, itemHeight]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Initial measurement
    if (container.clientHeight > 0) {
      setViewportHeight(container.clientHeight);
    }
    setScrollTop(container.scrollTop);
    lastScrollTop.current = container.scrollTop;
    lastScrollTime.current = performance.now();

    const handleScroll = () => {
      const now = performance.now();
      const currentScrollTop = container.scrollTop;
      const deltaY = Math.abs(currentScrollTop - lastScrollTop.current);
      const deltaTime = Math.max(1, now - lastScrollTime.current);
      const velocity = deltaY / deltaTime; // px per ms

      lastScrollTop.current = currentScrollTop;
      lastScrollTime.current = now;
      setScrollTop(currentScrollTop);
      setIsScrolling(true);

      // Trigger fast scroll skeleton if velocity exceeds threshold or sudden large jump
      if (velocity > velocityThreshold || deltaY > itemHeight * 5) {
        setIsScrollingFast(true);
      }

      if (cooldownTimer.current) {
        clearTimeout(cooldownTimer.current);
      }
      cooldownTimer.current = setTimeout(() => {
        setIsScrollingFast(false);
        setIsScrolling(false);
      }, fastScrollCooldownMs);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    // Measure viewport resize
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.height > 0) {
            setViewportHeight(entry.contentRect.height);
          }
        }
      });
      resizeObserver.observe(container);
    }

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (cooldownTimer.current) {
        clearTimeout(cooldownTimer.current);
      }
    };
  }, [containerRef, itemHeight, velocityThreshold, fastScrollCooldownMs]);

  // Calculate visible range with overscan
  const { startIndex, endIndex, virtualItems, topPadding, bottomPadding } = useMemo(() => {
    if (itemCount === 0) {
      return {
        startIndex: 0,
        endIndex: 0,
        virtualItems: [],
        topPadding: 0,
        bottomPadding: 0
      };
    }

    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const end = Math.min(
      itemCount - 1,
      Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan
    );

    const items: VirtualItem[] = [];
    for (let i = start; i <= end; i++) {
      items.push({
        index: i,
        start: i * itemHeight,
        size: itemHeight
      });
    }

    const top = start * itemHeight;
    const bottom = Math.max(0, (itemCount - 1 - end) * itemHeight);

    return {
      startIndex: start,
      endIndex: end,
      virtualItems: items,
      topPadding: top,
      bottomPadding: bottom
    };
  }, [scrollTop, viewportHeight, itemCount, itemHeight, overscan]);

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = 'smooth') => {
      const container = containerRef.current;
      if (!container) return;
      const targetTop = Math.max(0, Math.min(index * itemHeight, totalSize - viewportHeight));
      container.scrollTo({ top: targetTop, behavior });
    },
    [containerRef, itemHeight, totalSize, viewportHeight]
  );

  return {
    virtualItems,
    totalSize,
    topPadding,
    bottomPadding,
    startIndex,
    endIndex,
    isScrollingFast,
    isScrolling,
    scrollTop,
    scrollToIndex
  };
}
