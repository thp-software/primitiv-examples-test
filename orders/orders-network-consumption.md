# Order Network Weight Reference (OrderBuilder)

This document describes the binary network cost for each order exposed by `OrderBuilder`.
It is designed to help quickly assess the bandwidth impact of any given order, so you can
choose the most efficient approach for your use-case.

- **Header (fixed overhead)**: bytes always present for this order, regardless of content.
- **Dynamic payload**: variable bytes depending on the data sent.

## Conventions

- `C = charCode size`
  - **8-bit** mode: `C = 1`
  - **16-bit** mode: `C = 2`
- `N = number of elements` (points, cells, sprites, etc.)
- All sizes are in **bytes**.
- Bandwidth estimates assume **60 ticks/s** unless stated otherwise.
- Encoding reference: `packages/core/src/encoding/OrderEncoder.ts`

## Protocol limits

- `U8` fields: max `255`
- `U16` fields: max `65 535`
- `x`, `y`, `spriteId`, `fg`, `bg` are encoded as `U8`
- `width`/`height` encoded as `(value - 1)` on `U8` → range **1..256**
- `Text`/`TextMultiline`: length encoded on `U8` → **0..255 UTF-8 bytes**
- `Polyline`: `pointCount` encoded on `U8` → **0..255 points**
- `DotCloud*` / `SpriteCloud*`: `count` encoded on `U16` → **0..65 535 elements**
- `Bitmask4`: exactly **3 variants** (enforced by `OrderBuilder`)
- `Bitmask16`: **0..15 variants** (max 15 enforced by `OrderBuilder`; 0 is technically accepted)
- `FullFrame*`: `N = layerWidth × layerHeight`, protocol allows **1..256** per dimension
- Validity assumption: array lengths match what the decoder expects (e.g. `frame` of size `width×height`).

---

## 1) Char

- **Method**: `char(...)`
- **Type**: `OrderType.Char`
- **Description**: draws a single character at `(x, y)`.
- **Header**: `5 + C`
  - `type(1) + x(1) + y(1) + char(C) + bg(1) + fg(1)`
- **Dynamic payload**: `0`

> **Example 1 - cursor blink:** Displaying a blinking cursor character at position (40, 12) in 8-bit mode costs **6 bytes** per tick. At 60 ticks/s this is only **360 B/s** - essentially free bandwidth-wise. This makes `Char` ideal for single-cell indicators, cursors, or small UI markers.
>
> **Example 2 - 16-bit character:** The same cursor in 16-bit mode (e.g. CJK character) costs **7 bytes** per tick, still negligible at **420 B/s**.

## 2) Text

- **Method**: `text(...)`
- **Type**: `OrderType.Text`
- **Description**: draws a single line of text.
- **Header**: `6`
  - `type(1) + x(1) + y(1) + len(1) + bg(1) + fg(1)`
- **Dynamic payload**: `L` (UTF-8 encoded length)

> **Example 1 - short label:** Rendering `"Hello World"` (11 UTF-8 bytes) costs `6 + 11` = **17 bytes** per tick. At 60 ticks/s: ~**1 KB/s**. Very cheap for HUD labels or player names.
>
> **Example 2 - long status message:** A line like `"Player 1 captured the flag! Final score: 9001"` (45 UTF-8 bytes) costs `6 + 45` = **51 bytes** per tick, still under **3 KB/s** at 60 ticks/s.

## 3) TextMultiline

- **Method**: `textMultiline(...)`
- **Type**: `OrderType.TextMultiline`
- **Description**: draws multi-line text.
- **Header**: `6`
- **Dynamic payload**: `L` (UTF-8 encoded length)

> **Example 1 - chat message:** A 3-line chat message totalling 80 UTF-8 bytes costs `6 + 80` = **86 bytes** per tick. At 60 ticks/s: ~**5 KB/s**.
>
> **Example 2 - quest description:** A larger paragraph of 200 UTF-8 bytes costs `6 + 200` = **206 bytes** per tick (~**12 KB/s**). Still lightweight since text orders don't carry per-character color data - if you need per-character colors you'd need `SubFrameMulti` instead, which would be far heavier.

## 4) SubFrame

- **Method**: `subFrame(...)`
- **Type**: `OrderType.SubFrame`
- **Description**: draws a monochrome `width × height` block (same fg/bg for all cells, but different characters).
- **Header**: `7`
  - `type + x + y + (w-1) + (h-1) + bg + fg`
- **Dynamic payload**: `N × C`, where `N = width × height`

