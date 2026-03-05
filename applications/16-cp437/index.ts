/**
 * Name: cp437
 * Description: Demonstrates that Unicode strings and raw CP437 numeric codes
 * produce identical glyphs in Primitiv.
 *
 * Layout - for each block of 16 consecutive CP437 slots:
 *   s> [16 glyphs rendered via Unicode string literals]
 *   n> [16 glyphs rendered via raw numeric CP437 codes]
 *   (blank separator)
 *
 * Both rows must look exactly the same.
 */

import {
  Engine,
  User,
  Layer,
  Display,
  OrderBuilder,
  Vector2,
  type IApplication,
  type IRuntime,
} from "@primitiv/engine";

const BG = 0;
const TITLE = 1;
const HDR = 2;
const C0 = 3;
const C1 = 4;
const C2 = 5;
const C3 = 6;
const C4 = 7;
const C5 = 8;

function cc(code: number): number {
  if (code < 0x20) return C0;
  if (code < 0x80) return C1;
  if (code < 0xa0) return C2;
  if (code < 0xc0) return C3;
  if (code < 0xe0) return C4;
  return C5;
}

const X = 2; // left column glyphs x
const XR_LBL = 20; // right column label x
const XR = 22; // right column glyphs x
const W = 16;
const DISPLAY_W = 40;
const DISPLAY_H = 2 + 8 * 3 - 1; // 25

interface Cp437UserData {
  layer: Layer;
}

export class Cp437Table implements IApplication<Engine, User<Cp437UserData>> {
  async init(runtime: IRuntime, engine: Engine): Promise<void> {
    engine.loadPaletteToSlot(0, [
      { colorId: BG, r: 10, g: 10, b: 18, a: 255 },
      { colorId: TITLE, r: 240, g: 240, b: 248, a: 255 },
      { colorId: HDR, r: 90, g: 90, b: 120, a: 255 },
      { colorId: C0, r: 80, g: 220, b: 255, a: 255 },
      { colorId: C1, r: 220, g: 220, b: 220, a: 255 },
      { colorId: C2, r: 100, g: 230, b: 130, a: 255 },
      { colorId: C3, r: 255, g: 200, b: 80, a: 255 },
      { colorId: C4, r: 100, g: 160, b: 255, a: 255 },
      { colorId: C5, r: 220, g: 110, b: 255, a: 255 },
    ]);
    runtime.setTickRate(1);
  }

