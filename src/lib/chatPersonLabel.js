export function chatPersonLabel(person) {
  const raw = String(person?.role || "")
    .trim()
    .toLowerCase();

  const labels = {
    admin: "Admin",
    manager: "Manager",
    employee: "Employee",
  };

  const role =
    labels[raw] ||
    (
      raw
        ? raw
            .replace(/_/g, " ")
            .replace(/\b\w/g, letter =>
              letter.toUpperCase()
            )
        : "Role unavailable"
    );

  const job = String(person?.job_title || "").trim();

  const generic = [
    "employee",
    "manager",
    "admin",
    "administrator",
  ];

  return (
    job &&
    !generic.includes(job.toLowerCase()) &&
    job.toLowerCase() !== role.toLowerCase()
  )
    ? `${role} · ${job}`
    : role;
}