import type { ReactNode } from "react";
import type { Tokens } from "marked";

type InlineToken = Tokens.Generic & {
  tokens?: InlineToken[];
  text?: string;
  href?: string;
  title?: string | null;
};

type ListItemToken = Tokens.Generic & {
  text: string;
  tokens?: InlineToken[];
};

type TableCellToken = {
  text?: string;
  tokens?: InlineToken[];
};

const ALLOWED_ABSOLUTE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function safeBlogHref(value: string | undefined) {
  const href = value?.trim();
  if (!href) return null;

  if (href.startsWith("#") || href.startsWith("/") && !href.startsWith("//") || href.startsWith("./") || href.startsWith("../")) {
    return href;
  }

  try {
    const url = new URL(href);
    return ALLOWED_ABSOLUTE_LINK_PROTOCOLS.has(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function renderBlogInline(tokens: InlineToken[] | undefined, textIfNoTokens = ""): ReactNode[] {
  if (!tokens) return [textIfNoTokens];

  return tokens.flatMap<ReactNode>((token, index) => {
    const key = `${token.type}-${index}`;
    switch (token.type) {
      case "text":
        return [token.text ?? ""];
      case "strong":
        return [<strong key={key}>{renderBlogInline(token.tokens, token.text ?? "")}</strong>];
      case "em":
        return [<em key={key}>{renderBlogInline(token.tokens, token.text ?? "")}</em>];
      case "del":
        return [<del key={key}>{renderBlogInline(token.tokens, token.text ?? "")}</del>];
      case "codespan":
        return [<code key={key}>{token.text ?? ""}</code>];
      case "br":
        return [<br key={key} />];
      case "link": {
        const href = safeBlogHref(token.href);
        const content = renderBlogInline(token.tokens, token.text ?? "");
        return href
          ? [<a key={key} href={href}>{content}</a>]
          : [<span key={key}>{content}</span>];
      }
      // Raw HTML is deliberately emitted as text. Repository Markdown is content,
      // not an executable template language, and future operator content inherits
      // the same policy.
      case "html":
        return [token.text ?? ""];
      default:
        return [token.text ?? ""];
    }
  });
}

function renderTableCell(cell: TableCellToken, key: string) {
  return <span key={key}>{renderBlogInline(cell.tokens, cell.text ?? "")}</span>;
}

export function renderBlogMarkdown(tokens: Tokens.Generic[]): ReactNode[] {
  return tokens.flatMap<ReactNode>((token, index) => {
    switch (token.type) {
      case "space":
        return [];
      case "hr":
        return [<hr key={`hr-${index}`} />];
      case "heading":
        if (token.depth === 1) return [];
        return token.depth === 2
          ? [<h2 key={`h2-${index}`}>{renderBlogInline(token.tokens as InlineToken[], token.text)}</h2>]
          : [<h3 key={`h3-${index}`}>{renderBlogInline(token.tokens as InlineToken[], token.text)}</h3>];
      case "paragraph":
        return [<p key={`p-${index}`}>{renderBlogInline(token.tokens as InlineToken[], token.text)}</p>];
      case "blockquote":
        return [<blockquote key={`blockquote-${index}`}>{renderBlogMarkdown(token.tokens as Tokens.Generic[])}</blockquote>];
      case "list": {
        const content = token.items.map((item: ListItemToken, itemIndex: number) => (
          <li key={`li-${index}-${itemIndex}`}>{renderBlogInline(item.tokens, item.text)}</li>
        ));
        return token.ordered
          ? [<ol key={`ol-${index}`}>{content}</ol>]
          : [<ul key={`ul-${index}`}>{content}</ul>];
      }
      case "table":
        return [
          <div key={`table-wrap-${index}`} className="blog-post-table-wrap">
            <table className="blog-post-table">
              <thead>
                <tr>
                  {token.header.map((cell: TableCellToken, cellIndex: number) => (
                    <th key={`th-${index}-${cellIndex}`}>{renderTableCell(cell, `thc-${cellIndex}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {token.rows.map((row: TableCellToken[], rowIndex: number) => (
                  <tr key={`row-${index}-${rowIndex}`}>
                    {row.map((cell: TableCellToken, cellIndex: number) => (
                      <td key={`td-${index}-${rowIndex}-${cellIndex}`}>
                        {renderTableCell(cell, `tdc-${rowIndex}-${cellIndex}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        ];
      default:
        return [];
    }
  });
}
