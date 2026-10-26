import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { supabase } from "./supabase.js";

function timed(promise) {
  let timer;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              "The request timed out. Please retry."
            )
          ),
        15000
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

export default function useKnowledgeSearch({
  userId,
  kind,
  query = "",
  topic = "all",
  archived = false,
  sort = "recent",
  revision = "",
}) {
  const key = JSON.stringify([
    userId,
    kind,
    query.trim(),
    topic === "all" ? "" : topic,
    archived,
    sort,
  ]);

  const activeKey = useRef(key);
  activeKey.current = key;

  const version = useRef(0);
  const controller = useRef(null);
  const paging = useRef(0);
  const alive = useRef(true);

  const [state, setState] = useState({
    key: "",
    owner: userId,
    files: [],
    topics: [],
    loading: true,
    hasMore: false,
    error: "",
  });

  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
      version.current++;
      controller.current?.abort();
    };
  }, []);

  async function read(builder, signal) {
    const check = async () => {
      const { data, error } = await timed(
        supabase.auth.getSession()
      );

      if (error) throw error;

      if (
        !alive.current ||
        data.session?.user.id !== userId
      ) {
        const problem = new Error(
          "Your account changed. Reopen the knowledge hub."
        );

        problem.accountChanged = true;
        throw problem;
      }

      if (signal.aborted) {
        throw new Error("Search cancelled.");
      }
    };

    await check();

    const { data, error } = await builder.abortSignal(
      signal
    );

    if (error) throw error;

    await check();

    return data || [];
  }

  function searchRequest(cursor) {
    return supabase.rpc("td_knowledge_search", {
      p_kind: kind,
      p_query: query.trim(),
      p_topic: topic === "all" ? "" : topic,
      p_archived: archived,
      p_sort: sort,
      p_cursor: cursor,
    });
  }

  const refresh = useCallback(async () => {
    if (!userId || activeKey.current !== key) return;

    const turn = ++version.current;

    paging.current = 0;
    controller.current?.abort();

    const aborter = new AbortController();
    controller.current = aborter;

    const timer = setTimeout(
      () => aborter.abort(),
      15000
    );

    setState(previous => ({
      key,
      owner: userId,
      files:
        previous.key === key ? previous.files : [],
      topics:
        previous.owner === userId
          ? previous.topics
          : [],
      hasMore: false,
      loading: true,
      error: "",
    }));

    const current = () =>
      alive.current &&
      version.current === turn &&
      activeKey.current === key;

    try {
      const [page, topics] = await Promise.allSettled([
        read(searchRequest(null), aborter.signal),

        read(
          supabase.rpc("td_knowledge_topics", {
            p_kind: kind,
          }),
          aborter.signal
        ),
      ]);

      if (!current()) return;

      if (page.status === "rejected") {
        throw page.reason;
      }

      if (
        topics.status === "rejected" &&
        topics.reason?.accountChanged
      ) {
        throw topics.reason;
      }

      const rows = page.value;

      setState(previous => ({
        key,
        owner: userId,
        files: rows.slice(0, 50),
        topics:
          topics.status === "fulfilled"
            ? topics.value
            : previous.topics,
        hasMore: rows.length > 50,
        loading: false,
        error:
          topics.status === "rejected"
            ? "Results loaded, but the topic list could not refresh. Press Refresh to retry."
            : "",
      }));
    } catch (failure) {
      if (current()) {
        setState({
          key,
          owner: userId,
          files: [],
          topics: [],
          hasMore: false,
          loading: false,
          error:
            failure.message ||
            "Could not search company knowledge.",
        });
      }
    } finally {
      clearTimeout(timer);

      if (controller.current === aborter) {
        controller.current = null;
      }
    }
  }, [key]);

  useEffect(() => {
    const timer = setTimeout(refresh, 250);

    return () => {
      clearTimeout(timer);
      version.current++;
      paging.current = 0;
      controller.current?.abort();
    };
  }, [refresh, revision]);

  async function loadMore() {
    if (
      paging.current ||
      state.key !== key ||
      state.loading ||
      !state.hasMore ||
      !state.files.length
    ) {
      return;
    }

    const turn = ++version.current;
    paging.current = turn;

    const aborter = new AbortController();

    controller.current?.abort();
    controller.current = aborter;

    const timer = setTimeout(
      () => aborter.abort(),
      15000
    );

    const last = state.files.at(-1);

    const cursor = {
      id: last.id,
      title: last.title,
      date:
        kind === "wiki"
          ? last.updated_at || last.created_at
          : last.created_at,
    };

    setState(previous => ({
      ...previous,
      loading: true,
      error: "",
    }));

    const current = () =>
      alive.current &&
      version.current === turn &&
      activeKey.current === key;

    try {
      const rows = await read(
        searchRequest(cursor),
        aborter.signal
      );

      if (!current()) return;

      setState(previous => ({
        ...previous,
        files: [
          ...new Map(
            [
              ...previous.files,
              ...rows.slice(0, 50),
            ].map(row => [row.id, row])
          ).values(),
        ],
        hasMore: rows.length > 50,
        loading: false,
      }));
    } catch (failure) {
      if (current()) {
        setState(previous => ({
          ...previous,
          loading: false,
          ...(failure.accountChanged
            ? {
                files: [],
                topics: [],
                hasMore: false,
              }
            : {}),
          error:
            failure.message ||
            "Could not load more results.",
        }));
      }
    } finally {
      clearTimeout(timer);

      if (paging.current === turn) {
        paging.current = 0;
      }

      if (controller.current === aborter) {
        controller.current = null;
      }
    }
  }

  const setFiles = useCallback(
    value => {
      setState(previous =>
        previous.key === key
          ? {
              ...previous,
              files:
                typeof value === "function"
                  ? value(previous.files)
                  : value,
            }
          : previous
      );
    },
    [key]
  );

  const setLoading = useCallback(
    value => {
      setState(previous =>
        previous.key === key
          ? { ...previous, loading: value }
          : previous
      );
    },
    [key]
  );

  const matchesKey = state.key === key;

  return {
    files: matchesKey ? state.files : [],
    topics:
      state.owner === userId ? state.topics : [],
    loading: !matchesKey || state.loading,
    hasMore: matchesKey && state.hasMore,
    loadError: matchesKey ? state.error : "",
    refresh,
    loadMore,
    setFiles,
    setLoading,
    version,
  };
}