import {
  Activity,
  BarChart3,
  BookOpen,
  Boxes,
  Brain,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Code2,
  Database,
  FlaskConical,
  Gift,
  GitBranch,
  GitPullRequest,
  GraduationCap,
  Heart,
  Key,
  Layers,
  LayoutDashboard,
  Lock,
  MessageSquare,
  Monitor,
  Network,
  Rocket,
  Search,
  Server,
  ShieldCheck,
  Target,
  Terminal,
  Trophy,
  UserPlus,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";

const icons = {
  "platform.internal-platform": Server,
  "platform.cicd": GitBranch,
  "platform.build-systems": Wrench,
  "platform.code-review": GitPullRequest,
  "platform.testing": FlaskConical,
  "platform.deployments": Rocket,
  "platform.operations": Activity,

  "collaboration.chat": MessageSquare,
  "collaboration.docs": BookOpen,
  "collaboration.activity": Activity,
  "collaboration.search": Search,
  "collaboration.projects": ClipboardList,
  "collaboration.okrs": Target,
  "collaboration.dashboards": LayoutDashboard,
  "collaboration.meetings": CalendarDays,
  "collaboration.design-system": Layers,

  "people.onboarding": UserPlus,
  "people.directory": Users,
  "people.payroll": Wallet,
  "people.benefits": Heart,
  "people.expenses": Wallet,
  "people.time-off": CalendarDays,
  "people.performance": Target,
  "people.feedback": MessageSquare,
  "people.learning": GraduationCap,
  "people.recruiting": BriefcaseBusiness,

  "security.sso": Key,
  "security.access": Lock,
  "security.devices": Monitor,
  "security.network": Network,
  "security.phishing": ShieldCheck,
  "security.compliance": ClipboardCheck,
  "security.training": ShieldCheck,

  "data.bi": BarChart3,
  "data.experiments": FlaskConical,
  "data.catalog": Database,
  "data.ml": Brain,
  "data.analytics": BarChart3,

  "culture.recognition": Trophy,
  "culture.feedback": MessageSquare,
  "culture.surveys": ClipboardList,
  "culture.wellness": Heart,
  "culture.social": Users,
  "culture.perks": Gift,

  "developer.build": Terminal,
};

const groupIcons = {
  platform: Code2,
  collaboration: MessageSquare,
  people: Users,
  security: ShieldCheck,
  data: Database,
  culture: Heart,
};

export default function WorkplaceIcon({
  id = "",
  groupId,
  size = 18,
}) {
  const group = groupId || id.split(".")[0];

  const Icon =
    icons[id] ||
    groupIcons[group] ||
    Boxes;

  return (
    <Icon
      size={size}
      strokeWidth={1.8}
      aria-hidden="true"
      focusable="false"
    />
  );
}