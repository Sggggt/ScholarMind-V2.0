import {
  Bell,
  Bot,
  Code2,
  Compass,
  FlaskConical,
  FolderGit2,
  GitBranch,
  History,
  LibraryBig,
  Lightbulb,
  LineChart,
  LucideProps,
  MessagesSquare,
  PenSquare,
  ScanSearch,
  SearchCode,
  Settings2,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';

const iconMap = {
  MessagesSquare,
  GitBranch,
  History,
  Settings2,
  Compass,
  LibraryBig,
  ScanSearch,
  TrendingUp,
  SearchCode,
  Lightbulb,
  Code2,
  FolderGit2,
  FlaskConical,
  Bot,
  LineChart,
  PenSquare,
  ShieldCheck,
  Bell,
};

type IconName = keyof typeof iconMap;

interface AppIconProps extends LucideProps {
  name: string;
}

export default function AppIcon({ name, ...props }: AppIconProps) {
  const Icon = iconMap[name as IconName] ?? MessagesSquare;
  return <Icon size={18} strokeWidth={1.7} {...props} />;
}
