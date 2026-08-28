import { useEffect, useRef, useState } from "react";
import { emit } from "@tauri-apps/api/event";

type Rect = { x: number; y: number; width: number; height: number };

/**
 * 全屏（覆盖所选显示器）的透明选区遮罩：窗口 label 为 "picker"。
 * 拖拽画一个矩形，松开鼠标即把「相对该窗口左上角」的矩形通过 area-picked 事件回传给后端。
 * 后端已经把这个窗口精确定位/缩放到所选显示器的范围，所以窗口内的本地坐标就是需要的坐标。
 */
export default function PickerPage() {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") emit("area-picked", { cancelled: true });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onMouseDown(e: React.MouseEvent) {
    dragging.current = true;
    setStart({ x: e.clientX, y: e.clientY });
    setRect({ x: e.clientX, y: e.clientY, width: 0, height: 0 });
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragging.current || !start) return;
    const x = Math.min(start.x, e.clientX);
    const y = Math.min(start.y, e.clientY);
    const width = Math.abs(e.clientX - start.x);
    const height = Math.abs(e.clientY - start.y);
    setRect({ x, y, width, height });
  }

  function onMouseUp() {
    dragging.current = false;
    if (rect && rect.width > 16 && rect.height > 16) {
      emit("area-picked", rect);
    }
  }

  return (
    <div
      className="picker-overlay"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      <div className="picker-hint">拖拽画出要录制的区域，按 Esc 取消</div>
      {rect && rect.width > 0 && (
        <div className="picker-rect" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}>
          <span>{Math.round(rect.width)} × {Math.round(rect.height)}</span>
        </div>
      )}
    </div>
  );
}
