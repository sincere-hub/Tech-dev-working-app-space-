import { useId } from "react";
import { ClipboardList, Plus } from "lucide-react";
import "./task-assignment.css";

function todayKey() {
  const date = new Date();

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export default function TaskAssignment({
  employees = [],
  onSubmit,
}) {
  const id = useId();

  return (
    <section
      className="td-assign-task"
      aria-labelledby={`${id}-heading`}
    >
      <header className="tdaf-header">
        <span className="tdaf-icon">
          <ClipboardList size={23} aria-hidden="true" />
        </span>

        <div>
          <h2 id={`${id}-heading`}>Assign a task</h2>
          <p>
            Set clear expectations and keep your team
            moving forward.
          </p>
        </div>
      </header>

      <form className="tdaf-form" onSubmit={onSubmit}>
        <label
          className="tdaf-field tdaf-wide"
          htmlFor={`${id}-title`}
        >
          <span>Task title</span>
          <input
            id={`${id}-title`}
            name="title"
            required
            maxLength={160}
            placeholder="What needs to get done?"
          />
        </label>

        <label
          className="tdaf-field tdaf-wide"
          htmlFor={`${id}-assignee`}
        >
          <span>Assign to</span>
          <select
            id={`${id}-assignee`}
            name="assignee"
            defaultValue=""
          >
            <option value="">Open task pool</option>

            {employees.map(employee => (
              <option
                key={employee.id}
                value={employee.id}
              >
                {employee.display_name}
              </option>
            ))}
          </select>
        </label>

        <label
          className="tdaf-field"
          htmlFor={`${id}-due`}
        >
          <span>Due date</span>
          <input
            id={`${id}-due`}
            name="due"
            type="date"
            min={todayKey()}
          />
        </label>

        <label
          className="tdaf-field"
          htmlFor={`${id}-priority`}
        >
          <span>Priority</span>
          <select
            id={`${id}-priority`}
            name="priority"
            defaultValue="normal"
          >
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </label>

        <label
          className="tdaf-field tdaf-wide"
          htmlFor={`${id}-details`}
        >
          <span>Details</span>
          <textarea
            id={`${id}-details`}
            name="description"
            maxLength={1000}
            rows={4}
            placeholder="Add useful context, instructions or the expected outcome."
          />
        </label>

        <footer className="tdaf-footer tdaf-wide">
          <button className="tdaf-submit" type="submit">
            <Plus size={17} aria-hidden="true" />
            Assign task
          </button>
        </footer>
      </form>
    </section>
  );
}