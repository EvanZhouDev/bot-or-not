export const directionArrowPath =
  "M27.5 6.5H36.5V37.5H51.5L32 58L12.5 37.5H27.5V6.5Z";

export function directionColor(value: string) {
  switch (value) {
    case "Up":
      return "#2563eb";
    case "Down":
      return "#0f9f6e";
    case "Left":
      return "#d94a3a";
    default:
      return "#b7791f";
  }
}

export function directionRotation(value: string) {
  switch (value) {
    case "Up":
      return 180;
    case "Left":
      return 90;
    case "Right":
      return -90;
    default:
      return 0;
  }
}
