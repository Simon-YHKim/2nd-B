import { forwardRef, useCallback, useLayoutEffect, useRef, useState } from "react";
import { Platform, StyleSheet, useWindowDimensions, type TextInput, type TextInputProps, type TextStyle } from "react-native";

import { PhoneTextInput } from "@/components/phone/PhoneUIKit";
import { CHAT_INPUT_SIZE, chatInputMinimumHeight } from "./chat-font-layout";

const { minHeight: MIN_HEIGHT, maxHeight: MAX_HEIGHT, lineHeight: LINE_HEIGHT, verticalPadding: VERTICAL_PADDING } = CHAT_INPUT_SIZE;
const WEB_MEASUREMENT_STYLES = [
  "boxSizing", "width", "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontStretch",
  "fontVariant", "fontFeatureSettings", "fontVariationSettings", "fontKerning", "lineHeight",
  "letterSpacing", "wordSpacing", "textIndent", "textTransform", "textAlign", "direction",
  "whiteSpace", "wordBreak", "overflowWrap", "tabSize", "paddingTop", "paddingBottom",
  "paddingLeft", "paddingRight", "borderTopWidth", "borderBottomWidth", "borderLeftWidth",
  "borderRightWidth", "overflowX", "overflowY", "scrollbarGutter", "scrollbarWidth",
] as const;

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
  const measurementRef = useRef<HTMLTextAreaElement | null>(null);
  const draftRef = useRef(value);
  draftRef.current = value;
  const [height, setHeight] = useState<number>(MIN_HEIGHT);
  const { fontScale } = useWindowDimensions();
  // Preserve the existing 1.0/1.3 layout. At larger Android scales an empty
  // draft also needs room for the scaled line, padding and PhoneTextInput border.
  const minimumHeight = chatInputMinimumHeight(Platform.OS, fontScale);
  const inputHeight = Math.max(height, minimumHeight);

  const resize = useCallback((contentHeight: number) => {
    if (!Number.isFinite(contentHeight) || contentHeight <= 0) return;
    setHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.ceil(contentHeight))));
  }, []);

  const measureWeb = useCallback(() => {
    if (Platform.OS !== "web") return;
    const node = inputRef.current as unknown as HTMLTextAreaElement | null;
    if (!node?.style) return;
    // A wrapped placeholder is not a drafted line, even on a narrow screen.
    if (node.value === "") {
      if (measurementRef.current) measurementRef.current.value = "";
      resize(MIN_HEIGHT); return;
    }
    const document = node.ownerDocument;
    const computed = document.defaultView?.getComputedStyle(node);
    if (!computed || parseFloat(computed.width) <= 0) return;
    let measurement = measurementRef.current;
    if (!measurement) {
      measurement = document.createElement("textarea");
      measurement.tabIndex = -1;
      measurement.readOnly = true;
      measurement.autocomplete = "off";
      measurement.setAttribute("aria-hidden", "true");
      measurementRef.current = measurement;
    }
    // scrollHeight has the current box as its floor. Measure without that
    // floor on a separate node to avoid changing the editing box during IME
    // composition. Only the final measured height is applied to the real input.
    // Copy the used width, font, padding, borders and wrapping rules exactly,
    // including PhoneTextInput styling, instead of inheriting from document.body.
    for (const property of WEB_MEASUREMENT_STYLES) {
      measurement.style[property] = computed[property];
    }
    Object.assign(measurement.style, {
      position: "fixed", left: "-10000px", top: "0", visibility: "hidden", pointerEvents: "none",
      height: "0px", minHeight: "0px", maxHeight: "none", minWidth: "0px", maxWidth: "none",
    });
    measurement.value = node.value;
    if (!measurement.isConnected) document.body.appendChild(measurement);
    const border = parseFloat(computed.borderTopWidth) + parseFloat(computed.borderBottomWidth);
    resize(measurement.scrollHeight + border);
  }, [resize]);

  useLayoutEffect(() => () => {
    measurementRef.current?.remove();
    measurementRef.current = null;
  }, []);

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
    scrollEnabled={inputHeight >= MAX_HEIGHT}
    onKeyPress={handleKeyPress}
    onContentSizeChange={handleContentSizeChange}
    onLayout={event => { measureWeb(); onLayout?.(event); }}
    style={[
      style, styles.input, { height: inputHeight },
      Platform.OS === "web" && { overflowY: height >= MAX_HEIGHT ? "auto" : "hidden" } as TextStyle,
    ]}
  />;
});

const styles = StyleSheet.create({
  input: {
    minWidth: 0,
    minHeight: MIN_HEIGHT,
    maxHeight: MAX_HEIGHT,
    lineHeight: LINE_HEIGHT,
    paddingTop: VERTICAL_PADDING,
    paddingBottom: VERTICAL_PADDING,
    textAlignVertical: Platform.OS === "android" ? "center" : "top",
    ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
  },
});
