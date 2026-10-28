import {
  createElement as h,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import "./design-patterns.css";

const patterns = {
  pattern_registration: {
    title: "Registration workflow",
    steps: [
      "Enter details",
      "Validate",
      "Complete",
    ],
    guidance: [
      "Keep visible labels and explain required information before submission.",
      "Preserve entered details when validation fails; identify each field that needs attention.",
      "Production registration must validate on the server and explain any email-verification step.",
    ],
  },

  pattern_upload: {
    title: "Document upload workflow",
    steps: [
      "Choose a file",
      "Validate & transfer",
      "Confirm",
    ],
    guidance: [
      "Show supported formats and the size limit before someone chooses a file.",
      "Keep progress visible and give a clear completion or recovery message.",
      "Production uploads need server-side validation, access checks and confirmation that storage succeeded.",
    ],
  },

  pattern_approval: {
    title: "Approval workflow",
    steps: [
      "Prepare request",
      "Review",
      "Decision",
    ],
    guidance: [
      "Show who is requesting a change and exactly what the reviewer is deciding.",
      "Require useful feedback when requesting changes and preserve the original submission.",
      "Production approvals must enforce roles and reject decisions against an outdated revision.",
    ],
  },
};

export function validateRegistration(values) {
  const errors = {};

  if (!values.name.trim()) {
    errors.name = "Enter your name.";
  }

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      values.email.trim(),
    )
  ) {
    errors.email = "Enter a valid email address.";
  }

  if (Array.from(values.password).length < 12) {
    errors.password =
      "Use at least 12 characters for this example.";
  }

  return errors;
}

export function validateUpload(file) {
  if (!file) return "Choose a file first.";

  const extension = file.name
    .split(".")
    .at(-1)
    .toLowerCase();

  const mime = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
  };

  if (!Object.hasOwn(mime, extension)) {
    return "Choose a PDF, PNG or JPEG file.";
  }

  if (
    !Number.isFinite(file.size) ||
    file.size <= 0
  ) {
    return "Choose a file that is not empty.";
  }

  if (file.size > 10 * 1024 * 1024) {
    return "Choose a file smaller than or equal to 10 MB.";
  }

  if (
    file.type &&
    file.type !== mime[extension]
  ) {
    return "The file type does not match its extension.";
  }

  return "";
}

function Button({
  children,
  primary = false,
  ...props
}) {
  return h(
    "button",
    {
      type: "button",
      ...props,
      className:
        `tdp-button${primary ? " tdp-primary" : ""}`,
    },
    children,
  );
}

function Steps({ names, active }) {
  return h(
    "ol",
    {
      className: "tdp-steps",
      "aria-label": "Example workflow progress",
    },

    names.map((name, index) =>
      h(
        "li",
        {
          key: `step:${index}`,

          "aria-current":
            active === index ? "step" : undefined,

          className:
            index < active
              ? "tdp-step-complete"
              : "",
        },

        h(
          "span",
          { "aria-hidden": true },
          index < active ? "✓" : index + 1,
        ),

        name,
      )
    ),
  );
}