> **Example 1 - small UI panel:** A 10×5 inventory panel in 8-bit mode: `7 + (50 × 1)` = **57 bytes** per tick. At 60 ticks/s: ~**3.3 KB/s**. Good for monochrome widgets with varying characters.
>
> **Example 2 - large game viewport:** A 40×20 map section in 8-bit: `7 + (800 × 1)` = **807 bytes** per tick → ~**47 KB/s** at 60 ticks/s. If you need per-cell colors, use `SubFrameMulti` instead (but at 3× the payload cost per cell).

## 5) SubFrameMulti

- **Method**: `subFrameMulti(...)`
- **Type**: `OrderType.SubFrameMulti`
- **Description**: draws a `width × height` block with per-cell character and colors.
- **Header**: `5`
  - `type + x + y + (w-1) + (h-1)`
- **Dynamic payload**: `N × (C + 2)`
  - per cell: `char(C) + bg(1) + fg(1)`

> **Example 1 - colorful 10×5 panel:** In 8-bit: `5 + (50 × 3)` = **155 bytes** per tick → ~**9 KB/s** at 60 ticks/s. That's 2.7× more expensive than the monochrome `SubFrame` equivalent, but gives full per-cell color control.
>
> **Example 2 - large 80×40 viewport:** `5 + (3 200 × 3)` = **9 605 bytes** per tick. At 60 ticks/s: ~**563 KB/s**. This is a heavy order - consider whether a `FullFrameMulti` (which saves 4 header bytes but covers the whole layer) or a `Bitmask4`/`Bitmask16` (dramatically cheaper if your content uses only a few distinct cell variants) would be a better fit.

## 6) FullFrame

- **Method**: `fullFrame(...)`
- **Type**: `OrderType.FullFrame`
- **Description**: fills the entire layer with different characters but a single fg/bg pair.
- **Header**: `3`
  - `type + bg + fg`
- **Dynamic payload**: `N × C`
  - `N = layerWidth × layerHeight`

> **Example 1 - 80×40 terminal layer:** `3 + (3 200 × 1)` = **3 203 bytes** in 8-bit → ~**188 KB/s** at 60 ticks/s. This is the go-to for monochrome full-screen rendering (e.g. ASCII art backgrounds).
>
> **Example 2 - small 20×10 overlay layer:** `3 + (200 × 1)` = **203 bytes** → ~**12 KB/s**. Layer dimensions greatly affect cost - a quarter-size layer costs a quarter as much.

## 7) FullFrameMulti

- **Method**: `fullFrameMulti(...)`
- **Type**: `OrderType.FullFrameMulti`
- **Description**: fills the entire layer with per-cell character and colors. The heaviest single order in the protocol.
- **Header**: `1`
  - `type`
- **Dynamic payload**: `N × (C + 2)`

> **Example 1 - 80×40 layer, full color:** `1 + (3 200 × 3)` = **9 601 bytes** → ~**563 KB/s** at 60 ticks/s. This is the most expensive order: it redraws every cell with individual colors. Avoid sending this every tick if possible - prefer partial updates (`SubFrameMulti`, `ColorMap`) or `Bitmask` variants for scenes that don't change entirely each frame.
>
> **Example 2 - small 16×8 HUD layer:** `1 + (128 × 3)` = **385 bytes** → ~**23 KB/s**. On small layers, `FullFrameMulti` is perfectly acceptable and simpler than managing partial updates.

## 8) Sprite

- **Method**: `sprite(...)`
- **Type**: `OrderType.Sprite`
- **Description**: draws a tinted monochrome sprite (sprite recolored with bg/fg).
- **Header**: `6`
  - `type + x + y + spriteId + bg + fg`
- **Dynamic payload**: `0`

> **Example 1 - 20 enemies on screen:** Each `Sprite` is only **6 bytes**, so 20 enemies = `20 × 6` = **120 bytes** per tick → ~**7 KB/s**. Sprites are one of the cheapest positioned orders because the character data is stored client-side.
>
> **Example 2 - 200 particles:** Even 200 sprite particles cost only `200 × 6` = **1 200 bytes** per tick → ~**70 KB/s**. For bulk same-sprite rendering, consider `SpriteCloud` instead, which saves 4 bytes per extra sprite after the first.

## 9) SpriteMulti

- **Method**: `spriteMulti(...)`
- **Type**: `OrderType.SpriteMulti`
- **Description**: draws a full-color sprite (sprite has embedded colors, no tinting).
- **Header**: `4`
  - `type + x + y + spriteId`
