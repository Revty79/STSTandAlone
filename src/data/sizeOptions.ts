import sizeOrder from "./sizeScale.json";

export type Size = keyof typeof sizeOrder;

export const SIZE_OPTIONS = Object.freeze(Object.keys(sizeOrder) as Size[]);
export const SIZE_ORDER: Readonly<Record<Size, number>> = sizeOrder;

export function isSize(value: unknown): value is Size {
  return typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(sizeOrder, value);
}

export function compareSizes(left: Size, right: Size): number {
  return SIZE_ORDER[left] - SIZE_ORDER[right];
}
