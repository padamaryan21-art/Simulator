import {
  Bot,
  Brain,
  CalendarClock,
  FileText,
  FileUp,
  BookText,
  Globe,
  Heart,
  ImageIcon,
  History,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  MessagesSquare,
  Send,
  Settings,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { label: string; href: string; icon: LucideIcon };
export type NavSection = { title?: string; items: NavItem[] };

export const NAV: NavSection[] = [
  { items: [{ label: "Dashboard", href: "/", icon: LayoutDashboard }] },
  {
    title: "Telegram",
    items: [
      { label: "Accounts", href: "/telegram/accounts", icon: Send },
      { label: "Groups", href: "/telegram/groups", icon: Users },
    ],
  },
  {
    title: "AI",
    items: [
      { label: "Personas", href: "/ai/personas", icon: Bot },
      { label: "Relationships", href: "/ai/relationships", icon: Heart },
      { label: "Memories", href: "/ai/memories", icon: Brain },
      { label: "Simulator", href: "/ai/simulator", icon: Sparkles },
      { label: "Prompt library", href: "/ai/prompts", icon: BookText },
      { label: "Import conversations", href: "/ai/import", icon: FileUp },
    ],
  },
  {
    title: "Content",
    items: [
      { label: "Topics", href: "/content/topics", icon: MessageSquare },
      { label: "LakiPH Knowledge", href: "/content/knowledge", icon: Globe },
      { label: "Images", href: "/content/images", icon: ImageIcon },
    ],
  },
  {
    title: "Automation",
    items: [
      { label: "Scheduler", href: "/automation/scheduler", icon: CalendarClock },
      { label: "Queue", href: "/automation/queue", icon: ListChecks },
      { label: "Logs", href: "/automation/logs", icon: FileText },
    ],
  },
  {
    title: "History",
    items: [
      { label: "Conversations", href: "/history/conversations", icon: History },
      { label: "Messages", href: "/history/messages", icon: MessagesSquare },
    ],
  },
  { items: [{ label: "Settings", href: "/settings", icon: Settings }] },
];