- **Dynamic payload**: `0`

> **Example 1 - full-color UI icons:** A toolbar with 8 full-color sprite icons: `8 × 4` = **32 bytes** per tick → under **2 KB/s**. Even more minimal than tinted `Sprite` since no color bytes are sent.
>
> **Example 2 - animated character:** A single character sprite that updates its position every tick costs just **4 bytes**. At 60 ticks/s: **240 B/s** - virtually unnoticeable on the wire.

## 10) ColorMap

- **Method**: `colorMap(...)`
- **Type**: `OrderType.ColorMap`
- **Description**: applies fg/bg colors to an area without changing characters. Useful to highlight or dim regions on top of existing content.
- **Header**: `5`
  - `type + x + y + (w-1) + (h-1)`
- **Dynamic payload**: `N × 2`
  - per cell: `bg(1) + fg(1)`

> **Example 1 - highlighting a 10×3 selection:** `5 + (30 × 2)` = **65 bytes** per tick → ~**4 KB/s**. A cheap way to add a color overlay (e.g. text selection, hover highlight) without resending character data.
>
> **Example 2 - full-layer color override (80×40):** `5 + (3 200 × 2)` = **6 405 bytes** → ~**375 KB/s**. Cheaper than `FullFrameMulti` (~563 KB/s) when you only need to change colors and keep existing characters intact.

## 11) Shape (rect, circle, line, triangle, ellipse)

The network type is a single `OrderType.Shape`, but the size depends on the `shapeType` sub-field. All shapes are **zero-payload** (header only), making them extremely cheap.

### 11.1 Rect
- **Method**: `rect(...)`
- **Header**: `9 + C`
  - `type + shapeType + x + y + (w-1) + (h-1) + filled + char(C) + bg + fg`
- **Dynamic payload**: `0`

> **Example:** A filled 20×10 rectangle in 8-bit: **10 bytes**. Using `boxWithBorder(...)` (composite: 2 rectangle orders) costs `2 × 10` = **20 bytes** - still trivial. Compare to a `SubFrame` of the same area: 7 + 200 = 207 bytes. The `rect` is ~20× cheaper because the renderer generates the cells client-side.

### 11.2 Circle
- **Method**: `circle(...)`
- **Header**: `8 + C`
  - `type + shapeType + x + y + (radius-1) + filled + char(C) + bg + fg`
- **Dynamic payload**: `0`

> **Example:** A circle with radius 10 in 8-bit costs **9 bytes** - the same whether the radius is 1 or 128. All rasterization happens client-side. Perfect for HUD radar circles, spell effects, etc.

### 11.3 Line
- **Method**: `line(...)`
- **Header**: `8 + C`
  - `type + shapeType + x1 + y1 + x2 + y2 + char(C) + bg + fg`
- **Dynamic payload**: `0`

> **Example:** A diagonal line from (0,0) to (79,39) in 8-bit: **9 bytes**. A grid made of 10 horizontal + 10 vertical lines = `20 × 9` = **180 bytes**. Still cheaper than a `SubFrame` if the grid is large.

### 11.4 Triangle
- **Method**: `triangle(...)`
- **Header**: `11 + C`
  - `type + shapeType + x1 + y1 + x2 + y2 + x3 + y3 + filled + char(C) + bg + fg`
- **Dynamic payload**: `0`

> **Example:** A filled warning triangle in 8-bit: **12 bytes**. The largest shape header, but still negligible. Drawing the same triangular area with `SubFrame` or individual `Char` orders would cost many times more.

### 11.5 Ellipse
- **Method**: `ellipse(...)`
- **Header**: `9 + C`
  - `type + shapeType + x + y + (radiusX-1) + (radiusY-1) + filled + char(C) + bg + fg`
- **Dynamic payload**: `0`

> **Example:** An ellipse with radii (20, 10) in 8-bit: **10 bytes** - same cost as a tiny 1×1 ellipse. Shape orders are the most bandwidth-efficient way to draw geometric primitives.

## 12) Polyline

- **Methods**: `polyline(...)` and `polygon(...)` (polygon closes the path)
- **Type**: `OrderType.Polyline`
- **Description**: draws a series of connected line segments.
- **Header**: `4 + C`
  - `type(1) + char(C) + fg(1) + bg(1) + pointCount(1)`
- **Dynamic payload**: `N × 2`
  - per point: `x(1) + y(1)`
- **Note**: `polygon(...)` adds 1 closing point back to the first, so `N` increases by 1.

