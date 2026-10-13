export const workplaceGroups = [
  {
    id: "platform",
    label: "Developer productivity & infrastructure",
    description: "Track engineering services, delivery systems, operational health, and development workflow.",
    modules: [
      { id: "platform.internal-platform", title: "Internal developer platform", description: "Maintain the service catalog, environment requests, and scaffolding templates.", action: "Add platform item", provider: "Cloud and source-control providers are not connected." },
      { id: "platform.cicd", title: "CI/CD pipelines", description: "Record pipeline runs, outcomes, owners, and links to external build systems.", action: "Record pipeline run", provider: "Live pipeline events require a CI provider integration." },
      { id: "platform.build-systems", title: "Build systems", description: "Track build jobs, build health, and investigation notes.", action: "Record build", provider: "Live build telemetry is not connected." },
      { id: "platform.code-review", title: "Code review & code search", description: "Track review requests and searchable engineering references.", action: "Add review or reference", provider: "Repository content and code-review providers are not connected." },
      { id: "platform.testing", title: "Testing", description: "Track test plans, runs, results, and follow-up work.", action: "Record test run" },
      { id: "platform.deployments", title: "Deployment, rollback & feature flags", description: "Maintain release records, rollback notes, and feature-flag inventories.", action: "Add release or flag", provider: "This records releases; it does not deploy or roll back external services." },
      { id: "platform.operations", title: "Monitoring, incidents & on-call", description: "Track operational signals, incidents, and on-call handoffs.", action: "Log operational item", provider: "Live monitoring, paging, and incident integrations are not connected." },
    ],
  },
  {
    id: "collaboration",
    label: "Collaboration & knowledge",
    description: "Share information, coordinate work, document objectives, and find company knowledge.",
    modules: [
      { id: "collaboration.chat", title: "Internal chat", description: "Post searchable team messages and reply in shared discussions.", action: "Post message", employeeCreate: true },
      { id: "collaboration.docs", title: "Docs & wiki", description: "Publish company knowledge, operating notes, and reference articles.", action: "Publish article", employeeCreate: true },
      { id: "collaboration.activity", title: "Company activity & notices", description: "Review a shared, automatically recorded feed of workspace changes.", nativeView: "activity" },
      { id: "collaboration.search", title: "Internal search", description: "Search employees, tasks, announcements, and suite records.", nativeView: "search" },
      { id: "collaboration.projects", title: "Project tracking", description: "Create and track assigned work with task status and due dates.", nativeView: "tasks" },
      { id: "collaboration.okrs", title: "OKRs", description: "Track objectives, key results, owners, and progress updates.", action: "Add objective" },
      { id: "collaboration.dashboards", title: "Team dashboards", description: "Review live task, attendance, and request metrics from visible workspace records.", nativeView: "insights" },
      { id: "collaboration.meetings", title: "Meeting tools", description: "Keep meeting agendas, decisions, and follow-up items.", action: "Add meeting" },
      { id: "collaboration.design-system", title: "Design system & components", description: "Document shared components, usage guidance, and design decisions.", action: "Add component reference" },
    ],
  },
  {
    id: "people",
    label: "HR & people operations",
    description: "Support employee lifecycle, workplace requests, learning, reviews, and compensation records.",
    modules: [
      { id: "people.onboarding", title: "Onboarding", description: "Track onboarding steps, owners, due dates, and completion.", action: "Add onboarding step" },
      { id: "people.directory", title: "Employee directory", description: "Browse employee profiles and roles in this workspace.", nativeView: "directory" },
      { id: "people.payroll", title: "Payroll & payslips", description: "Publish employer-provided statements and review pay records.", nativeView: "payslips", provider: "Payroll calculation and tax filing are not connected." },
      { id: "people.benefits", title: "Benefits", description: "Publish benefits information and track employee questions or requests.", action: "Add benefits item", employeeCreate: true },
      { id: "people.expenses", title: "Expenses", description: "Submit private expense claims with an amount and track manager review.", action: "Submit expense", employeeCreate: true, reviewRequired: true, privateByDefault: true, valueLabel: "Amount requested (USD)", valueType: "number" },
      { id: "people.time-off", title: "Time off & scheduling", description: "Request leave or a shift change and review schedules.", nativeView: "leave" },
      { id: "people.performance", title: "Performance reviews", description: "Track private review cycles, preparation, and manager follow-up.", action: "Add review cycle", privateByDefault: true },
      { id: "people.feedback", title: "Feedback", description: "Share feedback privately or with the company.", action: "Share feedback", employeeCreate: true, privateByDefault: true },
      { id: "people.learning", title: "Learning management", description: "Publish learning resources and record each employee’s completion.", action: "Add learning item" },
      { id: "people.recruiting", title: "Recruiting", description: "Track open roles, interview stages, and hiring actions.", action: "Add recruiting item" },
    ],
  },
  {
    id: "security",
    label: "IT, security & compliance",
    description: "Coordinate access, security operations, equipment, and compliance evidence.",
    modules: [
      { id: "security.sso", title: "Single sign-on", description: "Document identity-provider setup and SSO rollout tasks.", action: "Add SSO task", provider: "Company SSO login requires a registered Supabase identity provider and VITE_SSO_DOMAIN configuration." },
      { id: "security.access", title: "Access control", description: "Submit private access requests for manager review; approved access must still be provisioned in the provider.", action: "Submit access request", employeeCreate: true, reviewRequired: true, privateByDefault: true, provider: "Automatic provisioning is not connected." },
      { id: "security.devices", title: "Device management", description: "Maintain an internal device inventory and lifecycle notes.", action: "Add device record", valueLabel: "Asset tag or device reference", provider: "Device-management provider sync is not connected." },
      { id: "security.network", title: "VPN & endpoint security", description: "Track VPN and endpoint-security coverage and follow-up actions.", action: "Add security record", provider: "VPN and endpoint agents are not connected." },
      { id: "security.phishing", title: "Phishing simulations", description: "Plan simulation campaigns and record completion outcomes.", action: "Add simulation", provider: "Email simulation delivery is not connected." },
      { id: "security.compliance", title: "Compliance tracking", description: "Track controls, evidence owners, and review dates.", action: "Add compliance control" },
      { id: "security.training", title: "Security training", description: "Publish awareness material and track training completion.", action: "Add training item" },
    ],
  },
  {
    id: "data",
    label: "Data & decision-making",
    description: "Document metrics, experiments, data assets, and analytics work.",
    modules: [
      { id: "data.bi", title: "BI dashboards & metrics", description: "Review native workforce metrics and export task or attendance reports.", nativeView: "insights" },
      { id: "data.experiments", title: "Experimentation & A/B testing", description: "Track experiment hypotheses, variants, status, and outcomes.", action: "Add experiment", valueLabel: "Variant or measured outcome" },
      { id: "data.catalog", title: "Data catalog", description: "Document datasets, owners, classifications, and refresh notes.", action: "Add data asset", valueLabel: "Classification or source" },
      { id: "data.ml", title: "ML platform & model registry", description: "Track model metadata, owners, versions, and review status.", action: "Add model record", valueLabel: "Model version or registry reference", provider: "Model training and serving infrastructure are not connected." },
      { id: "data.analytics", title: "Internal analytics", description: "Record analysis requests, findings, and decision notes.", action: "Add analysis" },
    ],
  },
  {
    id: "culture",
    label: "Culture & engagement",
    description: "Encourage recognition, feedback, well-being, and employee connection.",
    modules: [
      { id: "culture.recognition", title: "Recognition", description: "Share and keep a record of employee recognition.", action: "Give recognition", employeeCreate: true },
      { id: "culture.feedback", title: "Employee feedback", description: "Share workplace feedback with the appropriate visibility.", action: "Share feedback", employeeCreate: true },
      { id: "culture.surveys", title: "Employee surveys", description: "Publish rating questions, collect employee responses, and review results.", action: "Add survey", employeeCreate: true },
      { id: "culture.wellness", title: "Wellness", description: "Share well-being resources and track participation activities.", action: "Add wellness resource", employeeCreate: true },
      { id: "culture.social", title: "Internal social network", description: "Share company updates and employee community posts.", action: "Create post", employeeCreate: true },
      { id: "culture.perks", title: "Perks", description: "Publish company perks and track employee questions.", action: "Add perk", employeeCreate: true },
    ],
  },
];

