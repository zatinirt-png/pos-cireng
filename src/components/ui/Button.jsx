import React from "react";
import { cx } from "./utils";

/**
 * UI Button (ringan, tanpa dependency).
 * - Tetap kompatibel dengan class global `.btn` yang sudah ada.
 */
export default function Button({
  variant = "primary", // primary | secondary | ghost | strong | danger
  size = "md", // sm | md | lg
  className,
  type = "button",
  ...props
}) {
  const v =
    variant === "secondary"
      ? "secondary"
      : variant === "danger"
      ? "danger"
      : variant === "ghost"
      ? "btn--ghost"
      : variant === "strong"
      ? "btn--strong"
      : "";

  const s = size === "sm" ? "btn--sm" : size === "lg" ? "btn--lg" : "";

  return (
    <button type={type} className={cx("btn", v, s, className)} {...props} />
  );
}