> **Example 1 - path with 10 waypoints:** In 8-bit: `5 + (10 × 2)` = **25 bytes**. At 60 ticks/s: ~**1.5 KB/s**. A cheap way to draw roads, boundaries, or movement trails.
>
> **Example 2 - complex polygon with 100 vertices:** `5 + (100 × 2)` = **205 bytes** → ~**12 KB/s**. Even with many points, a polyline stays much cheaper than placing individual characters. Using `polygon(...)` on 99 vertices produces 100 points (adding the closing segment), costing the same **205 bytes**.

## 13) DotCloud

- **Method**: `dotCloud(...)` (and `grid(...)` returns a DotCloud)
- **Type**: `OrderType.DotCloud`
- **Description**: places the same character and colors at multiple arbitrary positions. A very efficient "scatter" primitive.
- **Header**: `5 + C`
  - `type(1) + char(C) + bg(1) + fg(1) + count(2)`
- **Dynamic payload**: `N × 2`

> **Example 1 - starfield with 500 stars:** In 8-bit: `6 + (500 × 2)` = **1 006 bytes** per tick → ~**59 KB/s**. Compare to 500 individual `Char` orders: `500 × 6` = 3 000 bytes. DotCloud saves **66%** of bandwidth for same-char scatter patterns.
>
> **Example 2 - `grid(...)` creating a 40×20 dot grid (800 dots):** `6 + (800 × 2)` = **1 606 bytes** → ~**94 KB/s**. The `grid(...)` helper internally builds a single `DotCloud`, making it very compact for regularly spaced content like board game grids, tiled backgrounds, or calibration patterns.

## 14) DotCloudMulti

- **Method**: `dotCloudMulti(...)`
- **Type**: `OrderType.DotCloudMulti`
- **Description**: cloud of dots where each dot has its own character and colors. Useful when every point is visually distinct.
- **Header**: `3`
  - `type + count(U16)`
- **Dynamic payload**: `N × (C + 4)`
  - per dot: `char(C) + bg + fg + x + y`

> **Example 1 - 200 colored particles:** In 8-bit: `3 + (200 × 5)` = **1 003 bytes** → ~**59 KB/s**. Compare to 200 individual `Char` orders: `200 × 6` = 1 200 bytes. The DotCloudMulti saves ~16% and uses a single order instead of 200, which also reduces decoder overhead.
>
> **Example 2 - 2 000 varied dots (dense particle system):** `3 + (2 000 × 5)` = **10 003 bytes** → ~**586 KB/s**. At this scale, consider whether a `Bitmask4` or `Bitmask16` could represent the same data more compactly if the dots share a limited palette of variants.

## 15) SpriteCloud

- **Method**: `spriteCloud(...)`
- **Type**: `OrderType.SpriteCloud`
- **Description**: draws the same sprite and colors at multiple positions. Ideal for identical repeated elements (trees, walls, items).
- **Header**: `6`
  - `type + spriteId + bg + fg + count(U16)`
- **Dynamic payload**: `N × 2`

> **Example 1 - 100 identical trees:** `6 + (100 × 2)` = **206 bytes** per tick → ~**12 KB/s**. Compare to 100 individual `Sprite` orders: `100 × 6` = 600 bytes. SpriteCloud saves **66%** - the more elements you have, the greater the savings.
>
> **Example 2 - 1 000 wall tiles:** `6 + (1 000 × 2)` = **2 006 bytes** → ~**118 KB/s**. Without SpriteCloud, this would require 1 000 × 6 = 6 000 bytes. For static scenery that doesn't change between ticks, you can also reduce the tick rate on that layer.

## 16) SpriteCloudMulti

- **Method**: `spriteCloudMulti(...)`
- **Type**: `OrderType.SpriteCloudMulti`
- **Description**: draws the same full-color sprite (no tinting) at multiple positions.
- **Header**: `4`
  - `type + spriteId + count(U16)`
- **Dynamic payload**: `N × 2`

> **Example 1 - 100 full-color decorations:** `4 + (100 × 2)` = **204 bytes** → ~**12 KB/s**. Even cheaper than tinted `SpriteCloud` because no fg/bg bytes are in the header.
>
> **Example 2 - 500 identical UI elements:** `4 + (500 × 2)` = **1 004 bytes** → ~**59 KB/s**. The most efficient way to repeat a single multi-color sprite across many positions.

## 17) SpriteCloudVaried

