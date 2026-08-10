'use client';

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, LoaderCircle, MessageSquare, Send, Share2 } from "lucide-react";

type BlogComment = {
  id: string;
  slug: string;
  displayName: string | null;
  body: string;
  createdAt: string;
};

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function BlogShareAndComments({
  title,
  slug,
}: {
  title: string;
  slug: string;
}) {
  const [comments, setComments] = useState<BlogComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [body, setBody] = useState("");

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return `https://labs.reachdefence.com/blogs/posts/${slug}`;
    }
    return `${window.location.origin}/blogs/posts/${slug}`;
  }, [slug]);

  useEffect(() => {
    let cancelled = false;

    async function loadComments() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/blog-comments?slug=${encodeURIComponent(slug)}`, {
          headers: { accept: "application/json" },
        });
        const payload = (await response.json()) as { comments?: BlogComment[]; error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "comments_unavailable");
        }
        if (!cancelled) {
          setComments(payload.comments ?? []);
        }
      } catch {
        if (!cancelled) {
          setError("Comments are temporarily unavailable.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadComments();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function handleCopy() {
    await navigator.clipboard.writeText(`${shareUrl}?utm_source=copy&utm_medium=referral&utm_campaign=blog_share`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/blog-comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug,
          displayName: displayName.trim() || null,
          body: body.trim(),
        }),
      });
      const payload = (await response.json()) as { comment?: BlogComment; error?: string };
      if (!response.ok || !payload.comment) {
        throw new Error(payload.error ?? "comment_save_failed");
      }
      setComments((current) => [payload.comment!, ...current]);
      setBody("");
      setDisplayName("");
    } catch {
      setError("Comment could not be saved.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`${shareUrl}?utm_source=linkedin&utm_medium=social&utm_campaign=blog_share&utm_content=${slug}`)}`;
  const xUrl = `https://x.com/intent/post?text=${encodeURIComponent(title)}&url=${encodeURIComponent(`${shareUrl}?utm_source=x&utm_medium=social&utm_campaign=blog_share&utm_content=${slug}`)}`;
  const emailUrl = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${title}\n\n${shareUrl}?utm_source=email&utm_medium=share&utm_campaign=blog_share&utm_content=${slug}`)}`;

  return (
    <section className="blog-discussion">
      <div className="blog-share-card">
        <div>
          <h2>
            <Share2 size={16} />
            Share
          </h2>
          <p>Pass the article with a stable link that stays attached to the product surface.</p>
        </div>
        <div className="blog-share-actions">
          <a href={linkedInUrl} target="_blank" rel="noreferrer">LinkedIn</a>
          <a href={xUrl} target="_blank" rel="noreferrer">X</a>
          <a href={emailUrl}>Email</a>
          <button type="button" onClick={() => void handleCopy()}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>

      <div className="blog-comments-card">
        <div className="blog-comments-header">
          <div>
            <h2>
              <MessageSquare size={18} />
              Comments
            </h2>
            <p>Anonymous comments are persisted to the platform. A display name is optional.</p>
          </div>
          <span>{comments.length} {comments.length === 1 ? "comment" : "comments"}</span>
        </div>

        <form className="blog-comment-form" onSubmit={handleSubmit}>
          <label>
            Name (optional)
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Reach analyst"
              maxLength={80}
            />
          </label>
          <label>
            Comment
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="What should be challenged, expanded, or clarified here?"
              rows={4}
              maxLength={2000}
              required
            />
          </label>
          <div className="blog-comment-actions">
            <small>Stored as anonymous feedback unless you choose to add a display name.</small>
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <LoaderCircle size={14} className="spin" /> : <Send size={14} />}
              Post comment
            </button>
          </div>
        </form>

        {error && <p className="blog-comment-error">{error}</p>}

        <div className="blog-comment-list">
          {isLoading ? (
            <p className="blog-comment-placeholder">Loading comments…</p>
          ) : comments.length === 0 ? (
            <p className="blog-comment-placeholder">No comments yet.</p>
          ) : (
            comments.map((comment) => (
              <article key={comment.id} className="blog-comment-item">
                <header>
                  <strong>{comment.displayName?.trim() || "Anonymous"}</strong>
                  <span>{formatTimestamp(comment.createdAt)}</span>
                </header>
                <p>{comment.body}</p>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