export const workplaceModules = workplaceGroups.flatMap(group =>
  group.modules.map(module => ({ ...module, groupId: group.id, groupLabel: group.label })),
);

export const employeeCreatableModuleIds = workplaceModules
  .filter(module => module.employeeCreate)
  .map(module => module.id);

  const employeeVisibleModules = new Set([
  "collaboration.chat", "collaboration.docs", "collaboration.activity",
  "collaboration.search", "collaboration.projects", "collaboration.meetings",
  "people.onboarding", "people.directory", "people.payroll",
  "people.benefits", "people.expenses", "people.time-off",
  "people.feedback", "people.learning",
  "security.access", "security.training",
  "culture.recognition", "culture.feedback", "culture.surveys",
  "culture.wellness", "culture.social", "culture.perks"
]);

const managerExtraModules = new Set([
  "collaboration.okrs", "collaboration.dashboards",
  "people.performance", "people.recruiting", "data.bi"
]);

export function canAccessWorkplaceModule(moduleId, role = "employee") {
  if (!workplaceModules.some(module => module.id === moduleId)) return false;
  if (role === "admin") return true;
  if (role !== "employee" && role !== "manager") return false;

  return employeeVisibleModules.has(moduleId) ||
    (role === "manager" && managerExtraModules.has(moduleId));
}

export function getWorkplaceGroupsForRole(role = "employee") {
  const mainPages = new Set([
    "tasks", "leave", "payslips", "activity", "insights"
  ]);

  return workplaceGroups.map(group => ({
    ...group,
    modules: group.modules.filter(module =>
      canAccessWorkplaceModule(module.id, role) &&
      !mainPages.has(module.nativeView)
    )
  })).filter(group => group.modules.length);
}