- **Method**: `spriteCloudVaried(...)`
- **Type**: `OrderType.SpriteCloudVaried`
- **Description**: different sprite IDs and tint colors per element. Useful for heterogeneous collections of tinted sprites.
- **Header**: `3`
  - `type + count(U16)`
- **Dynamic payload**: `N × 5`
  - per sprite: `spriteId + bg + fg + x + y`

> **Example 1 - 50 varied enemies (different sprites and colors):** `3 + (50 × 5)` = **253 bytes** → ~**15 KB/s**. Compare to 50 individual `Sprite` orders: `50 × 6` = 300 bytes. Modest savings per element, but reduces order count from 50 to 1, which reduces encoder/decoder overhead.
>
> **Example 2 - 500 mixed items on a map:** `3 + (500 × 5)` = **2 503 bytes** → ~**147 KB/s**. At high counts, the 5-byte-per-element cost grows linearly. If many items share the same sprite, splitting them into multiple `SpriteCloud` orders (2 bytes/element) can be cheaper.

## 18) SpriteCloudVariedMulti

- **Method**: `spriteCloudVariedMulti(...)`
- **Type**: `OrderType.SpriteCloudVariedMulti`
- **Description**: different full-color sprite per element (no tinting, just position and sprite ID).
- **Header**: `3`
  - `type + count(U16)`
- **Dynamic payload**: `N × 3`
  - per sprite: `spriteId + x + y`

> **Example 1 - 50 different full-color sprites:** `3 + (50 × 3)` = **153 bytes** → ~**9 KB/s**. The most compact varied-sprite option: only 3 bytes per element since colors are embedded in the sprite data.
>
> **Example 2 - 1 000 map decoration sprites:** `3 + (1 000 × 3)` = **3 003 bytes** → ~**176 KB/s**. Compare to `SpriteCloudVaried` with the same count: 5 003 bytes. If your sprites already embed their colors, this variant saves 40%.

## 19) Bitmask

- **Method**: `bitmask(...)`
- **Type**: `OrderType.Bitmask`
- **Description**: 1-bit per cell mask over a region. Each cell is either "on" (draws char/fg/bg) or "off" (transparent). Extremely space-efficient for binary visibility patterns.
- **Header**: `8 + C`
  - `type + x + y + (w-1) + (h-1) + char(C) + bg + fg + override`
- **Dynamic payload**: `M1`
  - `M1 = ceil((width × height) / 8)`

> **Example 1 - 20×10 fog-of-war overlay:** In 8-bit: `9 + ceil(200 / 8)` = `9 + 25` = **34 bytes** per tick. Compare to a `SubFrame` of the same area: 7 + 200 = 207 bytes. The bitmask is **6× cheaper** because each cell costs only 1 bit instead of 1 byte.
>
> **Example 2 - full 80×40 layer visibility mask:** `9 + ceil(3 200 / 8)` = `9 + 400` = **409 bytes** → ~**24 KB/s**. Compare to `FullFrame` (3 203 bytes) or `FullFrameMulti` (9 601 bytes). Bitmask is an excellent choice when your content is binary on/off.

## 20) Bitmask4

- **Method**: `bitmask4(...)`
- **Type**: `OrderType.Bitmask4`
- **Description**: 2-bit per cell mask with exactly 3 visual variants (plus transparent). Ideal when a region uses only a few distinct cell appearances.
- **Header**: `6 + 3×(C + 2)`
  - `type + x + y + (w-1) + (h-1) + override + 3 variants`
  - one variant = `char(C) + bg + fg`
- **Dynamic payload**: `M4`
  - `M4 = ceil((width × height) / 4)`

> **Example 1 - 20×10 terrain with 3 tile types (grass, water, sand):** In 8-bit: `6 + (3 × 3) + ceil(200 / 4)` = `6 + 9 + 50` = **65 bytes** per tick. A `SubFrameMulti` of the same area would cost `5 + 200 × 3` = **605 bytes**. The Bitmask4 is **~9× cheaper** - a massive saving for areas with low cell variety.
>
> **Example 2 - 80×40 full-layer tilemap:** `6 + 9 + ceil(3 200 / 4)` = `6 + 9 + 800` = **815 bytes** → ~**48 KB/s**. Compare to FullFrameMulti at ~563 KB/s. If your scene only uses 3 visual variants, Bitmask4 delivers **~12× bandwidth reduction**.

## 21) Bitmask16

