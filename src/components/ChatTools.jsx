import { useMemo, useState } from "react";
import emojiData from "@emoji-mart/data";

const labels = {
  people: "People",
  nature: "Nature",
  foods: "Food",
  activity: "Activities",
  places: "Travel",
  objects: "Objects",
  symbols: "Symbols",
};

const blocked =
  /middle_finger|kiss|biting_lip|bikini|underwear|eggplant|peach|gun|bomb|dagger|hocho|crossed_swords|bow_and_arrow|smoking|cigarette|beer|wine_glass|cocktail|champagne|sake|tumbler_glass|clinking_glasses|syringe|drop_of_blood|coffin|headstone|skull|hankey|face_vomiting|underage|pill|face_with_symbols_on_mouth/i;

const base = [];
const tones = [];

for (const category of emojiData.categories) {
  if (!labels[category.id]) continue;

  for (const id of category.emojis) {
    const emoji = emojiData.emojis[id];

    if (!emoji || blocked.test(id)) continue;

    emoji.skins.forEach((skin, index) => {
      const entry = {
        native: skin.native,
        name: emoji.name,
        category: category.id,
        search: [
          emoji.name,
          id,
          ...(emoji.keywords || []),
        ].join(" ").toLowerCase(),
      };

      (index ? tones : base).push(entry);
    });
  }
}

const choices = [
  ...new Map(
    [...base, ...tones].map(item => [item.native, item])
  ).values(),
].slice(0, 2000);

const normalize = value =>
  String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

export function mentionPeople(employees) {
  const people = [
    ...new Map(
      employees
        .filter(person => person.id && person.display_name)
        .map(person => [person.id, person])
    ).values(),
  ];

  const handle = person =>
    normalize(person.display_name)
      .replace(/[^\p{L}\p{N}_]/gu, "") || "employee";

  const counts = new Map();

  people.forEach(person => {
    const name = handle(person);
    counts.set(name, (counts.get(name) || 0) + 1);
  });

  return people
    .map(person => ({
      ...person,
      handle:
        handle(person) +
        (
          counts.get(handle(person)) > 1
            ? `_${String(person.id).replace(/[^a-z0-9]/gi, "")}`
            : ""
        ),
    }))
    .sort((a, b) =>
      a.display_name.localeCompare(b.display_name)
    );
}

export function mentionRange(text, caret) {
  const match = text
    .slice(0, caret)
    .match(/(?:^|[\s(])@([\p{L}\p{N}_]*)$/u);

  if (!match) return null;

  const start = caret - match[1].length - 1;

  const rest = text
    .slice(caret)
    .match(/^[\p{L}\p{N}_]*/u)[0];

  return {
    start,
    end: caret + rest.length,
    query: normalize(match[1]),
  };
}

export function useChatTools({
  draft,
  setDraft,
  input,
  employees,
  busy,
}) {
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [hidden, setHidden] = useState("");
  const [note, setNote] = useState("");

  const people = useMemo(
    () => mentionPeople(employees),
    [employees]
  );

  const range = mentionRange(draft, caret);
  const signature = range ? `${draft}:${caret}` : "";

  const open = Boolean(
    range && signature !== hidden && !busy
  );

  const suggestions = open
    ? people
        .filter(person =>
          normalize(
            `${person.display_name} ${person.handle}`
          ).includes(range.query)
        )
        .slice(0, 8)
    : [];

  const selected = suggestions.length
    ? active % suggestions.length
    : 0;

  function replace(start, end, text) {
    if (busy) return;

    const next =
      draft.slice(0, start) +
      text +
      draft.slice(end);

    if (next.length > 2000) {
      setNote(
        "This would exceed the 2,000-character message limit."
      );
      return;
    }

    const position = start + text.length;

    setDraft(next);
    setCaret(position);
    setHidden(`${next}:${position}`);
    setNote("");

    window.requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(
        position,
        position
      );
    });
  }

  function choose(person) {
    if (range) {
      replace(
        range.start,
        range.end,
        `@${person.handle} `
      );
    }
  }

  return {
    open,
    suggestions,
    selected,
    note,
    choose,

    change(event) {
      setDraft(event.target.value);
      setCaret(event.target.selectionStart);
      setActive(0);
      setHidden("");
      setNote("");
    },

    select(event) {
      setCaret(event.currentTarget.selectionStart);
    },

    keyDown(event) {
      if (event.nativeEvent.isComposing) return;

      if (open && event.key === "Escape") {
        event.preventDefault();
        setHidden(signature);
        return;
      }

      if (!open || !suggestions.length) return;

      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp"
      ) {
        event.preventDefault();

        setActive(value =>
          (
            value +
            (
              event.key === "ArrowDown"
                ? 1
                : suggestions.length - 1
            )
          ) % suggestions.length
        );
      } else if (
        ["Enter", "Tab"].includes(event.key) &&
        !event.shiftKey
      ) {
        event.preventDefault();

        if (!event.repeat) {
          choose(suggestions[selected]);
        }
      }
    },

    emoji(native) {
      replace(
        input.current?.selectionStart ?? draft.length,
        input.current?.selectionEnd ?? draft.length,
        native
      );
    },
  };
}

