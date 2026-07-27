import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownProps {
  children: string;
  className?: string;
  isStreaming?: boolean;
}

export function Markdown({ children, className = "", isStreaming = false }: MarkdownProps) {
  // During streaming, skip collider wrapper spans — they're only needed for
  // completed messages (TransitionCanvas cascade animation).
  const wrapCollider = (collider: string, inner: React.ReactNode) => {
    if (isStreaming) return <>{inner}</>;
    return <span data-collider={collider}>{inner}</span>;
  };

  return (
    <div className={`prose prose-sm max-w-none break-words ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => {
            const codeEl = children as React.ReactElement | undefined;
            const codeContent = codeEl?.props?.children;
            const wrappedChildren = typeof codeContent === 'string'
              ? codeContent.split('\n').flatMap((line: string, i: number) => {
                  const el = <span key={i} data-collider="code-line">{line}</span>;
                  return i > 0 ? ['\n', el] : [el];
                })
              : children;
            return (
              <pre className="md-pre-base p-3 overflow-x-auto text-xs my-1">
                {wrappedChildren}
              </pre>
            );
          },
          code: ({ className: codeClass, children, ...props }) => {
            const isInline = !codeClass;
            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 text-xs"
                  style={{
                    borderRadius: "4px",
                    backgroundColor: "var(--color-surface-hover)",
                    color: "var(--color-accent)",
                    fontFamily: "Geist Mono, JetBrains Mono, monospace",
                  }}
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={codeClass} {...props}>
                {children}
              </code>
            );
          },
          p: ({ children }) => <p>{wrapCollider("text-line", children)}</p>,
          li: ({ children }) => <li>{wrapCollider("text-line", children)}</li>,
          blockquote: ({ children }) => <blockquote>{wrapCollider("text-line", children)}</blockquote>,
          h1: ({ children }) => <h1>{wrapCollider("text-line", children)}</h1>,
          h2: ({ children }) => <h2>{wrapCollider("text-line", children)}</h2>,
          h3: ({ children }) => <h3>{wrapCollider("text-line", children)}</h3>,
          h4: ({ children }) => <h4>{wrapCollider("text-line", children)}</h4>,
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table
                className="min-w-full border-collapse text-xs"
                style={{ border: "1px solid var(--color-border)" }}
              >
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th
              data-collider="table-cell"
              className="px-3 py-1.5 text-left font-medium"
              style={{
                border: "1px solid var(--color-border)",
                backgroundColor: "var(--color-surface)",
              }}
            >
              {wrapCollider("text-line", children)}
            </th>
          ),
          td: ({ children }) => (
            <td
              data-collider="table-cell"
              className="px-3 py-1.5"
              style={{ border: "1px solid var(--color-border)" }}
            >
              {wrapCollider("text-line", children)}
            </td>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: "var(--color-accent)" }}
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt ?? "Image"}
              className="max-w-full max-h-[400px] object-contain my-2 cursor-pointer hover:opacity-90 transition-opacity"
              style={{
                borderRadius: "8px",
                border: "1px solid var(--color-border)",
              }}
              loading="lazy"
              onClick={() => src && window.open(src, "_blank")}
            />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
