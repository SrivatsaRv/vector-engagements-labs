'use client';
import { useState, useEffect } from 'react';
import { Share2, Copy, Check, MessageSquare, Lock, Send } from 'lucide-react';

interface CommentItem {
  id: string;
  author: string;
  text: string;
  timestamp: string;
}

export function BlogShareAndComments({ title, slug }: { title: string; slug: string }) {
  const [copied, setCopied] = useState(false);
  const [author, setAuthor] = useState('');
  const [commentText, setCommentText] = useState('');
  const storageKey = `vector_blog_comments_${slug}`;
  const [comments, setComments] = useState<CommentItem[]>(() => {
    if (typeof window === 'undefined') {
      return defaultComments;
    }

    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        return JSON.parse(saved) as CommentItem[];
      }
    } catch {
      // fall through to defaults
    }

    return defaultComments;
  });

  const url = typeof window !== 'undefined' ? window.location.href : '';

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(comments));
  }, [comments, storageKey]);

  const handleCopyLink = () => {
    const shareUrl = `${url}?utm_source=share_link`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    const newComment: CommentItem = {
      id: Date.now().toString(),
      author: author.trim() || 'Anonymous Analyst',
      text: commentText.trim(),
      timestamp: 'Just now'
    };

    const updated = [newComment, ...comments];
    setComments(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
    setCommentText('');
  };

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(`${url}?utm_source=twitter&utm_medium=social&utm_campaign=blog_share`)}`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`${url}?utm_source=linkedin&utm_medium=social&utm_campaign=blog_share`)}`;
  const hnUrl = `https://news.ycombinator.com/submitlink?u=${encodeURIComponent(`${url}?utm_source=hackernews&utm_medium=social&utm_campaign=blog_share`)}&t=${encodeURIComponent(title)}`;

  return (
    <div className="mt-16 pt-10 border-t border-slate-800 space-y-10">
      {/* Share Section */}
      <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
        <div>
          <h3 className="text-sm font-bold font-heading text-slate-200 flex items-center gap-2">
            <Share2 size={16} className="text-cyan-400" />
            Share this Analysis
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">Share technical insights with team or peers.</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <a
            href={twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-cyan-400 hover:border-cyan-800/80 transition-all"
          >
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            <span>X / Twitter</span>
          </a>

          <a
            href={linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-cyan-400 hover:border-cyan-800/80 transition-all"
          >
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg>
            <span>LinkedIn</span>
          </a>

          <a
            href={hnUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-orange-400 hover:border-orange-800/80 transition-all"
          >
            <span className="font-bold font-mono text-orange-400 text-xs px-1 bg-orange-950 rounded">Y</span>
            <span>Hacker News</span>
          </a>

          <button
            onClick={handleCopyLink}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-cyan-950/60 border border-cyan-800/80 text-xs font-medium text-cyan-400 hover:bg-cyan-900/60 transition-all cursor-pointer"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            <span>{copied ? 'Copied!' : 'Copy Link'}</span>
          </button>
        </div>
      </div>

      {/* Anonymous Comments Section */}
      <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-8 space-y-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div>
            <h3 className="text-lg font-bold font-heading text-slate-100 flex items-center gap-2">
              <MessageSquare size={18} className="text-cyan-400" />
              <span>Discussion & Comments</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-950 text-cyan-400 border border-cyan-800/60 uppercase">
                No Account Needed
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Share your thoughts anonymously. No registration or profile creation required.
            </p>
          </div>
          <div className="text-xs font-mono text-cyan-400">
            {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
          </div>
        </div>

        {/* Comment Form */}
        <form onSubmit={handleSubmitComment} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="comment-author" className="block text-xs font-medium text-slate-300 mb-1">
                Name / Callsign (Optional)
              </label>
              <input
                type="text"
                id="comment-author"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="e.g. FlightLead_01 or Anonymous Analyst"
                className="w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label htmlFor="comment-text" className="block text-xs font-medium text-slate-300 mb-1">
              Your Feedback / Comment <span className="text-cyan-400">*</span>
            </label>
            <textarea
              id="comment-text"
              rows={3}
              required
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="What are your thoughts on this simulation architecture or model assumption?"
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors resize-none"
            />
          </div>

          <div className="flex items-center justify-between">
            <p className="text-[11px] text-slate-500 flex items-center gap-1">
              <Lock size={12} />
              Stored locally on your browser. No personal data collected.
            </p>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-semibold text-xs shadow-lg shadow-cyan-500/20 hover:brightness-110 transition-all cursor-pointer"
            >
              <Send size={13} />
              <span>Post Anonymous Comment</span>
            </button>
          </div>
        </form>

        {/* Comment List */}
        <div className="space-y-4 pt-4 border-t border-slate-800/60">
          {comments.map((c) => (
            <div key={c.id} className="p-4 rounded-lg bg-slate-900/70 border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-400 flex items-center justify-center font-mono text-[10px] font-bold">
                    {(c.author || 'A')[0].toUpperCase()}
                  </div>
                  <span className="text-xs font-semibold text-slate-200">{c.author || 'Anonymous'}</span>
                </div>
                <span className="text-[11px] font-mono text-slate-500">{c.timestamp}</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed pl-8">{c.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const defaultComments: CommentItem[] = [
  {
    id: 'default-1',
    author: 'TacticalAnalyst_2026',
    text: 'The separation of Model Truth from observer tracks (RASP) is crucial. Leakage of true state into AI agent decision trees is where most commercial wargames lose credibility.',
    timestamp: '2 hours ago'
  }
];
