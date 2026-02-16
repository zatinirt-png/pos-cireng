import React from "react";
import { cx } from "./utils";

export default function Table({ className, ...props }) {
  return <table className={cx("table", className)} {...props} />;
}