function RegistrationExample() {
  const id = useId();
  const first = useRef(null);

  const [values, setValues] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [errors, setErrors] = useState({});
  const [attempted, setAttempted] = useState(false);
  const [complete, setComplete] = useState(false);

  function submit(event) {
    event.preventDefault();

    const next = validateRegistration(values);

    setErrors(next);
    setAttempted(true);

    if (Object.keys(next).length) {
      document
        .getElementById(
          `${id}-${Object.keys(next)[0]}`,
        )
        ?.focus();

      return;
    }

    setComplete(true);

    setValues(previous => ({
      ...previous,
      password: "",
    }));
  }

  function reset() {
    setComplete(false);
    setAttempted(false);
    setErrors({});

    setValues({
      name: "",
      email: "",
      password: "",
    });

    requestAnimationFrame(() =>
      first.current?.focus()
    );
  }

  return h(
    "div",
    null,

    h(Steps, {
      names: patterns.pattern_registration.steps,
      active: complete ? 2 : attempted ? 1 : 0,
    }),

    h(
      "form",
      {
        className: "tdp-form",
        noValidate: true,
        onSubmit: submit,
      },

      h(
        "div",
        { className: "tdp-form-heading" },

        h(
          "span",
          { className: "tdp-kicker" },
          "ACCOUNT DETAILS",
        ),

        h("h4", null, "Join your workspace"),

        h(
          "p",
          null,
          "Try the validation using fictional details.",
        ),
      ),

      ...[
        ["name", "Full name", "text"],
        ["email", "Work email", "email"],
        ["password", "Password", "password"],
      ].map(([field, label, type]) =>
        h(
          "label",
          {
            key: `field:${field}`,
            htmlFor: `${id}-${field}`,
          },

          label,

          h("input", {
            ref: field === "name" ? first : undefined,
            id: `${id}-${field}`,
            type,
            required: true,
            value: values[field],
            disabled: complete,
            autoComplete: "off",

            maxLength:
              field === "password" ? 128 : 180,

            "aria-invalid": Boolean(errors[field]),

            "aria-describedby":
              `${id}-${field}-help`,

            onChange: event => {
              const value = event.target.value;

              setValues(old => ({
                ...old,
                [field]: value,
              }));

              setErrors(old => ({
                ...old,
                [field]: "",
              }));
            },
          }),

          h(
            "span",
            {
              id: `${id}-${field}-help`,

              className: errors[field]
                ? "tdp-error"
                : "tdp-help",
            },

            errors[field] ||
              (
                field === "password"
                  ? "Example rule: at least 12 characters."
                  : field === "email"
                    ? "Example: alex@example.com"
                    : "Use a fictional name for this preview."
              ),
          ),
        )
      ),

      attempted &&
        Object.values(errors).some(Boolean) &&
        h(
          "p",
          {
            className: "tdp-error",
            role: "alert",
          },
          "Review the highlighted fields. Your other details are still here.",
        ),

      complete &&
        h(
          "p",
          {
            className: "tdp-success",
            role: "status",
          },
          "Example completed. No account was created.",
        ),

      h(
        "div",
        { className: "tdp-actions" },

        h(
          Button,
          {
            type: "submit",
            primary: true,
            disabled: complete,
          },
          complete
            ? "Example complete"
            : "Validate example",
        ),

        h(
          Button,
          { onClick: reset },
          "Reset example",
        ),
      ),
    ),
  );
}

function UploadExample() {
  const id = useId();
  const input = useRef(null);

  const [file, setFile] = useState(null);
  const [phase, setPhase] = useState("choose");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const busy = phase === "transfer";

  useEffect(() => {
    if (!busy) return;

    const timer = setInterval(() => {
      setProgress(value =>
        Math.min(100, value + 20)
      );
    }, 180);

    return () => clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    if (busy && progress === 100) {
      setPhase("complete");
    }
  }, [busy, progress]);

  function choose(event) {
    const next = event.target.files?.[0];
    const problem = validateUpload(next);

    setError(problem);
    setProgress(0);
    setPhase("choose");
    setFile(problem ? null : next);

    if (problem) {
      event.target.value = "";
    }
  }

  function reset() {
    setFile(null);
    setError("");
    setProgress(0);
    setPhase("choose");

    if (input.current) {
      input.current.value = "";
      input.current.focus();
    }
  }

  return h(
    "div",
    null,

    h(Steps, {
      names: patterns.pattern_upload.steps,

      active:
        phase === "complete" ? 2 : busy ? 1 : 0,
    }),

    h(
      "div",
      { className: "tdp-form" },

      h(
        "div",
        { className: "tdp-form-heading" },

        h(
          "span",
          { className: "tdp-kicker" },
          "FILE HANDLING",
        ),

        h("h4", null, "Add a document"),

        h(
          "p",
          null,
          "PDF, PNG or JPEG · maximum 10 MB",
        ),
      ),

      h(
        "label",
        {
          className: "tdp-file-label",
          htmlFor: id,
        },

        "Choose an example file",

        h("input", {
          ref: input,
          id,
          type: "file",
          accept: ".pdf,.png,.jpg,.jpeg",
          disabled: busy,
          onChange: choose,
          "aria-describedby": `${id}-help`,
          "aria-invalid": Boolean(error),
        }),
      ),

      h(
        "p",
        {
          id: `${id}-help`,
          className: "tdp-help",
        },

        "The example checks file metadata and simulates progress. File contents stay on your device.",
      ),

      file &&
        h(
          "div",
          { className: "tdp-file-summary" },

          h("strong", null, file.name),

          h(
            "span",
            null,

            `${Math.max(
              1,
              Math.ceil(file.size / 1024),
            )} KB · ${file.type || "selected file"}`,
          ),
        ),

      error &&
        h(
          "p",
          {
            className: "tdp-error",
            role: "alert",
          },
          error,
        ),

      (busy || phase === "complete") &&
        h(
          "div",
          null,

          h(
            "div",
            {
              className: "tdp-progress",
              role: "progressbar",
              "aria-label":
                "Simulated upload progress",
              "aria-valuenow": progress,
              "aria-valuemin": 0,
              "aria-valuemax": 100,
            },

            h("span", {
              style: {
                width: `${progress}%`,
              },
            }),
          ),

          h(
            "p",
            {
              className: "tdp-help",
              role: "status",
            },

            phase === "complete"
              ? "Example completed. No file was uploaded."
              : `Simulating transfer · ${progress}%`,
          ),
        ),

      h(
        "div",
        { className: "tdp-actions" },

        h(
          Button,
          {
            primary: true,

            disabled:
              !file ||
              busy ||
              phase === "complete",

            onClick: () => {
              if (validateUpload(file)) return;

              setProgress(0);
              setPhase("transfer");
            },
          },

          busy
            ? "Running example…"
            : "Run upload example",
        ),

        h(
          Button,
          { onClick: reset },

          busy
            ? "Cancel example"
            : "Reset example",
        ),
      ),
    ),
  );
}

