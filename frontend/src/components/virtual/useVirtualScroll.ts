import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

export const INITIAL_LOAD = 40;
export const CHUNK_SIZE = 40;
export const SCROLL_LOAD_AHEAD_PX = 250;

export interface UseVirtualScrollOptions {
  itemCount: number;
  itemHeight?: number;
  containerRef?: React.RefObject<HTMLElement | null>;
  overscan?: number;
  velocityThreshold?: number;
  fastScrollCooldownMs?: number;
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
  visibleCount: number;
  hasMore: boolean;
  loadMore: () => void;
}

export function useVirtualScroll({
  itemCount,
  itemHeight = 52,
  containerRef,
  velocityThreshold = 0.6,
  fastScrollCooldownMs = 160
}: UseVirtualScrollOptions): UseVirtualScrollReturn {
  const [visibleCount, setVisibleCount] = useState<number>(() =>
    itemCount <= INITIAL_LOAD ? itemCount : INITIAL_LOAD
  );
  const [scrollTop, setScrollTop] = useState(0);
  const [isScrollingFast, setIsScrollingFast] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);

  const prevItemCountRef = useRef(itemCount);
  const isTriggeringRef = useRef(false);
  const lastScrollTop = useRef(0);
  const lastScrollTime = useRef(performance.now());
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // If item count changes (e.g. search filter applied or data refreshed), reset or clamp
  useEffect(() => {
    if (itemCount !== prevItemCountRef.current) {
      prevItemCountRef.current = itemCount;
      if (itemCount <= INITIAL_LOAD) {
        setVisibleCount(itemCount);
      } else {
        setVisibleCount(INITIAL_LOAD);
      }
    }
  }, [itemCount]);

  const hasMore = visibleCount < itemCount;

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(itemCount, prev + CHUNK_SIZE));
  }, [itemCount]);

  // Handle scroll listeners ONLY when list has > 40 items AND hasMore is true
  useEffect(() => {
    // If list has 40 items or fewer, or all chunks are already loaded, DO NOT attach any listeners
    if (itemCount <= INITIAL_LOAD || !hasMore) {
      return;
    }

    const container = containerRef?.current;
    const target: EventTarget = container || window;

    const handleScroll = () => {
      const now = performance.now();
      let currentScrollTop = 0;
      let scrollHeight = 0;
      let clientHeight = 0;

      if (container) {
        currentScrollTop = container.scrollTop;
        scrollHeight = container.scrollHeight;
        clientHeight = container.clientHeight;
      } else {
        currentScrollTop = window.scrollY || document.documentElement.scrollTop;
        scrollHeight = document.documentElement.scrollHeight;
        clientHeight = window.innerHeight;
      }

      const deltaY = Math.abs(currentScrollTop - lastScrollTop.current);
      const deltaTime = Math.max(1, now - lastScrollTime.current);
      const velocity = deltaY / deltaTime;

      lastScrollTop.current = currentScrollTop;
      lastScrollTime.current = now;
      setScrollTop(currentScrollTop);
      setIsScrolling(true);

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

      // Check if user scrolled near the end of the loaded list (within 200-300px)
      const distanceFromBottom = scrollHeight - (currentScrollTop + clientHeight);
      if (distanceFromBottom <= SCROLL_LOAD_AHEAD_PX && !isTriggeringRef.current) {
        isTriggeringRef.current = true;
        setVisibleCount((prev) => Math.min(itemCount, prev + CHUNK_SIZE));
        setTimeout(() => {
          isTriggeringRef.current = false;
        }, 100);
      }
    };

    target.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      target.removeEventListener('scroll', handleScroll);
      if (cooldownTimer.current) {
        clearTimeout(cooldownTimer.current);
      }
    };
  }, [containerRef, itemCount, hasMore, itemHeight, velocityThreshold, fastScrollCooldownMs]);

  // Compute virtual items for the visible count
  const virtualItems: VirtualItem[] = useMemo(() => {
    const count = Math.min(itemCount, visibleCount);
    const items: VirtualItem[] = [];
    for (let i = 0; i < count; i++) {
      items.push({
        index: i,
        start: i * itemHeight,
        size: itemHeight
      });
    }
    return items;
  }, [itemCount, visibleCount, itemHeight]);

  const totalSize = useMemo(() => itemCount * itemHeight, [itemCount, itemHeight]);

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = 'smooth') => {
      const container = containerRef?.current;
      const targetTop = Math.max(0, index * itemHeight);
      if (container) {
        container.scrollTo({ top: targetTop, behavior });
      } else {
        window.scrollTo({ top: targetTop, behavior });
      }
    },
    [containerRef, itemHeight]
  );

  return {
    virtualItems,
    totalSize,
    topPadding: 0,
    bottomPadding: 0,
    startIndex: 0,
    endIndex: Math.max(0, virtualItems.length - 1),
    isScrollingFast,
    isScrolling,
    scrollTop,
    scrollToIndex,
    visibleCount,
    hasMore,
    loadMore
  };
}
