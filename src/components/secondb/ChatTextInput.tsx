import { forwardRef, useCallback, useLayoutEffect, useRef, useState } from "react";
import { Platform, StyleSheet, type TextInput, type TextInputProps, type TextStyle } from "react-native";

import { PhoneTextInput } from "@/components/phone/PhoneUIKit";

const MIN_HEIGHT = 36;
const MAX_HEIGHT = 124;

type ChatTextInputProps = Omit<TextInputProps,
  "value" | "onChangeText" | "multiline" | "onSubmitEditing" | "onKeyPress" | "submitBehavior" | "blurOnSubmit"
> & {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
};

type WebKeyEvent = {
  key?: string;
  shiftKey?: boolean;
  repeat?: boolean;
  nativeEvent?: { key?: string; shiftKey?: boolean; isComposing?: boolean; keyCode?: number; repeat?: boolean };
  preventDefault?: () => void;
};

/** The draft grows to five lines; the conversation keeps the remaining space. */
export const ChatTextInput = forwardRef<TextInput, ChatTextInputProps>(function ChatTextInput({
  value, onChangeText, onSubmit, style, onContentSizeChange, onLayout, ...rest
}, forwardedRef) {
  const inputRef = useRef<TextInput | null>(null);
  const draftRef = useRef(value);
  draftRef.current = value;
  const [height, setHeight] = useState(MIN_HEIGHT);

  const resize = useCallback((contentHeight: number) => {
    if (!Number.isFinite(contentHeight) || contentHeight <= 0) return;
    setHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.ceil(contentHeight))));
  }, []);

  const measureWeb = useCallback(() => {
    if (Platform.OS !== "web") return;
    const node = inputRef.current as unknown as HTMLTextAreaElement | null;
    if (!node?.style) return;
    // A wrapped placeholder is not a drafted line, even on a narrow screen.
    if (node.value === "") { resize(MIN_HEIGHT); return; }
    // RNW reports scrollHeight while the textarea is still at its previous
    // height. Temporarily remove that floor so deletions and prefills shrink.
    const previousHeight = node.style.height;
    const previousMinHeight = node.style.minHeight;
    const border = Math.max(0, node.offsetHeight - node.clientHeight);
    node.style.height = "0px";
    node.style.minHeight = "0px";
    const contentHeight = node.scrollHeight + border;
    node.style.height = previousHeight;
    node.style.minHeight = previousMinHeight;
    resize(contentHeight);
  }, [resize]);

  const setInputRef = useCallback((node: TextInput | null) => {
    inputRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef]);

  useLayoutEffect(() => {
    if (value.length === 0) setHeight(MIN_HEIGHT);
    measureWeb();
  }, [value, measureWeb]);

  const handleContentSizeChange = useCallback<NonNullable<TextInputProps["onContentSizeChange"]>>((event) => {
    if (Platform.OS === "web") measureWeb();
    else resize(draftRef.current.length ? event.nativeEvent.contentSize.height : MIN_HEIGHT);
    onContentSizeChange?.(event);
  }, [measureWeb, onContentSizeChange, resize]);

  const handleKeyPress: NonNullable<TextInputProps["onKeyPress"]> = (event) => {
    if (Platform.OS !== "web") return;
    // RNW forwards the browser keydown event, including the IME flags. Its
    // onSubmitEditing path is intentionally unused to avoid a second send.
    const webEvent = event as unknown as WebKeyEvent;
    const native = webEvent.nativeEvent;
    if ((native?.key ?? webEvent.key) !== "Enter"
      || (webEvent.shiftKey ?? native?.shiftKey)
      || native?.isComposing || native?.keyCode === 229) return;
    webEvent.preventDefault?.();
    if (!(webEvent.repeat ?? native?.repeat)) onSubmit();
  };

  return <PhoneTextInput
    {...rest}
    ref={setInputRef}
    value={value}
    onChangeText={next => { draftRef.current = next; onChangeText(next); }}
    multiline
    numberOfLines={1}
    submitBehavior="newline"
    blurOnSubmit={false}
    returnKeyType="default"
    scrollEnabled={height >= MAX_HEIGHT}
    onKeyPress={handleKeyPress}
    onContentSizeChange={handleContentSizeChange}
    onLayout={event => { measureWeb(); onLayout?.(event); }}
    style={[
      style, styles.input, { height },
      Platform.OS === "web" && { overflowY: height >= MAX_HEIGHT ? "auto" : "hidden" } as TextStyle,
    ]}
  />;
});

const styles = StyleSheet.create({
  input: {
    minWidth: 0,
    minHeight: MIN_HEIGHT,
    maxHeight: MAX_HEIGHT,
    lineHeight: 22,
    paddingTop: 7,
    paddingBottom: 7,
    textAlignVertical: "top",
  },
});
