// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * SF Symbols to Material Icons mappings for ScholarMind
 */
const MAPPING = {
  "house.fill": "home",
  "plus.circle.fill": "add-circle",
  "gearshape.fill": "settings",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "chevron.left": "chevron-left",
  "arrow.left": "arrow-back",
  "magnifyingglass": "search",
  "xmark": "close",
  "checkmark.circle.fill": "check-circle",
  "exclamationmark.circle.fill": "error",
  "pause.circle.fill": "pause-circle-filled",
  "play.circle.fill": "play-circle-filled",
  "stop.circle.fill": "cancel",
  "doc.text.fill": "article",
  "star.fill": "star",
  "clock.fill": "schedule",
  "flask.fill": "science",
  "list.bullet": "list",
  "chart.bar.fill": "bar-chart",
  "person.fill": "person",
  "info.circle.fill": "info",
  "wifi": "wifi",
  "server.rack": "dns",
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
