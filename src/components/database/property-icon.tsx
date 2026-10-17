import {
  ArrowUpRight,
  AtSign,
  Calendar,
  CircleDot,
  Clock,
  Hash,
  Link,
  List,
  ListChecks,
  Loader,
  Paperclip,
  Phone,
  Search,
  SquareCheck,
  Text,
  Type,
  User,
  UserPen,
  type LucideIcon,
} from "lucide-react";
import type { PropertyType } from "@/lib/data";

const ICONS: Record<PropertyType, LucideIcon> = {
  title: Type,
  text: Text,
  number: Hash,
  select: CircleDot,
  multi_select: List,
  status: Loader,
  date: Calendar,
  person: User,
  checkbox: SquareCheck,
  url: Link,
  email: AtSign,
  phone: Phone,
  files: Paperclip,
  relation: ArrowUpRight,
  rollup: Search,
  created_time: Clock,
  created_by: UserPen,
  last_edited_time: Clock,
  last_edited_by: UserPen,
  unique_id: ListChecks,
};

export function PropertyIcon({ type, className = "size-4" }: { type: PropertyType; className?: string }) {
  const Icon = ICONS[type];
  return <Icon aria-hidden className={className} />;
}

/** Types proposés à la création, dans l'ordre du menu. */
export const CREATABLE_TYPES: PropertyType[] = [
  "text",
  "number",
  "select",
  "multi_select",
  "status",
  "date",
  "person",
  "files",
  "checkbox",
  "url",
  "email",
  "phone",
  "relation",
  "rollup",
  "created_time",
  "created_by",
  "last_edited_time",
  "last_edited_by",
  "unique_id",
];

export const READ_ONLY_TYPES: PropertyType[] = ["rollup", "created_time", "created_by", "last_edited_time", "last_edited_by", "unique_id"];
