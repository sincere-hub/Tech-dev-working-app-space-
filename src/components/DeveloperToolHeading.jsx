import {
  Activity,
  FlaskConical,
  GitBranch,
  GitPullRequest,
  Rocket,
  Server,
  Wrench,
} from "lucide-react";

import "./developer-tools.css";

const icons = {
  "platform.internal-platform": Server,
  "platform.cicd": GitBranch,
  "platform.build-systems": Wrench,
  "platform.code-review": GitPullRequest,
  "platform.testing": FlaskConical,
  "platform.deployments": Rocket,
  "platform.operations": Activity,
};

export function DeveloperToolIcon({
  moduleId,
  size = 20,
}) {
  const Icon = icons[moduleId] || Server;

  return (
    <Icon
      size={size}
      strokeWidth={1.8}
      aria-hidden="true"
    />
  );
}

export default function DeveloperToolHeading({
  module,
}) {
  return (
    <header className="suite-module-heading td-dev-heading">
      <span className="td-dev-heading-icon">
        <DeveloperToolIcon
          moduleId={module.id}
          size={26}
        />
      </span>

      <div className="td-dev-heading-copy">
        <p className="eyebrow">
          {module.groupLabel}
        </p>

        <h1>{module.title}</h1>

        <p>{module.description}</p>
      </div>

      <span className="td-dev-mode">
        Internal tracking
      </span>
    </header>
  );
}