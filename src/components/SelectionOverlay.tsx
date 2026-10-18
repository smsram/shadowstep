/**
 * @file SelectionOverlay.tsx
 * @description Renders an interactive visual canvas overlay for precise spatial data extraction.
 * Operates in either a rectangular bounding box or free-form lasso mode.
 * Automatically captures the viewport sub-region via HTML5 Canvas / chrome.tabs.captureVisibleTab,
 * crops to the selected coordinates, converts to Base64, and attaches it directly.
 * 
 * @dependencies
 * - Preact Hooks (useState, useEffect) for state and pointer event tracking.
 */
import { useState } from 'preact/hooks';

export interface ExtractedSelection {
  text: string;
  imageBase64: string;
  mode: 'box' | 'lasso';
  coordinates: { minX: number; minY: number; maxX: number; maxY: number };
}

interface SelectionOverlayProps {
  mode: 'box' | 'lasso';
  onComplete: (selection: ExtractedSelection) => void;
  onCancel: () => void;
}

export function SelectionOverlay({ mode, onComplete, onCancel }: SelectionOverlayProps) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const [lassoPoints, setLassoPoints] = useState<{x: number, y: number}[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);

  // Removed host page body style mutations to ensure zero bleed into the host document

  const handlePointerDown = (e: PointerEvent) => {
    if (isCapturing) return;
    setIsDrawing(true);
    setStartPos({ x: e.clientX, y: e.clientY });
    setCurrentPos({ x: e.clientX, y: e.clientY });
    if (mode === 'lasso') setLassoPoints([{ x: e.clientX, y: e.clientY }]);
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!isDrawing || isCapturing) return;
    setCurrentPos({ x: e.clientX, y: e.clientY });
    if (mode === 'lasso') setLassoPoints(prev => [...prev, { x: e.clientX, y: e.clientY }]);
  };

  const handlePointerUp = async () => {
    if (!isDrawing || isCapturing) return;
    setIsDrawing(false);

    let minX = 0, maxX = 0, minY = 0, maxY = 0;

    if (mode === 'box') {
      minX = Math.min(startPos.x, currentPos.x);
      maxX = Math.max(startPos.x, currentPos.x);
      minY = Math.min(startPos.y, currentPos.y);
      maxY = Math.max(startPos.y, currentPos.y);
    } else {
      if (lassoPoints.length < 3) {
        onCancel();
        return;
      }
      minX = Math.min(...lassoPoints.map(p => p.x));
      maxX = Math.max(...lassoPoints.map(p => p.x));
      minY = Math.min(...lassoPoints.map(p => p.y));
      maxY = Math.max(...lassoPoints.map(p => p.y));
    }

    if (maxX - minX < 10 || maxY - minY < 10) {
      onCancel();
      return;
    }

    setIsCapturing(true);

    // 1. Extract DOM leaf text nodes strictly overlapping the selection area
    const domText = extractContentStrictly(minX, minY, maxX, maxY, lassoPoints);

    // 2. Capture viewport via chrome.tabs.captureVisibleTab and crop with Canvas
    let croppedBase64 = '';
    try {
      croppedBase64 = await captureAndCropSubregion(minX, minY, maxX, maxY, lassoPoints);
    } catch (err) {
      console.warn("[ShadowStep] Viewport crop failed:", err);
    }

    onComplete({
      text: domText,
      imageBase64: croppedBase64,
      mode,
      coordinates: { minX, minY, maxX, maxY }
    });
  };

  // Ray-Casting Algorithm to determine if a point is inside a custom drawn polygon
  const isPointInPolygon = (point: {x: number, y: number}, vs: {x: number, y: number}[]) => {
    let x = point.x, y = point.y;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      let xi = vs[i].x, yi = vs[i].y;
      let xj = vs[j].x, yj = vs[j].y;
      let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const extractContentStrictly = (
    minX: number, 
    minY: number, 
    maxX: number, 
    maxY: number, 
    polygon: {x: number, y: number}[]
  ): string => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let node;
    const extractedLines: string[] = [];
    const seenTexts = new Set<string>();

    while ((node = walker.nextNode())) {
      const text = node.nodeValue?.trim();
      if (!text) continue;

      const parent = node.parentElement;
      if (!parent) continue;

      // Skip script, style, and ShadowStep UI elements
      if (parent.closest('#shadowstep-root')) continue;
      const tagName = parent.tagName.toLowerCase();
      if (tagName === 'script' || tagName === 'style' || tagName === 'noscript') continue;

      const style = window.getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = range.getClientRects();

      let isOverlapping = false;
      
      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        if (rect.width === 0 || rect.height === 0) continue;

        if (mode === 'box') {
          if (!(rect.right < minX || rect.left > maxX || rect.bottom < minY || rect.top > maxY)) {
            isOverlapping = true;
            break;
          }
        } else if (mode === 'lasso') {
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          if (isPointInPolygon({x: centerX, y: centerY}, polygon)) {
            isOverlapping = true;
            break;
          }
        }
      }

      if (isOverlapping) {
        if (!seenTexts.has(text)) {
          seenTexts.add(text);
          extractedLines.push(text);
        }
      }
    }

    return extractedLines.join('\n').substring(0, 4000);
  };

  /**
   * Captures the visible tab screenshot, crops the selected sub-region via HTML5 Canvas,
   * clips to the polygon if in lasso mode, and returns the Base64 PNG.
   */
  const captureAndCropSubregion = async (
    minX: number, 
    minY: number, 
    maxX: number, 
    maxY: number,
    polygon: {x: number, y: number}[]
  ): Promise<string> => {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        return resolve('');
      }

      chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' }, async (response: any) => {
        if (!response?.success || !response?.dataUrl) {
          return resolve('');
        }

        try {
          const img = new Image();
          img.onload = () => {
            const dpr = window.devicePixelRatio || 1;
            const cropWidth = Math.max(1, (maxX - minX) * dpr);
            const cropHeight = Math.max(1, (maxY - minY) * dpr);
            const sourceX = minX * dpr;
            const sourceY = minY * dpr;

            const canvas = document.createElement('canvas');
            canvas.width = Math.round(cropWidth);
            canvas.height = Math.round(cropHeight);
            const ctx = canvas.getContext('2d');

            if (!ctx) return resolve('');

            // If lasso mode with sufficient vertices, clip canvas to polygon
            if (mode === 'lasso' && polygon.length >= 3) {
              ctx.beginPath();
              ctx.moveTo((polygon[0].x - minX) * dpr, (polygon[0].y - minY) * dpr);
              for (let i = 1; i < polygon.length; i++) {
                ctx.lineTo((polygon[i].x - minX) * dpr, (polygon[i].y - minY) * dpr);
              }
              ctx.closePath();
              ctx.clip();
            }

            // Draw and crop sub-region
            ctx.drawImage(
              img,
              sourceX, sourceY, cropWidth, cropHeight,
              0, 0, canvas.width, canvas.height
            );

            const croppedBase64 = canvas.toDataURL('image/png');
            resolve(croppedBase64);
          };

          img.onerror = () => resolve('');
          img.src = response.dataUrl;
        } catch {
          resolve('');
        }
      });
    });
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={(e) => { e.preventDefault(); onCancel(); }}
      style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        backgroundColor: 'rgba(0,0,0,0.2)', cursor: isCapturing ? 'wait' : 'crosshair',
        zIndex: 2147483645, touchAction: 'none'
      }}
    >
      {isDrawing && mode === 'box' && (
        <div style={{
          position: 'absolute',
          left: Math.min(startPos.x, currentPos.x),
          top: Math.min(startPos.y, currentPos.y),
          width: Math.abs(currentPos.x - startPos.x),
          height: Math.abs(currentPos.y - startPos.y),
          border: '2px dashed #00FFC2', backgroundColor: 'rgba(0, 255, 194, 0.15)',
          boxShadow: '0 0 15px rgba(0, 255, 194, 0.35)',
          pointerEvents: 'none'
        }} />
      )}

      {isDrawing && mode === 'lasso' && lassoPoints.length > 0 && (
        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          <polyline
            points={lassoPoints.map(p => `${p.x},${p.y}`).join(' ')}
            fill="rgba(0, 255, 194, 0.15)" stroke="#00FFC2" strokeWidth="2" strokeDasharray="4"
          />
        </svg>
      )}

      {!isDrawing && !isCapturing && (
        <div style={{
          position: 'absolute', top: '24px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: '#121314', color: '#FFF', padding: '10px 20px', borderRadius: '24px',
          fontSize: '13px', fontWeight: 500, border: '1px solid rgba(0, 255, 194, 0.35)', pointerEvents: 'none',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#00FFC2' }} />
          {mode === 'box' ? "Click and drag to crop screen region. Right-click to cancel." : "Draw freeform lasso around screen target. Right-click to cancel."}
        </div>
      )}

      {isCapturing && (
        <div style={{
          position: 'absolute', top: '24px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: '#121314', color: '#00FFC2', padding: '10px 20px', borderRadius: '24px',
          fontSize: '13px', fontWeight: 500, border: '1px solid #00FFC2', pointerEvents: 'none',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', border: '2px solid rgba(0, 255, 194, 0.2)', borderTopColor: '#00FFC2', animation: 'spin 0.8s linear infinite' }} />
          Capturing & cropping viewport sub-region...
        </div>
      )}
    </div>
  );
}