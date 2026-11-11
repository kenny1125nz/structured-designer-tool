import { useState, useEffect } from "react";

// ---------------------------------------------------------------------------
// Layout model — sidebar widths and resize drag state.
// ---------------------------------------------------------------------------

export interface LayoutModel {
  leftSidebarWidth: number;
  rightSidebarWidth: number;
  isResizingLeft: boolean;
  isResizingRight: boolean;
  startResizeLeft: () => void;
  startResizeRight: () => void;
}

export function useLayoutModel(): LayoutModel {
  const [leftSidebarWidth, setLeftSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem("left-sidebar-width");
    return saved ? parseInt(saved, 10) : 224;
  });
  const [rightSidebarWidth, setRightSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem("right-sidebar-width");
    return saved ? parseInt(saved, 10) : 300;
  });
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  // Persist widths to localStorage.
  useEffect(() => {
    localStorage.setItem("left-sidebar-width", leftSidebarWidth.toString());
  }, [leftSidebarWidth]);

  useEffect(() => {
    localStorage.setItem("right-sidebar-width", rightSidebarWidth.toString());
  }, [rightSidebarWidth]);

  // Left sidebar drag.
  useEffect(() => {
    if (!isResizingLeft) return;
    const onMove = (e: MouseEvent) =>
      setLeftSidebarWidth(Math.max(160, Math.min(500, e.clientX)));
    const onUp = () => setIsResizingLeft(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isResizingLeft]);

  // Right sidebar drag.
  useEffect(() => {
    if (!isResizingRight) return;
    const onMove = (e: MouseEvent) =>
      setRightSidebarWidth(
        Math.max(200, Math.min(500, window.innerWidth - e.clientX)),
      );
    const onUp = () => setIsResizingRight(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isResizingRight]);

  return {
    leftSidebarWidth,
    rightSidebarWidth,
    isResizingLeft,
    isResizingRight,
    startResizeLeft: () => setIsResizingLeft(true),
    startResizeRight: () => setIsResizingRight(true),
  };
}