export function MentionText({ text, employees }) {
  const people = useMemo(
    () =>
      new Map(
        mentionPeople(employees).map(person => [
          person.handle,
          person,
        ])
      ),
    [employees]
  );

  const value = String(text || "");
  const pieces = [];
  const pattern = /(^|[\s(])(@[\p{L}\p{N}_]+)/gu;

  let match;
  let cursor = 0;

  while ((match = pattern.exec(value))) {
    const start = match.index + match[1].length;

    const person = people.get(
      normalize(match[2].slice(1))
    );

    if (!person) continue;

    pieces.push(value.slice(cursor, start));

    pieces.push(
      <strong
        className="lc-mention"
        title={person.display_name}
        key={start}
      >
        {match[2]}
      </strong>
    );

    cursor = start + match[2].length;
  }

  pieces.push(value.slice(cursor));

  return pieces;
}

export default function ChatTools({
  tools,
  emojiOpen,
  busy,
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [limit, setLimit] = useState(80);

  const filtered = choices.filter(item =>
    (
      category === "all" ||
      item.category === category
    ) &&
    item.search.includes(search.trim().toLowerCase())
  );

  return (
    <div
      className="lc-tools"
      hidden={!tools.open && !emojiOpen && !tools.note}
    >
      {tools.open && (
        <div
          className="lc-mentions"
          role="listbox"
          id="lc-mention-list"
          aria-label="Mention an employee"
        >
          <small>
            Choose an employee · Enter or Tab to select
          </small>

          {!tools.suggestions.length && (
            <p>No matching employee.</p>
          )}

          {tools.suggestions.map((person, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === tools.selected}
              className={
                index === tools.selected
                  ? "is-selected"
                  : ""
              }
              id={`lc-mention-${index}`}
              key={person.id}
              onMouseDown={event => event.preventDefault()}
              onClick={() => tools.choose(person)}
            >
              <strong>{person.display_name}</strong>
              <span>@{person.handle}</span>
            </button>
          ))}
        </div>
      )}

      {emojiOpen && (
        <section
          className="lc-emoji-panel"
          aria-label="Emoji picker"
        >
          <header>
            <strong>Emoji</strong>

            <small>
              {choices.length.toLocaleString()} choices
              {" · "}includes skin tones
            </small>
          </header>

          <input
            type="search"
            aria-label="Search emojis"
            placeholder="Search: smile, thanks, celebration…"
            value={search}
            disabled={busy}
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
              }
            }}
            onChange={event => {
              setSearch(event.target.value);
              setLimit(80);
            }}
          />

          <div
            className="lc-emoji-categories"
            role="group"
            aria-label="Emoji categories"
          >
            {Object.entries({
              all: "All",
              ...labels,
            }).map(([id, label]) => (
              <button
                type="button"
                key={id}
                aria-pressed={category === id}
                disabled={busy}
                onClick={() => {
                  setCategory(id);
                  setLimit(80);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div
            className="lc-emoji-grid"
            role="group"
            aria-label="Choose an emoji"
          >
            {filtered.slice(0, limit).map(item => (
              <button
                type="button"
                key={item.native}
                title={item.name}
                aria-label={`Insert ${item.name} ${item.native}`}
                disabled={busy}
                onMouseDown={event => event.preventDefault()}
                onClick={() => tools.emoji(item.native)}
              >
                {item.native}
              </button>
            ))}
          </div>

          {!filtered.length && (
            <p>No matching emojis.</p>
          )}

          {filtered.length > limit && (
            <button
              type="button"
              className="lc-more-emoji"
              disabled={busy}
              onClick={() => setLimit(value => value + 80)}
            >
              Show more · {filtered.length - limit} remaining
            </button>
          )}
        </section>
      )}

      {tools.note && (
        <p className="lc-error" role="status">
          {tools.note}
        </p>
      )}
    </div>
  );
}