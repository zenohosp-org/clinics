/**
 * HMS design-system component barrel.
 *
 * Import any primitive from a single path:
 *     import { Button, Card, Modal } from "@/components/ui";
 *
 * The legacy SearchSelect / SearchableSelect / Pagination exports stay
 * available from this barrel so existing callers keep working; they
 * will be replaced with hms-* equivalents in a later phase.
 */
export { default as Alert } from "./Alert";
export { default as Badge } from "./Badge";
export { default as Button } from "./Button";
export { default as Card } from "./Card";
export { default as Drawer } from "./Drawer";
export { default as EmptyState } from "./EmptyState";
export { default as FormGroup } from "./FormGroup";
export { default as GlobalLoader } from "./GlobalLoader";
export { default as Input } from "./Input";
export { default as Menu } from "./Menu";
export { default as Modal } from "./Modal";
export { default as PageHeader } from "./PageHeader";
export { default as SearchBar } from "./SearchBar";
export { default as Select } from "./Select";
export { default as Table } from "./Table";
export { default as TableSkeleton } from "./TableSkeleton";
export { default as Tabs } from "./Tabs";
export { default as Textarea } from "./Textarea";

// Legacy — kept for backwards compatibility, will be replaced.
export { default as Pagination } from "./Pagination";
export { default as SearchSelect } from "./SearchSelect";
export { default as SearchableSelect } from "./SearchableSelect";