function ApprovalExample() {
  const id = useId();

  const [role, setRole] = useState("requester");
  const [request, setRequest] = useState("");
  const [snapshot, setSnapshot] = useState("");
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState("");
  const [status, setStatus] = useState("draft");
  const [error, setError] = useState("");

  const pending = status === "pending";

  function submit(event) {
    event.preventDefault();

    if (!request.trim()) {
      setError(
        "Describe the example request first.",
      );

      document
        .getElementById(`${id}-request`)
        ?.focus();

      return;
    }

    setSnapshot(request.trim());
    setStatus("pending");
    setNote("");
    setError("");
    setRole("reviewer");
  }

  function decide(approved) {
    if (!pending) return;

    if (!approved && !note.trim()) {
      setError(
        "Explain the changes needed before returning the request.",
      );

      document
        .getElementById(`${id}-note`)
        ?.focus();

      return;
    }

    setFeedback(note.trim());

    setStatus(
      approved ? "approved" : "changes",
    );

    setError("");

    if (!approved) {
      setRole("requester");
    }
  }

  function reset() {
    setRole("requester");
    setRequest("");
    setSnapshot("");
    setNote("");
    setFeedback("");
    setStatus("draft");
    setError("");
  }

  const labels = {
    draft: "Draft",
    pending: "Waiting for review",
    approved: "Approved example",
    changes: "Changes requested",
  };

  return h(
    "div",
    null,

    h(Steps, {
      names: patterns.pattern_approval.steps,

      active:
        status === "approved" ||
        status === "changes"
          ? 2
          : pending
            ? 1
            : 0,
    }),

    h(
      "div",
      {
        className: "tdp-role",
        role: "group",
        "aria-label": "Preview role",
      },

      h("span", null, "Preview as"),

      h(
        Button,
        {
          "aria-pressed": role === "requester",

          onClick: () => {
            setRole("requester");
            setError("");
          },
        },
        "Requester",
      ),

      h(
        Button,
        {
          "aria-pressed": role === "reviewer",

          onClick: () => {
            setRole("reviewer");
            setError("");
          },
        },
        "Reviewer",
      ),
    ),

    h(
      "div",
      { className: "tdp-form" },

      h(
        "div",
        { className: "tdp-form-heading" },

        h(
          "span",
          { className: "tdp-kicker" },
          "REQUEST EXAMPLE",
        ),

        h("h4", null, "Equipment request"),

        h(
          "span",
          {
            className: "tdp-status",
            role: "status",
          },
          labels[status],
        ),
      ),

      role === "requester"
        ? h(
            "form",
            {
              className: "tdp-form-fields",
              noValidate: true,
              onSubmit: submit,
            },

            h(
              "label",
              { htmlFor: `${id}-request` },

              "Request details",

              h("textarea", {
                id: `${id}-request`,
                rows: 3,
                maxLength: 1000,
                required: true,
                value: request,

                disabled:
                  pending ||
                  status === "approved",

                "aria-invalid": Boolean(error),

                "aria-describedby": error
                  ? `${id}-error`
                  : undefined,

                onChange: event => {
                  setRequest(event.target.value);
                  setError("");
                },

                placeholder:
                  "For example: a second monitor for testing responsive layouts.",
              }),
            ),

            feedback &&
              h(
                "p",
                { className: "tdp-feedback" },

                h(
                  "strong",
                  null,
                  "Reviewer feedback: ",
                ),

                feedback,
              ),

            h(
              Button,
              {
                type: "submit",
                primary: true,

                disabled:
                  pending ||
                  status === "approved",
              },

              status === "changes"
                ? "Resubmit example"
                : "Submit example request",
            ),
          )

        : h(
            "div",
            { className: "tdp-form-fields" },

            snapshot
              ? h(
                  "div",
                  { className: "tdp-request" },

                  h(
                    "strong",
                    null,
                    "Submitted request",
                  ),

                  h("p", null, snapshot),
                )

              : h(
                  "p",
                  { className: "tdp-help" },

                  "Switch to Requester and submit an example first.",
                ),

            pending &&
              h(
                "label",
                { htmlFor: `${id}-note` },

                "Review note",

                h("textarea", {
                  id: `${id}-note`,
                  rows: 3,
                  maxLength: 1000,
                  value: note,

                  "aria-invalid": Boolean(error),

                  "aria-describedby": error
                    ? `${id}-error`
                    : undefined,

                  onChange: event => {
                    setNote(event.target.value);
                    setError("");
                  },

                  placeholder:
                    "Required when requesting changes.",
                }),
              ),

            pending &&
              h(
                "div",
                { className: "tdp-actions" },

                h(
                  Button,
                  {
                    primary: true,
                    onClick: () => decide(true),
                  },
                  "Approve example",
                ),

                h(
                  Button,
                  {
                    onClick: () => decide(false),
                  },
                  "Request changes",
                ),
              ),

            status === "approved" &&
              h(
                "p",
                {
                  className: "tdp-success",
                  role: "status",
                },

                "Example approved. No workplace request was changed.",
              ),
          ),

      error &&
        h(
          "p",
          {
            id: `${id}-error`,
            className: "tdp-error",
            role: "alert",
          },
          error,
        ),

      h(
        Button,
        { onClick: reset },
        "Reset example",
      ),
    ),
  );
}

