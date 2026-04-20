export const COLORS = {
  background: "#F9F9F7",
  surface: "#FFFFFF",
  primary: "#2A5C43",
  primary_hover: "#204633",
  secondary: "#8A9E88",
  accent: "#C25E46",
  text_primary: "#1A1A1A",
  text_secondary: "#5C615E",
  border: "#E4E6E3",
  success: "#2A5C43",
  warning: "#E0A458",
  danger: "#C25E46",
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const RADIUS = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  full: 999,
};

export const FONT = {
  regular: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
  extrabold: "800" as const,
  black: "900" as const,
};

export const API_URL = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;
