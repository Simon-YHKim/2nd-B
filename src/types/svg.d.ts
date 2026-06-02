// Ambient module declaration so TypeScript treats `import X from "./x.svg"` as a
// React component (react-native-svg-transformer turns each .svg into an
// SvgProps component at bundle time). Mirrors the transformer's own typing.
declare module "*.svg" {
  import type { FC } from "react";
  import type { SvgProps } from "react-native-svg";
  const content: FC<SvgProps>;
  export default content;
}
