type BlogEditorialDiagramProps = {
  src: string;
  alt: string;
  title: string;
  caption: string;
};

export function BlogEditorialDiagram({
  src,
  alt,
  title,
  caption,
}: BlogEditorialDiagramProps) {
  return (
    <figure className="blog-editorial-figure">
      <div className="blog-editorial-viewport">
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${title} at full resolution`}
        >
          {/* The source is a versioned public editorial asset; native rendering also works in Cloudflare. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            width="1536"
            height="1024"
            loading="lazy"
            decoding="async"
          />
        </a>
      </div>
      <figcaption>
        <div>
          <span>Editorial diagram</span>
          <strong>{title}</strong>
          <p>{caption}</p>
        </div>
        <a href={src} target="_blank" rel="noreferrer">
          Open full resolution
        </a>
      </figcaption>
    </figure>
  );
}
