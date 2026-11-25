import { useState, useEffect, useRef, useCallback, startTransition } from 'react';
import { EngineType } from '../types';

export type IdeViewMode = 'editor' | 'terminal';

export interface UseDebouncedIdeLayoutOptions {
  viewMode: IdeViewMode;
  setViewMode: React.Dispatch<React.SetStateAction<IdeViewMode>>;
  engine: EngineType;
  onBeforeLeaveEditor?: () => void;
  onSettledEngineWarmup: (
    settledEngine: EngineType,
    isStale: () => boolean,
    isUserSwitch: boolean
  ) => void;
  layoutDebounceMs?: number;
  engineDebounceMs?: number;
  initialWarmDelayMs?: number;
}

function readViewportHeight(): number | null {
  if (typeof window === 'undefined') return null;
  const vvHeight = window.visualViewport?.height;
  const raw = typeof vvHeight === 'number' && vvHeight > 0 ? vvHeight : window.innerHeight;
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
}

export function useDebouncedIdeLayout({
  viewMode,
  setViewMode,
  engine,
  onBeforeLeaveEditor,
  onSettledEngineWarmup,
  layoutDebounceMs = 135,
  engineDebounceMs = 200,
  initialWarmDelayMs = 120,
}: UseDebouncedIdeLayoutOptions) {
  const layoutContainerRef = useRef<HTMLDivElement | null>(null);
  const [settledHeight, setSettledHeight] = useState<number | null>(() => readViewportHeight());
  const [isLayoutSettling, setIsLayoutSettling] = useState(false);
  const [isViewTransitioning, setIsViewTransitioning] = useState(false);
  const [isEngineTransitioning, setIsEngineTransitioning] = useState(false);

  const viewModeRef = useRef<IdeViewMode>(viewMode);
  viewModeRef.current = viewMode;

  const engineRef = useRef<EngineType>(engine);
  engineRef.current = engine;

  const engineGenerationRef = useRef(0);
  const isInitialEngineMountRef = useRef(true);
  const userTriggeredSwitchRef = useRef(false);

  const onSettledEngineWarmupRef = useRef(onSettledEngineWarmup);
  onSettledEngineWarmupRef.current = onSettledEngineWarmup;

  const onBeforeLeaveEditorRef = useRef(onBeforeLeaveEditor);
  onBeforeLeaveEditorRef.current = onBeforeLeaveEditor;

  // 1. Debounced viewport / layout event listener (resize, visualViewport, orientationchange)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let debounceTimer: number | null = null;
    let rafId: number | null = null;
    let settleEndTimer: number | null = null;
    let disposed = false;

    const applySettledLayout = () => {
      if (disposed) return;
      const nextHeight = readViewportHeight();
      if (nextHeight !== null) {
        if (layoutContainerRef.current) {
          layoutContainerRef.current.style.setProperty('--ide-viewport-height', `${nextHeight}px`);
        }
        setSettledHeight((prev) => (prev === nextHeight ? prev : nextHeight));
      }
      if (settleEndTimer !== null) {
        window.clearTimeout(settleEndTimer);
      }
      settleEndTimer = window.setTimeout(() => {
        if (!disposed) {
          setIsLayoutSettling(false);
        }
      }, 60);
    };

    const handleDebouncedViewportEvent = () => {
      if (disposed) return;
      setIsLayoutSettling(true);

      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
      }
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }

      debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          applySettledLayout();
        });
      }, layoutDebounceMs);
    };

    // Sync initial height without marking settling
    const initialHeight = readViewportHeight();
    if (initialHeight !== null && layoutContainerRef.current) {
      layoutContainerRef.current.style.setProperty('--ide-viewport-height', `${initialHeight}px`);
    }

    window.addEventListener('resize', handleDebouncedViewportEvent, { passive: true });
    window.addEventListener('orientationchange', handleDebouncedViewportEvent, { passive: true });

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', handleDebouncedViewportEvent, { passive: true });
      vv.addEventListener('scroll', handleDebouncedViewportEvent, { passive: true });
    }

    return () => {
      disposed = true;
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      if (settleEndTimer !== null) window.clearTimeout(settleEndTimer);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleDebouncedViewportEvent);
      window.removeEventListener('orientationchange', handleDebouncedViewportEvent);
      if (vv) {
        vv.removeEventListener('resize', handleDebouncedViewportEvent);
        vv.removeEventListener('scroll', handleDebouncedViewportEvent);
      }
    };
  }, [layoutDebounceMs]);

  // 2. Coalesced / debounced view mode switching (Editor <-> Terminal)
  const viewSwitchTimerRef = useRef<number | null>(null);
  const viewSettleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (viewSwitchTimerRef.current !== null) window.clearTimeout(viewSwitchTimerRef.current);
      if (viewSettleTimerRef.current !== null) window.clearTimeout(viewSettleTimerRef.current);
    };
  }, []);

  const requestViewModeChange = useCallback(
    (nextMode: IdeViewMode, options?: { immediate?: boolean }) => {
      const immediate = !!options?.immediate;
      if (viewModeRef.current === nextMode && viewSwitchTimerRef.current === null) {
        return;
      }

      if (viewSwitchTimerRef.current !== null) {
        window.clearTimeout(viewSwitchTimerRef.current);
        viewSwitchTimerRef.current = null;
      }

      // Cleanly dismiss editor soft keyboard before transitioning to terminal to avoid IME layout thrash
      if (viewModeRef.current === 'editor' && nextMode === 'terminal') {
        onBeforeLeaveEditorRef.current?.();
      }

      const commitSwitch = () => {
        setIsViewTransitioning(true);
        startTransition(() => {
          setViewMode(nextMode);
        });
        if (viewSettleTimerRef.current !== null) {
          window.clearTimeout(viewSettleTimerRef.current);
        }
        viewSettleTimerRef.current = window.setTimeout(() => {
          setIsViewTransitioning(false);
        }, 140);
      };

      if (immediate) {
        commitSwitch();
      } else {
        setIsViewTransitioning(true);
        viewSwitchTimerRef.current = window.setTimeout(() => {
          viewSwitchTimerRef.current = null;
          commitSwitch();
        }, 45);
      }
    },
    [setViewMode]
  );

  // 3. Debounced CPython <-> Pyodide engine transition warmup controller
  const markUserEngineSwitch = useCallback(() => {
    userTriggeredSwitchRef.current = true;
    engineGenerationRef.current += 1;
    setIsEngineTransitioning(true);
  }, []);

  useEffect(() => {
    const isInitialMount = isInitialEngineMountRef.current;
    isInitialEngineMountRef.current = false;

    const isUserSwitch = userTriggeredSwitchRef.current;
    userTriggeredSwitchRef.current = false;

    const generation = isUserSwitch
      ? engineGenerationRef.current
      : ++engineGenerationRef.current;

    if (!isInitialMount) {
      setIsEngineTransitioning(true);
    }

    const delayMs = isInitialMount ? initialWarmDelayMs : engineDebounceMs;
    const isStale = () =>
      engineGenerationRef.current !== generation || engineRef.current !== engine;

    const timer = window.setTimeout(() => {
      if (isStale()) return;
      setIsEngineTransitioning(false);
      onSettledEngineWarmupRef.current(engine, isStale, isUserSwitch);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [engine, engineDebounceMs, initialWarmDelayMs]);

  return {
    layoutContainerRef,
    settledHeight,
    isLayoutSettling,
    isViewTransitioning,
    isEngineTransitioning,
    requestViewModeChange,
    markUserEngineSwitch,
    latestEngineRef: engineRef,
  };
}
