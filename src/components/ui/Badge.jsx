import React from "react";
import { cx } from "./utils";

export default function Badge({
  tone = "neutral", // neutral | highlight | accent1 | accent2 | danger | strong
  className,
  ...props
}) {
  return <span className={cx("badge", `badge--${tone}`, className)} {...props} />;
}