  initUser(
    _runtime: IRuntime,
    _engine: Engine,
    user: User<Cp437UserData>,
  ): void {
    const display = new Display(0, DISPLAY_W, DISPLAY_H);
    user.addDisplay(display);
    display.switchPalette(0);

    display.setGrid({ enabled: true, lineWidth: 0.1, color: "#ffffff20" });

    const layer = new Layer(new Vector2(0, 0), 0, DISPLAY_W, DISPLAY_H, {
      mustBeReliable: true,
    });
    user.data.layer = layer;
    user.addLayer(layer);

    const orders: any[] = [];
    orders.push(OrderBuilder.fill(" ", BG, BG));
    orders.push(
      OrderBuilder.text(0, 0, "CP 437 - String vs Number charCode", TITLE, BG),
    );
    orders.push(OrderBuilder.text(0, 1, "─".repeat(DISPLAY_W), HDR, BG));

    // ── Group 0x00-0x0F ──
    orders.push(OrderBuilder.text(0, 2, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 2, W, 1, [
        { charCode: " ", fgColorCode: cc(0x00), bgColorCode: BG },
        { charCode: "☺", fgColorCode: cc(0x01), bgColorCode: BG },
        { charCode: "☻", fgColorCode: cc(0x02), bgColorCode: BG },
        { charCode: "♥", fgColorCode: cc(0x03), bgColorCode: BG },
        { charCode: "♦", fgColorCode: cc(0x04), bgColorCode: BG },
        { charCode: "♣", fgColorCode: cc(0x05), bgColorCode: BG },
        { charCode: "♠", fgColorCode: cc(0x06), bgColorCode: BG },
        { charCode: "•", fgColorCode: cc(0x07), bgColorCode: BG },
        { charCode: "◘", fgColorCode: cc(0x08), bgColorCode: BG },
        { charCode: "○", fgColorCode: cc(0x09), bgColorCode: BG },
        { charCode: "◙", fgColorCode: cc(0x0a), bgColorCode: BG },
        { charCode: "♂", fgColorCode: cc(0x0b), bgColorCode: BG },
        { charCode: "♀", fgColorCode: cc(0x0c), bgColorCode: BG },
        { charCode: "♪", fgColorCode: cc(0x0d), bgColorCode: BG },
        { charCode: "♫", fgColorCode: cc(0x0e), bgColorCode: BG },
        { charCode: "☼", fgColorCode: cc(0x0f), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(0, 3, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 3, W, 1, [
        { charCode: 0x00, fgColorCode: cc(0x00), bgColorCode: BG },
        { charCode: 0x01, fgColorCode: cc(0x01), bgColorCode: BG },
        { charCode: 0x02, fgColorCode: cc(0x02), bgColorCode: BG },
        { charCode: 0x03, fgColorCode: cc(0x03), bgColorCode: BG },
        { charCode: 0x04, fgColorCode: cc(0x04), bgColorCode: BG },
        { charCode: 0x05, fgColorCode: cc(0x05), bgColorCode: BG },
        { charCode: 0x06, fgColorCode: cc(0x06), bgColorCode: BG },
        { charCode: 0x07, fgColorCode: cc(0x07), bgColorCode: BG },
        { charCode: 0x08, fgColorCode: cc(0x08), bgColorCode: BG },
        { charCode: 0x09, fgColorCode: cc(0x09), bgColorCode: BG },
        { charCode: 0x0a, fgColorCode: cc(0x0a), bgColorCode: BG },
        { charCode: 0x0b, fgColorCode: cc(0x0b), bgColorCode: BG },
        { charCode: 0x0c, fgColorCode: cc(0x0c), bgColorCode: BG },
        { charCode: 0x0d, fgColorCode: cc(0x0d), bgColorCode: BG },
        { charCode: 0x0e, fgColorCode: cc(0x0e), bgColorCode: BG },
        { charCode: 0x0f, fgColorCode: cc(0x0f), bgColorCode: BG },
      ]),
    );

    // ── Group 0x10-0x1F ──
    orders.push(OrderBuilder.text(0, 5, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 5, W, 1, [
        { charCode: "►", fgColorCode: cc(0x10), bgColorCode: BG },
        { charCode: "◄", fgColorCode: cc(0x11), bgColorCode: BG },
        { charCode: "↕", fgColorCode: cc(0x12), bgColorCode: BG },
        { charCode: "‼", fgColorCode: cc(0x13), bgColorCode: BG },
        { charCode: "¶", fgColorCode: cc(0x14), bgColorCode: BG },
        { charCode: "§", fgColorCode: cc(0x15), bgColorCode: BG },
        { charCode: "▬", fgColorCode: cc(0x16), bgColorCode: BG },
        { charCode: "↨", fgColorCode: cc(0x17), bgColorCode: BG },
        { charCode: "↑", fgColorCode: cc(0x18), bgColorCode: BG },
        { charCode: "↓", fgColorCode: cc(0x19), bgColorCode: BG },
        { charCode: "→", fgColorCode: cc(0x1a), bgColorCode: BG },
        { charCode: "←", fgColorCode: cc(0x1b), bgColorCode: BG },
        { charCode: "∟", fgColorCode: cc(0x1c), bgColorCode: BG },
        { charCode: "↔", fgColorCode: cc(0x1d), bgColorCode: BG },
        { charCode: "▲", fgColorCode: cc(0x1e), bgColorCode: BG },
        { charCode: "▼", fgColorCode: cc(0x1f), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(0, 6, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 6, W, 1, [
        { charCode: 0x10, fgColorCode: cc(0x10), bgColorCode: BG },
        { charCode: 0x11, fgColorCode: cc(0x11), bgColorCode: BG },
        { charCode: 0x12, fgColorCode: cc(0x12), bgColorCode: BG },
        { charCode: 0x13, fgColorCode: cc(0x13), bgColorCode: BG },
        { charCode: 0x14, fgColorCode: cc(0x14), bgColorCode: BG },
        { charCode: 0x15, fgColorCode: cc(0x15), bgColorCode: BG },
        { charCode: 0x16, fgColorCode: cc(0x16), bgColorCode: BG },
        { charCode: 0x17, fgColorCode: cc(0x17), bgColorCode: BG },
        { charCode: 0x18, fgColorCode: cc(0x18), bgColorCode: BG },
        { charCode: 0x19, fgColorCode: cc(0x19), bgColorCode: BG },
        { charCode: 0x1a, fgColorCode: cc(0x1a), bgColorCode: BG },
        { charCode: 0x1b, fgColorCode: cc(0x1b), bgColorCode: BG },
        { charCode: 0x1c, fgColorCode: cc(0x1c), bgColorCode: BG },
        { charCode: 0x1d, fgColorCode: cc(0x1d), bgColorCode: BG },
        { charCode: 0x1e, fgColorCode: cc(0x1e), bgColorCode: BG },
        { charCode: 0x1f, fgColorCode: cc(0x1f), bgColorCode: BG },
      ]),
    );

    // ── Group 0x20-0x2F ──
    orders.push(OrderBuilder.text(0, 8, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 8, W, 1, [
        { charCode: " ", fgColorCode: cc(0x20), bgColorCode: BG },
        { charCode: "!", fgColorCode: cc(0x21), bgColorCode: BG },
        { charCode: '"', fgColorCode: cc(0x22), bgColorCode: BG },
        { charCode: "#", fgColorCode: cc(0x23), bgColorCode: BG },
        { charCode: "$", fgColorCode: cc(0x24), bgColorCode: BG },
        { charCode: "%", fgColorCode: cc(0x25), bgColorCode: BG },
        { charCode: "&", fgColorCode: cc(0x26), bgColorCode: BG },
        { charCode: "'", fgColorCode: cc(0x27), bgColorCode: BG },
        { charCode: "(", fgColorCode: cc(0x28), bgColorCode: BG },
        { charCode: ")", fgColorCode: cc(0x29), bgColorCode: BG },
        { charCode: "*", fgColorCode: cc(0x2a), bgColorCode: BG },
        { charCode: "+", fgColorCode: cc(0x2b), bgColorCode: BG },
        { charCode: ",", fgColorCode: cc(0x2c), bgColorCode: BG },
        { charCode: "-", fgColorCode: cc(0x2d), bgColorCode: BG },
        { charCode: ".", fgColorCode: cc(0x2e), bgColorCode: BG },
        { charCode: "/", fgColorCode: cc(0x2f), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(0, 9, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 9, W, 1, [
        { charCode: 0x20, fgColorCode: cc(0x20), bgColorCode: BG },
        { charCode: 0x21, fgColorCode: cc(0x21), bgColorCode: BG },
        { charCode: 0x22, fgColorCode: cc(0x22), bgColorCode: BG },
        { charCode: 0x23, fgColorCode: cc(0x23), bgColorCode: BG },
        { charCode: 0x24, fgColorCode: cc(0x24), bgColorCode: BG },
        { charCode: 0x25, fgColorCode: cc(0x25), bgColorCode: BG },
        { charCode: 0x26, fgColorCode: cc(0x26), bgColorCode: BG },
        { charCode: 0x27, fgColorCode: cc(0x27), bgColorCode: BG },
        { charCode: 0x28, fgColorCode: cc(0x28), bgColorCode: BG },
        { charCode: 0x29, fgColorCode: cc(0x29), bgColorCode: BG },
        { charCode: 0x2a, fgColorCode: cc(0x2a), bgColorCode: BG },
        { charCode: 0x2b, fgColorCode: cc(0x2b), bgColorCode: BG },
        { charCode: 0x2c, fgColorCode: cc(0x2c), bgColorCode: BG },
        { charCode: 0x2d, fgColorCode: cc(0x2d), bgColorCode: BG },
        { charCode: 0x2e, fgColorCode: cc(0x2e), bgColorCode: BG },
        { charCode: 0x2f, fgColorCode: cc(0x2f), bgColorCode: BG },
      ]),
    );

    // ── Group 0x30-0x3F ──
    orders.push(OrderBuilder.text(0, 11, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 11, W, 1, [
        { charCode: "0", fgColorCode: cc(0x30), bgColorCode: BG },
        { charCode: "1", fgColorCode: cc(0x31), bgColorCode: BG },
        { charCode: "2", fgColorCode: cc(0x32), bgColorCode: BG },
        { charCode: "3", fgColorCode: cc(0x33), bgColorCode: BG },
        { charCode: "4", fgColorCode: cc(0x34), bgColorCode: BG },
        { charCode: "5", fgColorCode: cc(0x35), bgColorCode: BG },
        { charCode: "6", fgColorCode: cc(0x36), bgColorCode: BG },
        { charCode: "7", fgColorCode: cc(0x37), bgColorCode: BG },
        { charCode: "8", fgColorCode: cc(0x38), bgColorCode: BG },
        { charCode: "9", fgColorCode: cc(0x39), bgColorCode: BG },
        { charCode: ":", fgColorCode: cc(0x3a), bgColorCode: BG },
        { charCode: ";", fgColorCode: cc(0x3b), bgColorCode: BG },
        { charCode: "<", fgColorCode: cc(0x3c), bgColorCode: BG },
        { charCode: "=", fgColorCode: cc(0x3d), bgColorCode: BG },
        { charCode: ">", fgColorCode: cc(0x3e), bgColorCode: BG },
        { charCode: "?", fgColorCode: cc(0x3f), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(0, 12, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 12, W, 1, [
        { charCode: 0x30, fgColorCode: cc(0x30), bgColorCode: BG },
        { charCode: 0x31, fgColorCode: cc(0x31), bgColorCode: BG },
        { charCode: 0x32, fgColorCode: cc(0x32), bgColorCode: BG },
        { charCode: 0x33, fgColorCode: cc(0x33), bgColorCode: BG },
        { charCode: 0x34, fgColorCode: cc(0x34), bgColorCode: BG },
        { charCode: 0x35, fgColorCode: cc(0x35), bgColorCode: BG },
        { charCode: 0x36, fgColorCode: cc(0x36), bgColorCode: BG },
        { charCode: 0x37, fgColorCode: cc(0x37), bgColorCode: BG },
        { charCode: 0x38, fgColorCode: cc(0x38), bgColorCode: BG },
        { charCode: 0x39, fgColorCode: cc(0x39), bgColorCode: BG },
        { charCode: 0x3a, fgColorCode: cc(0x3a), bgColorCode: BG },
        { charCode: 0x3b, fgColorCode: cc(0x3b), bgColorCode: BG },
        { charCode: 0x3c, fgColorCode: cc(0x3c), bgColorCode: BG },
        { charCode: 0x3d, fgColorCode: cc(0x3d), bgColorCode: BG },
        { charCode: 0x3e, fgColorCode: cc(0x3e), bgColorCode: BG },
        { charCode: 0x3f, fgColorCode: cc(0x3f), bgColorCode: BG },
      ]),
    );

    // ── Group 0x40-0x4F ──
    orders.push(OrderBuilder.text(0, 14, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 14, W, 1, [
        { charCode: "@", fgColorCode: cc(0x40), bgColorCode: BG },
        { charCode: "A", fgColorCode: cc(0x41), bgColorCode: BG },
        { charCode: "B", fgColorCode: cc(0x42), bgColorCode: BG },
        { charCode: "C", fgColorCode: cc(0x43), bgColorCode: BG },
        { charCode: "D", fgColorCode: cc(0x44), bgColorCode: BG },
        { charCode: "E", fgColorCode: cc(0x45), bgColorCode: BG },
        { charCode: "F", fgColorCode: cc(0x46), bgColorCode: BG },
        { charCode: "G", fgColorCode: cc(0x47), bgColorCode: BG },
        { charCode: "H", fgColorCode: cc(0x48), bgColorCode: BG },
        { charCode: "I", fgColorCode: cc(0x49), bgColorCode: BG },
        { charCode: "J", fgColorCode: cc(0x4a), bgColorCode: BG },
        { charCode: "K", fgColorCode: cc(0x4b), bgColorCode: BG },
        { charCode: "L", fgColorCode: cc(0x4c), bgColorCode: BG },
        { charCode: "M", fgColorCode: cc(0x4d), bgColorCode: BG },
        { charCode: "N", fgColorCode: cc(0x4e), bgColorCode: BG },
        { charCode: "O", fgColorCode: cc(0x4f), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(0, 15, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 15, W, 1, [
        { charCode: 0x40, fgColorCode: cc(0x40), bgColorCode: BG },
        { charCode: 0x41, fgColorCode: cc(0x41), bgColorCode: BG },
        { charCode: 0x42, fgColorCode: cc(0x42), bgColorCode: BG },
        { charCode: 0x43, fgColorCode: cc(0x43), bgColorCode: BG },
        { charCode: 0x44, fgColorCode: cc(0x44), bgColorCode: BG },
        { charCode: 0x45, fgColorCode: cc(0x45), bgColorCode: BG },
        { charCode: 0x46, fgColorCode: cc(0x46), bgColorCode: BG },
        { charCode: 0x47, fgColorCode: cc(0x47), bgColorCode: BG },
        { charCode: 0x48, fgColorCode: cc(0x48), bgColorCode: BG },
        { charCode: 0x49, fgColorCode: cc(0x49), bgColorCode: BG },
        { charCode: 0x4a, fgColorCode: cc(0x4a), bgColorCode: BG },
        { charCode: 0x4b, fgColorCode: cc(0x4b), bgColorCode: BG },
        { charCode: 0x4c, fgColorCode: cc(0x4c), bgColorCode: BG },
        { charCode: 0x4d, fgColorCode: cc(0x4d), bgColorCode: BG },
        { charCode: 0x4e, fgColorCode: cc(0x4e), bgColorCode: BG },
        { charCode: 0x4f, fgColorCode: cc(0x4f), bgColorCode: BG },
      ]),
    );

    // ── Group 0x50-0x5F ──
    orders.push(OrderBuilder.text(0, 17, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 17, W, 1, [
        { charCode: "P", fgColorCode: cc(0x50), bgColorCode: BG },
        { charCode: "Q", fgColorCode: cc(0x51), bgColorCode: BG },
        { charCode: "R", fgColorCode: cc(0x52), bgColorCode: BG },
        { charCode: "S", fgColorCode: cc(0x53), bgColorCode: BG },
        { charCode: "T", fgColorCode: cc(0x54), bgColorCode: BG },
        { charCode: "U", fgColorCode: cc(0x55), bgColorCode: BG },
        { charCode: "V", fgColorCode: cc(0x56), bgColorCode: BG },
        { charCode: "W", fgColorCode: cc(0x57), bgColorCode: BG },
        { charCode: "X", fgColorCode: cc(0x58), bgColorCode: BG },
        { charCode: "Y", fgColorCode: cc(0x59), bgColorCode: BG },
        { charCode: "Z", fgColorCode: cc(0x5a), bgColorCode: BG },
        { charCode: "[", fgColorCode: cc(0x5b), bgColorCode: BG },
        { charCode: "\\", fgColorCode: cc(0x5c), bgColorCode: BG },
        { charCode: "]", fgColorCode: cc(0x5d), bgColorCode: BG },
        { charCode: "^", fgColorCode: cc(0x5e), bgColorCode: BG },
        { charCode: "_", fgColorCode: cc(0x5f), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(0, 18, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 18, W, 1, [
        { charCode: 0x50, fgColorCode: cc(0x50), bgColorCode: BG },
        { charCode: 0x51, fgColorCode: cc(0x51), bgColorCode: BG },
        { charCode: 0x52, fgColorCode: cc(0x52), bgColorCode: BG },
        { charCode: 0x53, fgColorCode: cc(0x53), bgColorCode: BG },
        { charCode: 0x54, fgColorCode: cc(0x54), bgColorCode: BG },
        { charCode: 0x55, fgColorCode: cc(0x55), bgColorCode: BG },
        { charCode: 0x56, fgColorCode: cc(0x56), bgColorCode: BG },
        { charCode: 0x57, fgColorCode: cc(0x57), bgColorCode: BG },
        { charCode: 0x58, fgColorCode: cc(0x58), bgColorCode: BG },
        { charCode: 0x59, fgColorCode: cc(0x59), bgColorCode: BG },
        { charCode: 0x5a, fgColorCode: cc(0x5a), bgColorCode: BG },
        { charCode: 0x5b, fgColorCode: cc(0x5b), bgColorCode: BG },
        { charCode: 0x5c, fgColorCode: cc(0x5c), bgColorCode: BG },
        { charCode: 0x5d, fgColorCode: cc(0x5d), bgColorCode: BG },
        { charCode: 0x5e, fgColorCode: cc(0x5e), bgColorCode: BG },
        { charCode: 0x5f, fgColorCode: cc(0x5f), bgColorCode: BG },
      ]),
    );

    // ── Group 0x60-0x6F ──
    orders.push(OrderBuilder.text(0, 20, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 20, W, 1, [
        { charCode: "`", fgColorCode: cc(0x60), bgColorCode: BG },
        { charCode: "a", fgColorCode: cc(0x61), bgColorCode: BG },
        { charCode: "b", fgColorCode: cc(0x62), bgColorCode: BG },
        { charCode: "c", fgColorCode: cc(0x63), bgColorCode: BG },
        { charCode: "d", fgColorCode: cc(0x64), bgColorCode: BG },
        { charCode: "e", fgColorCode: cc(0x65), bgColorCode: BG },
        { charCode: "f", fgColorCode: cc(0x66), bgColorCode: BG },
        { charCode: "g", fgColorCode: cc(0x67), bgColorCode: BG },
        { charCode: "h", fgColorCode: cc(0x68), bgColorCode: BG },
        { charCode: "i", fgColorCode: cc(0x69), bgColorCode: BG },
        { charCode: "j", fgColorCode: cc(0x6a), bgColorCode: BG },
        { charCode: "k", fgColorCode: cc(0x6b), bgColorCode: BG },
        { charCode: "l", fgColorCode: cc(0x6c), bgColorCode: BG },
        { charCode: "m", fgColorCode: cc(0x6d), bgColorCode: BG },
        { charCode: "n", fgColorCode: cc(0x6e), bgColorCode: BG },
        { charCode: "o", fgColorCode: cc(0x6f), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(0, 21, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 21, W, 1, [
        { charCode: 0x60, fgColorCode: cc(0x60), bgColorCode: BG },
        { charCode: 0x61, fgColorCode: cc(0x61), bgColorCode: BG },
        { charCode: 0x62, fgColorCode: cc(0x62), bgColorCode: BG },
        { charCode: 0x63, fgColorCode: cc(0x63), bgColorCode: BG },
        { charCode: 0x64, fgColorCode: cc(0x64), bgColorCode: BG },
        { charCode: 0x65, fgColorCode: cc(0x65), bgColorCode: BG },
        { charCode: 0x66, fgColorCode: cc(0x66), bgColorCode: BG },
        { charCode: 0x67, fgColorCode: cc(0x67), bgColorCode: BG },
        { charCode: 0x68, fgColorCode: cc(0x68), bgColorCode: BG },
        { charCode: 0x69, fgColorCode: cc(0x69), bgColorCode: BG },
        { charCode: 0x6a, fgColorCode: cc(0x6a), bgColorCode: BG },
        { charCode: 0x6b, fgColorCode: cc(0x6b), bgColorCode: BG },
        { charCode: 0x6c, fgColorCode: cc(0x6c), bgColorCode: BG },
        { charCode: 0x6d, fgColorCode: cc(0x6d), bgColorCode: BG },
        { charCode: 0x6e, fgColorCode: cc(0x6e), bgColorCode: BG },
        { charCode: 0x6f, fgColorCode: cc(0x6f), bgColorCode: BG },
      ]),
    );

    // ── Group 0x70-0x7F ──
    orders.push(OrderBuilder.text(0, 23, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 23, W, 1, [
        { charCode: "p", fgColorCode: cc(0x70), bgColorCode: BG },
        { charCode: "q", fgColorCode: cc(0x71), bgColorCode: BG },
        { charCode: "r", fgColorCode: cc(0x72), bgColorCode: BG },
        { charCode: "s", fgColorCode: cc(0x73), bgColorCode: BG },
        { charCode: "t", fgColorCode: cc(0x74), bgColorCode: BG },
        { charCode: "u", fgColorCode: cc(0x75), bgColorCode: BG },
        { charCode: "v", fgColorCode: cc(0x76), bgColorCode: BG },
        { charCode: "w", fgColorCode: cc(0x77), bgColorCode: BG },
        { charCode: "x", fgColorCode: cc(0x78), bgColorCode: BG },
        { charCode: "y", fgColorCode: cc(0x79), bgColorCode: BG },
        { charCode: "z", fgColorCode: cc(0x7a), bgColorCode: BG },
        { charCode: "{", fgColorCode: cc(0x7b), bgColorCode: BG },
        { charCode: "|", fgColorCode: cc(0x7c), bgColorCode: BG },
        { charCode: "}", fgColorCode: cc(0x7d), bgColorCode: BG },
        { charCode: "~", fgColorCode: cc(0x7e), bgColorCode: BG },
        { charCode: "⌂", fgColorCode: cc(0x7f), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(0, 24, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(X, 24, W, 1, [
        { charCode: 0x70, fgColorCode: cc(0x70), bgColorCode: BG },
        { charCode: 0x71, fgColorCode: cc(0x71), bgColorCode: BG },
        { charCode: 0x72, fgColorCode: cc(0x72), bgColorCode: BG },
        { charCode: 0x73, fgColorCode: cc(0x73), bgColorCode: BG },
        { charCode: 0x74, fgColorCode: cc(0x74), bgColorCode: BG },
        { charCode: 0x75, fgColorCode: cc(0x75), bgColorCode: BG },
        { charCode: 0x76, fgColorCode: cc(0x76), bgColorCode: BG },
        { charCode: 0x77, fgColorCode: cc(0x77), bgColorCode: BG },
        { charCode: 0x78, fgColorCode: cc(0x78), bgColorCode: BG },
        { charCode: 0x79, fgColorCode: cc(0x79), bgColorCode: BG },
        { charCode: 0x7a, fgColorCode: cc(0x7a), bgColorCode: BG },
        { charCode: 0x7b, fgColorCode: cc(0x7b), bgColorCode: BG },
        { charCode: 0x7c, fgColorCode: cc(0x7c), bgColorCode: BG },
        { charCode: 0x7d, fgColorCode: cc(0x7d), bgColorCode: BG },
        { charCode: 0x7e, fgColorCode: cc(0x7e), bgColorCode: BG },
        { charCode: 0x7f, fgColorCode: cc(0x7f), bgColorCode: BG },
      ]),
    );

    // ── Group 0x80-0x8F (right col, y=2) ──
    orders.push(OrderBuilder.text(XR_LBL, 2, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 2, W, 1, [
        { charCode: "Ç", fgColorCode: cc(0x80), bgColorCode: BG },
        { charCode: "ü", fgColorCode: cc(0x81), bgColorCode: BG },
        { charCode: "é", fgColorCode: cc(0x82), bgColorCode: BG },
        { charCode: "â", fgColorCode: cc(0x83), bgColorCode: BG },
        { charCode: "ä", fgColorCode: cc(0x84), bgColorCode: BG },
        { charCode: "à", fgColorCode: cc(0x85), bgColorCode: BG },
        { charCode: "å", fgColorCode: cc(0x86), bgColorCode: BG },
        { charCode: "ç", fgColorCode: cc(0x87), bgColorCode: BG },
        { charCode: "ê", fgColorCode: cc(0x88), bgColorCode: BG },
        { charCode: "ë", fgColorCode: cc(0x89), bgColorCode: BG },
        { charCode: "è", fgColorCode: cc(0x8a), bgColorCode: BG },
        { charCode: "ï", fgColorCode: cc(0x8b), bgColorCode: BG },
        { charCode: "î", fgColorCode: cc(0x8c), bgColorCode: BG },
        { charCode: "ì", fgColorCode: cc(0x8d), bgColorCode: BG },
        { charCode: "Ä", fgColorCode: cc(0x8e), bgColorCode: BG },
        { charCode: "Å", fgColorCode: cc(0x8f), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(XR_LBL, 3, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 3, W, 1, [
        { charCode: 0x80, fgColorCode: cc(0x80), bgColorCode: BG },
        { charCode: 0x81, fgColorCode: cc(0x81), bgColorCode: BG },
        { charCode: 0x82, fgColorCode: cc(0x82), bgColorCode: BG },
        { charCode: 0x83, fgColorCode: cc(0x83), bgColorCode: BG },
        { charCode: 0x84, fgColorCode: cc(0x84), bgColorCode: BG },
        { charCode: 0x85, fgColorCode: cc(0x85), bgColorCode: BG },
        { charCode: 0x86, fgColorCode: cc(0x86), bgColorCode: BG },
        { charCode: 0x87, fgColorCode: cc(0x87), bgColorCode: BG },
        { charCode: 0x88, fgColorCode: cc(0x88), bgColorCode: BG },
        { charCode: 0x89, fgColorCode: cc(0x89), bgColorCode: BG },
        { charCode: 0x8a, fgColorCode: cc(0x8a), bgColorCode: BG },
        { charCode: 0x8b, fgColorCode: cc(0x8b), bgColorCode: BG },
        { charCode: 0x8c, fgColorCode: cc(0x8c), bgColorCode: BG },
        { charCode: 0x8d, fgColorCode: cc(0x8d), bgColorCode: BG },
        { charCode: 0x8e, fgColorCode: cc(0x8e), bgColorCode: BG },
        { charCode: 0x8f, fgColorCode: cc(0x8f), bgColorCode: BG },
      ]),
    );

    // ── Group 0x90-0x9F (right col, y=5) ──
    orders.push(OrderBuilder.text(XR_LBL, 5, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 5, W, 1, [
        { charCode: "É", fgColorCode: cc(0x90), bgColorCode: BG },
        { charCode: "æ", fgColorCode: cc(0x91), bgColorCode: BG },
        { charCode: "Æ", fgColorCode: cc(0x92), bgColorCode: BG },
        { charCode: "ô", fgColorCode: cc(0x93), bgColorCode: BG },
        { charCode: "ö", fgColorCode: cc(0x94), bgColorCode: BG },
        { charCode: "ò", fgColorCode: cc(0x95), bgColorCode: BG },
        { charCode: "û", fgColorCode: cc(0x96), bgColorCode: BG },
        { charCode: "ù", fgColorCode: cc(0x97), bgColorCode: BG },
        { charCode: "ÿ", fgColorCode: cc(0x98), bgColorCode: BG },
        { charCode: "Ö", fgColorCode: cc(0x99), bgColorCode: BG },
        { charCode: "Ü", fgColorCode: cc(0x9a), bgColorCode: BG },
        { charCode: "¢", fgColorCode: cc(0x9b), bgColorCode: BG },
        { charCode: "£", fgColorCode: cc(0x9c), bgColorCode: BG },
        { charCode: "¥", fgColorCode: cc(0x9d), bgColorCode: BG },
        { charCode: "₧", fgColorCode: cc(0x9e), bgColorCode: BG },
        { charCode: "ƒ", fgColorCode: cc(0x9f), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(XR_LBL, 6, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 6, W, 1, [
        { charCode: 0x90, fgColorCode: cc(0x90), bgColorCode: BG },
        { charCode: 0x91, fgColorCode: cc(0x91), bgColorCode: BG },
        { charCode: 0x92, fgColorCode: cc(0x92), bgColorCode: BG },
        { charCode: 0x93, fgColorCode: cc(0x93), bgColorCode: BG },
        { charCode: 0x94, fgColorCode: cc(0x94), bgColorCode: BG },
        { charCode: 0x95, fgColorCode: cc(0x95), bgColorCode: BG },
        { charCode: 0x96, fgColorCode: cc(0x96), bgColorCode: BG },
        { charCode: 0x97, fgColorCode: cc(0x97), bgColorCode: BG },
        { charCode: 0x98, fgColorCode: cc(0x98), bgColorCode: BG },
        { charCode: 0x99, fgColorCode: cc(0x99), bgColorCode: BG },
        { charCode: 0x9a, fgColorCode: cc(0x9a), bgColorCode: BG },
        { charCode: 0x9b, fgColorCode: cc(0x9b), bgColorCode: BG },
        { charCode: 0x9c, fgColorCode: cc(0x9c), bgColorCode: BG },
        { charCode: 0x9d, fgColorCode: cc(0x9d), bgColorCode: BG },
        { charCode: 0x9e, fgColorCode: cc(0x9e), bgColorCode: BG },
        { charCode: 0x9f, fgColorCode: cc(0x9f), bgColorCode: BG },
      ]),
    );

    // ── Group 0xA0-0xAF (right col, y=8) ──
    orders.push(OrderBuilder.text(XR_LBL, 8, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 8, W, 1, [
        { charCode: "á", fgColorCode: cc(0xa0), bgColorCode: BG },
        { charCode: "í", fgColorCode: cc(0xa1), bgColorCode: BG },
        { charCode: "ó", fgColorCode: cc(0xa2), bgColorCode: BG },
        { charCode: "ú", fgColorCode: cc(0xa3), bgColorCode: BG },
        { charCode: "ñ", fgColorCode: cc(0xa4), bgColorCode: BG },
        { charCode: "Ñ", fgColorCode: cc(0xa5), bgColorCode: BG },
        { charCode: "ª", fgColorCode: cc(0xa6), bgColorCode: BG },
        { charCode: "º", fgColorCode: cc(0xa7), bgColorCode: BG },
        { charCode: "¿", fgColorCode: cc(0xa8), bgColorCode: BG },
        { charCode: "⌐", fgColorCode: cc(0xa9), bgColorCode: BG },
        { charCode: "¬", fgColorCode: cc(0xaa), bgColorCode: BG },
        { charCode: "½", fgColorCode: cc(0xab), bgColorCode: BG },
        { charCode: "¼", fgColorCode: cc(0xac), bgColorCode: BG },
        { charCode: "¡", fgColorCode: cc(0xad), bgColorCode: BG },
        { charCode: "«", fgColorCode: cc(0xae), bgColorCode: BG },
        { charCode: "»", fgColorCode: cc(0xaf), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(XR_LBL, 9, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 9, W, 1, [
        { charCode: 0xa0, fgColorCode: cc(0xa0), bgColorCode: BG },
        { charCode: 0xa1, fgColorCode: cc(0xa1), bgColorCode: BG },
        { charCode: 0xa2, fgColorCode: cc(0xa2), bgColorCode: BG },
        { charCode: 0xa3, fgColorCode: cc(0xa3), bgColorCode: BG },
        { charCode: 0xa4, fgColorCode: cc(0xa4), bgColorCode: BG },
        { charCode: 0xa5, fgColorCode: cc(0xa5), bgColorCode: BG },
        { charCode: 0xa6, fgColorCode: cc(0xa6), bgColorCode: BG },
        { charCode: 0xa7, fgColorCode: cc(0xa7), bgColorCode: BG },
        { charCode: 0xa8, fgColorCode: cc(0xa8), bgColorCode: BG },
        { charCode: 0xa9, fgColorCode: cc(0xa9), bgColorCode: BG },
        { charCode: 0xaa, fgColorCode: cc(0xaa), bgColorCode: BG },
        { charCode: 0xab, fgColorCode: cc(0xab), bgColorCode: BG },
        { charCode: 0xac, fgColorCode: cc(0xac), bgColorCode: BG },
        { charCode: 0xad, fgColorCode: cc(0xad), bgColorCode: BG },
        { charCode: 0xae, fgColorCode: cc(0xae), bgColorCode: BG },
        { charCode: 0xaf, fgColorCode: cc(0xaf), bgColorCode: BG },
      ]),
    );

    // ── Group 0xB0-0xBF (right col, y=11) ──
    orders.push(OrderBuilder.text(XR_LBL, 11, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 11, W, 1, [
        { charCode: "░", fgColorCode: cc(0xb0), bgColorCode: BG },
        { charCode: "▒", fgColorCode: cc(0xb1), bgColorCode: BG },
        { charCode: "▓", fgColorCode: cc(0xb2), bgColorCode: BG },
        { charCode: "│", fgColorCode: cc(0xb3), bgColorCode: BG },
        { charCode: "┤", fgColorCode: cc(0xb4), bgColorCode: BG },
        { charCode: "╡", fgColorCode: cc(0xb5), bgColorCode: BG },
        { charCode: "╢", fgColorCode: cc(0xb6), bgColorCode: BG },
        { charCode: "╖", fgColorCode: cc(0xb7), bgColorCode: BG },
        { charCode: "╕", fgColorCode: cc(0xb8), bgColorCode: BG },
        { charCode: "╣", fgColorCode: cc(0xb9), bgColorCode: BG },
        { charCode: "║", fgColorCode: cc(0xba), bgColorCode: BG },
        { charCode: "╗", fgColorCode: cc(0xbb), bgColorCode: BG },
        { charCode: "╝", fgColorCode: cc(0xbc), bgColorCode: BG },
        { charCode: "╜", fgColorCode: cc(0xbd), bgColorCode: BG },
        { charCode: "╛", fgColorCode: cc(0xbe), bgColorCode: BG },
        { charCode: "┐", fgColorCode: cc(0xbf), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(XR_LBL, 12, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 12, W, 1, [
        { charCode: 0xb0, fgColorCode: cc(0xb0), bgColorCode: BG },
        { charCode: 0xb1, fgColorCode: cc(0xb1), bgColorCode: BG },
        { charCode: 0xb2, fgColorCode: cc(0xb2), bgColorCode: BG },
        { charCode: 0xb3, fgColorCode: cc(0xb3), bgColorCode: BG },
        { charCode: 0xb4, fgColorCode: cc(0xb4), bgColorCode: BG },
        { charCode: 0xb5, fgColorCode: cc(0xb5), bgColorCode: BG },
        { charCode: 0xb6, fgColorCode: cc(0xb6), bgColorCode: BG },
        { charCode: 0xb7, fgColorCode: cc(0xb7), bgColorCode: BG },
        { charCode: 0xb8, fgColorCode: cc(0xb8), bgColorCode: BG },
        { charCode: 0xb9, fgColorCode: cc(0xb9), bgColorCode: BG },
        { charCode: 0xba, fgColorCode: cc(0xba), bgColorCode: BG },
        { charCode: 0xbb, fgColorCode: cc(0xbb), bgColorCode: BG },
        { charCode: 0xbc, fgColorCode: cc(0xbc), bgColorCode: BG },
        { charCode: 0xbd, fgColorCode: cc(0xbd), bgColorCode: BG },
        { charCode: 0xbe, fgColorCode: cc(0xbe), bgColorCode: BG },
        { charCode: 0xbf, fgColorCode: cc(0xbf), bgColorCode: BG },
      ]),
    );

    // ── Group 0xC0-0xCF (right col, y=14) ──
    orders.push(OrderBuilder.text(XR_LBL, 14, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 14, W, 1, [
        { charCode: "└", fgColorCode: cc(0xc0), bgColorCode: BG },
        { charCode: "┴", fgColorCode: cc(0xc1), bgColorCode: BG },
        { charCode: "┬", fgColorCode: cc(0xc2), bgColorCode: BG },
        { charCode: "├", fgColorCode: cc(0xc3), bgColorCode: BG },
        { charCode: "─", fgColorCode: cc(0xc4), bgColorCode: BG },
        { charCode: "┼", fgColorCode: cc(0xc5), bgColorCode: BG },
        { charCode: "╞", fgColorCode: cc(0xc6), bgColorCode: BG },
        { charCode: "╟", fgColorCode: cc(0xc7), bgColorCode: BG },
        { charCode: "╚", fgColorCode: cc(0xc8), bgColorCode: BG },
        { charCode: "╔", fgColorCode: cc(0xc9), bgColorCode: BG },
        { charCode: "╩", fgColorCode: cc(0xca), bgColorCode: BG },
        { charCode: "╦", fgColorCode: cc(0xcb), bgColorCode: BG },
        { charCode: "╠", fgColorCode: cc(0xcc), bgColorCode: BG },
        { charCode: "═", fgColorCode: cc(0xcd), bgColorCode: BG },
        { charCode: "╬", fgColorCode: cc(0xce), bgColorCode: BG },
        { charCode: "╧", fgColorCode: cc(0xcf), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(XR_LBL, 15, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 15, W, 1, [
        { charCode: 0xc0, fgColorCode: cc(0xc0), bgColorCode: BG },
        { charCode: 0xc1, fgColorCode: cc(0xc1), bgColorCode: BG },
        { charCode: 0xc2, fgColorCode: cc(0xc2), bgColorCode: BG },
        { charCode: 0xc3, fgColorCode: cc(0xc3), bgColorCode: BG },
        { charCode: 0xc4, fgColorCode: cc(0xc4), bgColorCode: BG },
        { charCode: 0xc5, fgColorCode: cc(0xc5), bgColorCode: BG },
        { charCode: 0xc6, fgColorCode: cc(0xc6), bgColorCode: BG },
        { charCode: 0xc7, fgColorCode: cc(0xc7), bgColorCode: BG },
        { charCode: 0xc8, fgColorCode: cc(0xc8), bgColorCode: BG },
        { charCode: 0xc9, fgColorCode: cc(0xc9), bgColorCode: BG },
        { charCode: 0xca, fgColorCode: cc(0xca), bgColorCode: BG },
        { charCode: 0xcb, fgColorCode: cc(0xcb), bgColorCode: BG },
        { charCode: 0xcc, fgColorCode: cc(0xcc), bgColorCode: BG },
        { charCode: 0xcd, fgColorCode: cc(0xcd), bgColorCode: BG },
        { charCode: 0xce, fgColorCode: cc(0xce), bgColorCode: BG },
        { charCode: 0xcf, fgColorCode: cc(0xcf), bgColorCode: BG },
      ]),
    );

    // ── Group 0xD0-0xDF (right col, y=17) ──
    orders.push(OrderBuilder.text(XR_LBL, 17, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 17, W, 1, [
        { charCode: "╨", fgColorCode: cc(0xd0), bgColorCode: BG },
        { charCode: "╤", fgColorCode: cc(0xd1), bgColorCode: BG },
        { charCode: "╥", fgColorCode: cc(0xd2), bgColorCode: BG },
        { charCode: "╙", fgColorCode: cc(0xd3), bgColorCode: BG },
        { charCode: "╘", fgColorCode: cc(0xd4), bgColorCode: BG },
        { charCode: "╒", fgColorCode: cc(0xd5), bgColorCode: BG },
        { charCode: "╓", fgColorCode: cc(0xd6), bgColorCode: BG },
        { charCode: "╫", fgColorCode: cc(0xd7), bgColorCode: BG },
        { charCode: "╪", fgColorCode: cc(0xd8), bgColorCode: BG },
        { charCode: "┘", fgColorCode: cc(0xd9), bgColorCode: BG },
        { charCode: "┌", fgColorCode: cc(0xda), bgColorCode: BG },
        { charCode: "█", fgColorCode: cc(0xdb), bgColorCode: BG },
        { charCode: "▄", fgColorCode: cc(0xdc), bgColorCode: BG },
        { charCode: "▌", fgColorCode: cc(0xdd), bgColorCode: BG },
        { charCode: "▐", fgColorCode: cc(0xde), bgColorCode: BG },
        { charCode: "▀", fgColorCode: cc(0xdf), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(XR_LBL, 18, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 18, W, 1, [
        { charCode: 0xd0, fgColorCode: cc(0xd0), bgColorCode: BG },
        { charCode: 0xd1, fgColorCode: cc(0xd1), bgColorCode: BG },
        { charCode: 0xd2, fgColorCode: cc(0xd2), bgColorCode: BG },
        { charCode: 0xd3, fgColorCode: cc(0xd3), bgColorCode: BG },
        { charCode: 0xd4, fgColorCode: cc(0xd4), bgColorCode: BG },
        { charCode: 0xd5, fgColorCode: cc(0xd5), bgColorCode: BG },
        { charCode: 0xd6, fgColorCode: cc(0xd6), bgColorCode: BG },
        { charCode: 0xd7, fgColorCode: cc(0xd7), bgColorCode: BG },
        { charCode: 0xd8, fgColorCode: cc(0xd8), bgColorCode: BG },
        { charCode: 0xd9, fgColorCode: cc(0xd9), bgColorCode: BG },
        { charCode: 0xda, fgColorCode: cc(0xda), bgColorCode: BG },
        { charCode: 0xdb, fgColorCode: cc(0xdb), bgColorCode: BG },
        { charCode: 0xdc, fgColorCode: cc(0xdc), bgColorCode: BG },
        { charCode: 0xdd, fgColorCode: cc(0xdd), bgColorCode: BG },
        { charCode: 0xde, fgColorCode: cc(0xde), bgColorCode: BG },
        { charCode: 0xdf, fgColorCode: cc(0xdf), bgColorCode: BG },
      ]),
    );

    // ── Group 0xE0-0xEF (right col, y=20) ──
    orders.push(OrderBuilder.text(XR_LBL, 20, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 20, W, 1, [
        { charCode: "α", fgColorCode: cc(0xe0), bgColorCode: BG },
        { charCode: "ß", fgColorCode: cc(0xe1), bgColorCode: BG },
        { charCode: "Γ", fgColorCode: cc(0xe2), bgColorCode: BG },
        { charCode: "π", fgColorCode: cc(0xe3), bgColorCode: BG },
        { charCode: "Σ", fgColorCode: cc(0xe4), bgColorCode: BG },
        { charCode: "σ", fgColorCode: cc(0xe5), bgColorCode: BG },
        { charCode: "µ", fgColorCode: cc(0xe6), bgColorCode: BG },
        { charCode: "τ", fgColorCode: cc(0xe7), bgColorCode: BG },
        { charCode: "Φ", fgColorCode: cc(0xe8), bgColorCode: BG },
        { charCode: "Θ", fgColorCode: cc(0xe9), bgColorCode: BG },
        { charCode: "Ω", fgColorCode: cc(0xea), bgColorCode: BG },
        { charCode: "δ", fgColorCode: cc(0xeb), bgColorCode: BG },
        { charCode: "∞", fgColorCode: cc(0xec), bgColorCode: BG },
        { charCode: "φ", fgColorCode: cc(0xed), bgColorCode: BG },
        { charCode: "ε", fgColorCode: cc(0xee), bgColorCode: BG },
        { charCode: "∩", fgColorCode: cc(0xef), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(XR_LBL, 21, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 21, W, 1, [
        { charCode: 0xe0, fgColorCode: cc(0xe0), bgColorCode: BG },
        { charCode: 0xe1, fgColorCode: cc(0xe1), bgColorCode: BG },
        { charCode: 0xe2, fgColorCode: cc(0xe2), bgColorCode: BG },
        { charCode: 0xe3, fgColorCode: cc(0xe3), bgColorCode: BG },
        { charCode: 0xe4, fgColorCode: cc(0xe4), bgColorCode: BG },
        { charCode: 0xe5, fgColorCode: cc(0xe5), bgColorCode: BG },
        { charCode: 0xe6, fgColorCode: cc(0xe6), bgColorCode: BG },
        { charCode: 0xe7, fgColorCode: cc(0xe7), bgColorCode: BG },
        { charCode: 0xe8, fgColorCode: cc(0xe8), bgColorCode: BG },
        { charCode: 0xe9, fgColorCode: cc(0xe9), bgColorCode: BG },
        { charCode: 0xea, fgColorCode: cc(0xea), bgColorCode: BG },
        { charCode: 0xeb, fgColorCode: cc(0xeb), bgColorCode: BG },
        { charCode: 0xec, fgColorCode: cc(0xec), bgColorCode: BG },
        { charCode: 0xed, fgColorCode: cc(0xed), bgColorCode: BG },
        { charCode: 0xee, fgColorCode: cc(0xee), bgColorCode: BG },
        { charCode: 0xef, fgColorCode: cc(0xef), bgColorCode: BG },
      ]),
    );

    // ── Group 0xF0-0xFF (right col, y=23) ──
    orders.push(OrderBuilder.text(XR_LBL, 23, "s>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 23, W, 1, [
        { charCode: "≡", fgColorCode: cc(0xf0), bgColorCode: BG },
        { charCode: "±", fgColorCode: cc(0xf1), bgColorCode: BG },
        { charCode: "≥", fgColorCode: cc(0xf2), bgColorCode: BG },
        { charCode: "≤", fgColorCode: cc(0xf3), bgColorCode: BG },
        { charCode: "⌠", fgColorCode: cc(0xf4), bgColorCode: BG },
        { charCode: "⌡", fgColorCode: cc(0xf5), bgColorCode: BG },
        { charCode: "÷", fgColorCode: cc(0xf6), bgColorCode: BG },
        { charCode: "≈", fgColorCode: cc(0xf7), bgColorCode: BG },
        { charCode: "°", fgColorCode: cc(0xf8), bgColorCode: BG },
        { charCode: "∙", fgColorCode: cc(0xf9), bgColorCode: BG },
        { charCode: "·", fgColorCode: cc(0xfa), bgColorCode: BG },
        { charCode: "√", fgColorCode: cc(0xfb), bgColorCode: BG },
        { charCode: "ⁿ", fgColorCode: cc(0xfc), bgColorCode: BG },
        { charCode: "²", fgColorCode: cc(0xfd), bgColorCode: BG },
        { charCode: "■", fgColorCode: cc(0xfe), bgColorCode: BG },
        { charCode: " ", fgColorCode: cc(0xff), bgColorCode: BG },
      ]),
    );
    orders.push(OrderBuilder.text(XR_LBL, 24, "n>", HDR, BG));
    orders.push(
      OrderBuilder.subFrameMulti(XR, 24, W, 1, [
        { charCode: 0xf0, fgColorCode: cc(0xf0), bgColorCode: BG },
        { charCode: 0xf1, fgColorCode: cc(0xf1), bgColorCode: BG },
        { charCode: 0xf2, fgColorCode: cc(0xf2), bgColorCode: BG },
        { charCode: 0xf3, fgColorCode: cc(0xf3), bgColorCode: BG },
        { charCode: 0xf4, fgColorCode: cc(0xf4), bgColorCode: BG },
        { charCode: 0xf5, fgColorCode: cc(0xf5), bgColorCode: BG },
        { charCode: 0xf6, fgColorCode: cc(0xf6), bgColorCode: BG },
        { charCode: 0xf7, fgColorCode: cc(0xf7), bgColorCode: BG },
        { charCode: 0xf8, fgColorCode: cc(0xf8), bgColorCode: BG },
        { charCode: 0xf9, fgColorCode: cc(0xf9), bgColorCode: BG },
        { charCode: 0xfa, fgColorCode: cc(0xfa), bgColorCode: BG },
        { charCode: 0xfb, fgColorCode: cc(0xfb), bgColorCode: BG },
        { charCode: 0xfc, fgColorCode: cc(0xfc), bgColorCode: BG },
        { charCode: 0xfd, fgColorCode: cc(0xfd), bgColorCode: BG },
        { charCode: 0xfe, fgColorCode: cc(0xfe), bgColorCode: BG },
        { charCode: 0xff, fgColorCode: cc(0xff), bgColorCode: BG },
      ]),
    );

    layer.setOrders(orders);

  }

  updateUser(): void {
    /* static */
  }
}
