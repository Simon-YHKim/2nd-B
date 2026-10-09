import { forwardRef, type ForwardedRef, type Ref, type RefAttributes, type ReactElement } from "react";
import { FlatList, ScrollView, type FlatListProps, type ScrollViewProps } from "react-native";
import { useScrollMemory } from "@/lib/nav/scroll-memory";

/** Keep existing screen styles and refs; only navigation-owned scroll is restored. */
export const RememberedScrollView = forwardRef<ScrollView, ScrollViewProps>(function RememberedScrollView(props, ref) {
  const memory = useScrollMemory(props, ref);
  return <ScrollView {...props} {...memory} />;
});
function RememberedFlatListInner<T>(props: FlatListProps<T>, ref: ForwardedRef<FlatList<T>>) {
  const memory = useScrollMemory(props, ref as ForwardedRef<FlatList<unknown>>, true);
  return <FlatList<T> {...props} {...memory} ref={memory.ref as Ref<FlatList<T>>} />;
}
export const RememberedFlatList = forwardRef(RememberedFlatListInner) as <T>(props: FlatListProps<T> & RefAttributes<FlatList<T>>) => ReactElement;