- **Method**: `bitmask16(...)`
- **Type**: `OrderType.Bitmask16`
- **Description**: 4-bit per cell mask with up to 15 visual variants. More expressive than Bitmask4 while remaining much cheaper than per-cell encoding.
- **Header**: `7 + V×(C + 2)`
  - `type + x + y + (w-1) + (h-1) + override + variantCount(1) + variants`
- **Dynamic payload**: `M16`
  - `M16 = ceil((width × height) / 2)`
- `V = number of variants`

> **Example 1 - 20×10 area with 8 tile variants:** In 8-bit: `7 + (8 × 3) + ceil(200 / 2)` = `7 + 24 + 100` = **131 bytes**. Compare SubFrameMulti: 605 bytes. Bitmask16 is **~4.6× cheaper** even with 8 variants.
>
> **Example 2 - 80×40 layer with 15 variants (max):** `7 + (15 × 3) + ceil(3 200 / 2)` = `7 + 45 + 1 600` = **1 652 bytes** → ~**97 KB/s**. Compare to FullFrameMulti at ~563 KB/s - still **~6× cheaper**. The trade-off: your scene must be representable with at most 15 distinct cell appearances.

## 22) Fill

- **Method**: `fill(...)`
- **Type**: `OrderType.Fill`
- **Description**: fills the entire layer with a single character and fg/bg pair. The cheapest way to clear or paint a uniform layer.
- **Header**: `3 + C`
  - `type + char(C) + bg + fg`
- **Dynamic payload**: `0`

> **Example 1 - clearing a layer:** In 8-bit: **4 bytes** total. At 60 ticks/s: **240 B/s**. Compare to `FullFrame` on an 80×40 layer (3 203 bytes, ~188 KB/s). Fill is **~800× cheaper** when the entire layer is uniform. Always prefer `Fill` over `FullFrame`/`FullFrameMulti` when all cells are identical.
>
> **Example 2 - background layer filled with a dot character:** Still just **4 bytes**. No matter the layer dimensions (even 256×256 = 65 536 cells), Fill always costs the same because the renderer replicates the single cell client-side.

## 23) FillChar

- **Method**: `fillChar(...)`
- **Type**: `OrderType.FillChar`
- **Description**: fills the layer with a repeating character pattern (tiled). All cells share the same fg/bg.
- **Header**: `5`
  - `type + (patternWidth-1) + (patternHeight-1) + bg + fg`
- **Dynamic payload**: `P × C`
  - `P = pattern.length`

> **Example 1 - 2×2 checkerboard pattern:** In 8-bit: `5 + (4 × 1)` = **9 bytes**. This tiles a 4-character pattern across the entire layer for 9 bytes. A `FullFrame` on an 80×40 layer would cost 3 203 bytes for the same visual result. FillChar is **~356× cheaper**.
>
> **Example 2 - 8×4 decorative border pattern (32 chars):** `5 + (32 × 1)` = **37 bytes**. Still extremely compact. FillChar shines whenever your layer content is a tiled repetition of a small pattern.

## 24) FillSprite

- **Method**: `fillSprite(...)`
- **Type**: `OrderType.FillSprite`
- **Description**: fills the layer with a monochrome sprite, tinted with bg/fg.
- **Header**: `4`
  - `type + spriteId + bg + fg`
- **Dynamic payload**: `0`

> **Example:** **4 bytes** total, regardless of layer size. Like `Fill` but uses a sprite instead of a character. Ideal for textured backgrounds (brick wall, grass pattern) that only need a color tint. At 60 ticks/s: **240 B/s**.

## 25) FillSpriteMulti

- **Method**: `fillSpriteMulti(...)`
- **Type**: `OrderType.FillSpriteMulti`
- **Description**: fills the layer with a full-color sprite (no tinting).
- **Header**: `2`
  - `type + spriteId`
- **Dynamic payload**: `0`

> **Example:** **2 bytes** total - the absolute minimum an order can cost in this protocol (1 byte for type + 1 for sprite ID). Fills an entire layer of any size with a full-color sprite. Unbeatable for static background layers. At 60 ticks/s: **120 B/s**.

---

## Why does the header size differ between 8-bit and 16-bit?

Some orders encode a `charCode` directly in their header. This field is 1 byte in 8-bit mode and 2 bytes in 16-bit mode, so the header grows by 1 byte.

Affected orders: **Char**, **Shape** (all sub-types), **Fill**, **Polyline**, **DotCloud**, **Bitmask**, **Bitmask4**, **Bitmask16**.

Orders without a charCode in their header have the **same** fixed header size in both modes. Any size difference for those orders comes purely from the dynamic payload (which scales with `C` per element).

---