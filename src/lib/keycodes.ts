// 浏览器 KeyboardEvent.code（物理按键位置，跟键盘布局无关）
// 对应 macOS 虚拟键码（CGKeyCode）。用于让用户在设置页里“真按一下”
// 就能把物理按键采集下来，而不是在代码里假设固定是 ANSI 标准键盘。
//
// 覆盖字母、数字、常用符号和功能键——手动缩放的三个键从这里面选一个即可。
export const CODE_TO_MAC_KEYCODE: Record<string, number> = {
  KeyA: 0x00, KeyS: 0x01, KeyD: 0x02, KeyF: 0x03, KeyH: 0x04, KeyG: 0x05,
  KeyZ: 0x06, KeyX: 0x07, KeyC: 0x08, KeyV: 0x09, KeyB: 0x0b,
  KeyQ: 0x0c, KeyW: 0x0d, KeyE: 0x0e, KeyR: 0x0f, KeyY: 0x10, KeyT: 0x11,
  Digit1: 0x12, Digit2: 0x13, Digit3: 0x14, Digit4: 0x15, Digit6: 0x16,
  Digit5: 0x17, Equal: 0x18, Digit9: 0x19, Digit7: 0x1a, Minus: 0x1b,
  Digit8: 0x1c, Digit0: 0x1d, BracketRight: 0x1e, KeyO: 0x1f, KeyU: 0x20,
  BracketLeft: 0x21, KeyI: 0x22, KeyP: 0x23, KeyL: 0x25, KeyJ: 0x26,
  Quote: 0x27, KeyK: 0x28, Semicolon: 0x29, Backslash: 0x2a, Comma: 0x2b,
  Slash: 0x2c, KeyN: 0x2d, KeyM: 0x2e, Period: 0x2f, Tab: 0x30,
  Space: 0x31, Backquote: 0x32,
  F1: 0x7a, F2: 0x78, F3: 0x63, F4: 0x76, F5: 0x60, F6: 0x61,
  F7: 0x62, F8: 0x64, F9: 0x65, F10: 0x6d, F11: 0x67, F12: 0x6f,
};

/** 把物理按键码换算回一个人类看得懂的按键名，用于界面展示。 */
export function macKeyCodeLabel(code: number): string {
  const entry = Object.entries(CODE_TO_MAC_KEYCODE).find(([, v]) => v === code);
  if (!entry) return `键码 ${code}`;
  const domCode = entry[0];
  if (domCode.startsWith("Key")) return domCode.slice(3);
  if (domCode.startsWith("Digit")) return domCode.slice(5);
  return domCode;
}

/** 一部分不建议绑定为手动缩放键的物理键——会跟系统/编辑常用操作冲突。 */
export const RESERVED_CODES = new Set(["Tab", "Space", "Escape"]);
