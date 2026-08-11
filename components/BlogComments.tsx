"use client";

import { useEffect, useMemo, useState } from "react";

type CommentItem = {
  id: string;
  author: string;
  text: string;
  timestamp: string;
};

const INITIAL_COMMENTS: CommentItem[] = [
  {
    id: "seed-1",
    author: "TacticalAnalyst_2026",
    text: "The separation between world truth and side-specific tracks is the piece most simulators flatten too early.",
    timestamp: "2 hours ago",
  },
];

export function BlogComments({
  slug,
  title,
  url,
}: {
  slug: string;
  title: string;
  url: string;
}) {
  const storageKey = useMemo(() => `vector_blog_comments_${slug}`, [slug]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    let nextComments = INITIAL_COMMENTS;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        nextComments = JSON.parse(saved) as CommentItem[];
      }
    } catch {
      nextComments = INITIAL_COMMENTS;
    }
    const timer = window.setTimeout(() => setComments(nextComments), 0);
    if (!localStorage.getItem(storageKey)) {
      localStorage.setItem(storageKey, JSON.stringify(nextComments));
    }
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  useEffect(() => {
    if (comments.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(comments));
    }
  }, [comments, storageKey]);

  const shareUrl = `${url}?utm_source=share_link`;
  const linkedInUrl = encodeURIComponent(
    `${url}?utm_source=linkedin&utm_medium=social&utm_campaign=blog_share`,
  );
  const xUrl = encodeURIComponent(
    `${url}?utm_source=x&utm_medium=social&utm_campaign=blog_share`,
  );

  return (
    <section className="mt-16 space-y-8 border-t border-slate-800 pt-12">
      <div className="rounded-2xl border border-slate-800 bg-[#0B0F17] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.22em] text-cyan-300">
              Share
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-100">
              Share {title}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Anonymous share links for analysis, review, or discussion.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${linkedInUrl}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-300 transition-colors hover:border-cyan-800 hover:text-cyan-300"
            >
              LinkedIn
            </a>
            <a
              href={`https://x.com/intent/post?text=${encodeURIComponent(title)}&url=${xUrl}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-300 transition-colors hover:border-cyan-800 hover:text-cyan-300"
            >
              X
            </a>
            <a
              href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(
                `Read this article: ${shareUrl}`,
              )}`}
              className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-300 transition-colors hover:border-cyan-800 hover:text-cyan-300"
            >
              Email
            </a>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(shareUrl)}
              className="rounded-xl border border-cyan-800/60 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/15"
            >
              Copy link
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-[#0B0F17] p-6">
        <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.22em] text-cyan-300">
              Discussion
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-100">
              Anonymous comments
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              No account required. Comments are persisted locally for now.
            </p>
          </div>
          <div className="text-sm text-cyan-300">
            {comments.length} {comments.length === 1 ? "comment" : "comments"}
          </div>
        </div>

        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const body = text.trim();
            if (!body) return;
            setComments((existing) => [
              {
                id: crypto.randomUUID(),
                author: author.trim() || "Anonymous Analyst",
                text: body,
                timestamp: "Just now",
              },
              ...existing,
            ]);
            setAuthor("");
            setText("");
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-300">
              <span>Name / callsign (optional)</span>
              <input
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder="Anonymous Analyst"
                className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-600"
              />
            </label>
            <div className="hidden md:block" />
          </div>
          <label className="space-y-2 text-sm text-slate-300">
            <span>Comment</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={4}
              placeholder="What should the simulator preserve or expose here?"
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-600"
            />
          </label>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Anonymous, browser-persisted until backend storage lands.
            </p>
            <button
              type="submit"
              className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400"
            >
              Post comment
            </button>
          </div>
        </form>

        <div className="mt-8 space-y-4 border-t border-slate-800 pt-6">
          {comments.length === 0 ? (
            <p className="text-sm text-slate-500">No comments yet.</p>
          ) : (
            comments.map((comment) => (
              <article
                key={comment.id}
                className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-full border border-cyan-800/70 bg-cyan-500/10 text-sm font-semibold text-cyan-300">
                      {(comment.author || "A")[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-slate-100">
                        {comment.author || "Anonymous"}
                      </p>
                      <p className="text-xs text-slate-500">{comment.timestamp}</p>
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-300">
                  {comment.text}
                </p>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
