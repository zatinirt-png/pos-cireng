import React from "react";
import { cx } from "./utils";

export default function Card({ as: As = "div", className, ...props }) {
  return <As className={cx("card", className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
  return <div className={cx("card-header", className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <div className={cx("card-title", className)} {...props} />;
}

export function CardSubtitle({ className, ...props }) {
  return <div className={cx("card-subtitle", className)} {...props} />;
}

export function CardBody({ className, ...props }) {
  return <div className={cx("card-body", className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
  return <div className={cx("card-footer", className)} {...props} />;
}
