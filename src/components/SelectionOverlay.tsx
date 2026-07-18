// src/components/SelectionOverlay.tsx
import { useState, useEffect } from 'preact/hooks';

interface SelectionOverlayProps {
  mode: 'box' | 'lasso';
  onComplete: (extractedText: string) => void;
  onCancel: () => void;
}

export function SelectionOverlay({ mode, onComplete, onCancel }: SelectionOverlayProps) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const [lassoPoints, setLassoPoints] = useState<{x: number, y: number}[]>([]);

  // Prevent background scrolling while the overlay canvas is active
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handlePointerDown = (e: PointerEvent) => {
    setIsDrawing(true);
    setStartPos({ x: e.clientX, y: e.clientY });
    setCurrentPos({ x: e.clientX, y: e.clientY });
    if (mode === 'lasso') setLassoPoints([{ x: e.clientX, y: e.clientY }]);
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!isDrawing) return;
    setCurrentPos({ x: e.clientX, y: e.clientY });
    if (mode === 'lasso') setLassoPoints(prev => [...prev, { x: e.clientX, y: e.clientY }]);
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
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

    // Abort if selection is too small (e.g., an accidental click)
    if (maxX - minX < 10 || maxY - minY < 10) {
      onCancel();
      return;
    }

    extractContentStrictly(minX, minY, maxX, maxY, lassoPoints);
  };

  // Ray-Casting Algorithm to determine if a point is inside a custom drawn shape
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

  const extractContentStrictly = (minX: number, minY: number, maxX: number, maxY: number, polygon: {x: number, y: number}[]) => {
    // We use a TreeWalker to grab EXACT leaf text nodes, bypassing large wrapper divs completely
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let node;
    const extractedLines: string[] = [];
    const seenTexts = new Set<string>();

    while ((node = walker.nextNode())) {
      const text = node.nodeValue?.trim();
      if (!text) continue;

      const parent = node.parentElement;
      if (!parent) continue;

      // Ignore scripts, styles, and hidden formatting elements
      const tagName = parent.tagName.toLowerCase();
      if (tagName === 'script' || tagName === 'style' || tagName === 'noscript') continue;

      const style = window.getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

      // Calculate the physical screen coordinates of the raw text alone
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = range.getClientRects();

      let isOverlapping = false;
      
      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        
        if (rect.width === 0 || rect.height === 0) continue;

        if (mode === 'box') {
          // Box Intersection Math
          if (!(rect.right < minX || rect.left > maxX || rect.bottom < minY || rect.top > maxY)) {
            isOverlapping = true;
            break;
          }
        } else if (mode === 'lasso') {
          // Lasso Polygon Math (Checks if the center of the text block is inside the drawn lasso)
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          if (isPointInPolygon({x: centerX, y: centerY}, polygon)) {
            isOverlapping = true;
            break;
          }
        }
      }

      // Append text cleanly, ignoring structural DOM wrappers
      if (isOverlapping) {
         if (!seenTexts.has(text)) {
           seenTexts.add(text);
           extractedLines.push(text);
         }
      }
    }

    const finalResult = extractedLines.join('\n').substring(0, 4000);
    onComplete(finalResult || "[Empty Selection - No text found in highlighted area]");
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={(e) => { e.preventDefault(); onCancel(); }}
      style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        backgroundColor: 'rgba(0,0,0,0.15)', cursor: 'crosshair',
        zIndex: 2147483645, touchAction: 'none'
      }}
    >
      {/* Box Drawing Render */}
      {isDrawing && mode === 'box' && (
        <div style={{
          position: 'absolute',
          left: Math.min(startPos.x, currentPos.x),
          top: Math.min(startPos.y, currentPos.y),
          width: Math.abs(currentPos.x - startPos.x),
          height: Math.abs(currentPos.y - startPos.y),
          border: '2px dashed #00FFC2', backgroundColor: 'rgba(0, 255, 194, 0.1)',
          pointerEvents: 'none'
        }} />
      )}

      {/* Free Form Lasso Render */}
      {isDrawing && mode === 'lasso' && lassoPoints.length > 0 && (
        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          <polyline
            points={lassoPoints.map(p => `${p.x},${p.y}`).join(' ')}
            fill="rgba(0, 255, 194, 0.1)" stroke="#00FFC2" strokeWidth="2" strokeDasharray="4"
          />
        </svg>
      )}

      {/* Helper Context HUD */}
      {!isDrawing && (
        <div style={{
          position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: '#121314', color: '#FFF', padding: '8px 16px', borderRadius: '20px',
          fontSize: '13px', border: '1px solid rgba(255,255,255,0.1)', pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
        }}>
          {mode === 'box' ? "Click and drag to draw a box. Right-click to cancel." : "Draw a freeform shape around the content. Right-click to cancel."}
        </div>
      )}
    </div>
  );
}