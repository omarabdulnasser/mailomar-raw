// A long list that only renders the rows in view (plus a few around them).
// It scrolls with the page it is on, so it finds that scroll container and
// keeps track of how far below its top the list starts.

import { useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

/** The nearest ancestor that scrolls vertically. */
function scrollParent(element: HTMLElement | null): HTMLElement | null {
    for (let node = element?.parentElement; node; node = node.parentElement) {
        const { overflowY } = getComputedStyle(node);
        if (overflowY === "auto" || overflowY === "scroll") return node;
    }
    return null;
}

type Props<T> = {
    items: T[];
    getKey: (item: T) => string;
    renderItem: (item: T) => ReactNode;
    /** Rough row height in pixels; rows are measured once rendered. */
    estimateSize: number;
    gap?: number;
    /** Where the scroll container was, to restore it (e.g. when the popup reopens). */
    initialScrollTop?: number;
    onScroll?: (scrollTop: number) => void;
};

export function VirtualRows<T>({
    items,
    getKey,
    renderItem,
    estimateSize,
    gap = 0,
    initialScrollTop = 0,
    onScroll,
}: Props<T>) {
    const listRef = useRef<HTMLDivElement>(null);
    const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
    const [scrollMargin, setScrollMargin] = useState(0);

    useLayoutEffect(() => setScrollElement(scrollParent(listRef.current)), []);

    // Banners or a search field above the list move it down; follow along.
    useLayoutEffect(() => {
        const list = listRef.current;
        if (!list || !scrollElement) return;
        const margin =
            list.getBoundingClientRect().top -
            scrollElement.getBoundingClientRect().top +
            scrollElement.scrollTop;
        if (Math.abs(margin - scrollMargin) > 0.5) setScrollMargin(margin);
    });

    const virtualizer = useVirtualizer({
        count: items.length,
        getScrollElement: () => scrollElement,
        estimateSize: () => estimateSize,
        overscan: 8,
        gap,
        scrollMargin,
        getItemKey: (index) => getKey(items[index]!),
    });

    // Restore the scroll position once there is something to scroll.
    const restored = useRef(false);
    useEffect(() => {
        if (restored.current || !scrollElement || items.length === 0) return;
        restored.current = true;
        if (initialScrollTop > 0) scrollElement.scrollTop = initialScrollTop;
    }, [scrollElement, items.length, initialScrollTop]);

    useEffect(() => {
        if (!scrollElement || !onScroll) return;
        const handler = () => onScroll(scrollElement.scrollTop);
        scrollElement.addEventListener("scroll", handler, { passive: true });
        return () => scrollElement.removeEventListener("scroll", handler);
    }, [scrollElement, onScroll]);

    return (
        <div ref={listRef} style={{ position: "relative", height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((row) => (
                <div
                    key={row.key}
                    data-index={row.index}
                    ref={virtualizer.measureElement}
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${row.start - scrollMargin}px)`,
                    }}
                >
                    {renderItem(items[row.index]!)}
                </div>
            ))}
        </div>
    );
}
