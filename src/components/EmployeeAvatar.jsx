import {
  createElement as h,
  createContext,
  useContext,
  useMemo,
} from "react";
import { Ban } from "lucide-react";

import BaseAvatar, {
  EmployeeProfilesProvider as BaseProvider,
} from "./EmployeeAvatarBase.jsx";

export * from "./EmployeeAvatarBase.jsx";

import "./employee-access.css";

const BannedEmployees = createContext(new Map());

export function EmployeeProfilesProvider({
  employees = [],
  children,
  ...props
}) {
  const flags = useMemo(
    () => new Map(employees.map(person => [
      person.id,
      person.is_banned === true,
    ])),
    [employees]
  );

  return h(
    BannedEmployees.Provider,
    { value: flags },
    h(BaseProvider, { ...props, employees }, children)
  );
}

export default function EmployeeAvatar({ banned, ...props }) {
  const flags = useContext(BannedEmployees);

  const blocked = typeof banned === "boolean"
    ? banned
    : flags.get(props.employeeId) === true;

  if (!blocked) return h(BaseAvatar, props);

  const size = typeof props.size === "number"
    ? props.size
    : 40;

  return h(
    "span",
    {
      className: "employee-banned-avatar",
      role: "img",
      "aria-label": "Banned employee",
      title: "Banned employee",
      style: { width: size, height: size },
    },
    h(Ban, {
      size: Math.round(size * 0.7),
      "aria-hidden": true,
    })
  );
}