export default function DesignPatternPreview({
  kind,
}) {
  const [light, setLight] = useState(false);
  const [notice, setNotice] = useState("");

  const info = Object.hasOwn(patterns, kind)
    ? patterns[kind]
    : null;

  const Example = {
    pattern_registration: RegistrationExample,
    pattern_upload: UploadExample,
    pattern_approval: ApprovalExample,
  }[kind];

  if (!info || !Example) {
    return h(
      "p",
      null,
      "Choose a supported workflow category.",
    );
  }

  const code =
    'import DesignPatternPreview from "./components/DesignPatternPreview.jsx";\n\n' +
    `<DesignPatternPreview kind="${kind}" />`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setNotice("Example usage copied.");
    } catch {
      setNotice(
        "Select and copy the example code below.",
      );
    }
  }

  return h(
    "section",
    {
      className: "tds-pattern",
      "aria-label": info.title,
    },

    h(
      "header",
      { className: "tdp-toolbar" },

      h(
        "div",
        null,

        h(
          "span",
          { className: "tdp-kicker" },
          "INTERACTIVE WORKFLOW",
        ),

        h("h3", null, info.title),
      ),

      h(
        Button,
        {
          "aria-pressed": light,

          onClick: () =>
            setLight(value => !value),
        },

        light ? "Dark canvas" : "Light canvas",
      ),
    ),

    h(
      "p",
      { className: "tdp-intro" },

      "Try the workflow states in this local example. Company permissions and workplace records stay unchanged.",
    ),

    h(
      "div",
      {
        className:
          `tdp-canvas${light ? " tdp-light" : ""}`,
      },

      h(Example, { key: kind }),
    ),

    h(
      "div",
      { className: "tdp-guidance" },

      h(
        "h4",
        null,
        "Implementation guidance",
      ),

      h(
        "ul",
        null,

        info.guidance.map((line, index) =>
          h(
            "li",
            { key: `guidance:${index}` },
            line,
          )
        ),
      ),
    ),

    h(
      "div",
      { className: "tdp-toolbar" },

      h("h4", null, "Example usage"),

      h(
        Button,
        { onClick: copy },
        "Copy example usage",
      ),
    ),

    h(
      "pre",
      {
        tabIndex: 0,
        "aria-label": "Pattern example code",
      },

      h("code", null, code),
    ),

    h(
      "p",
      {
        className: "tdp-notice",
        role: "status",
      },
      notice,
    ),
  );
}