export type RgbColor = readonly [number, number, number];

export type Frame = {
  bitmap: HTMLCanvasElement;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
};

export type Bounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type DrawState = {
  frame: Frame;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

export type MenuAnchor = {
  x: number;
  y: number;
};

export type BubbleAction = {
  id: "json-parse";
  label: "JSON解析";
  offsetX: number;
  offsetY: number;
};