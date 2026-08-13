import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownProps {
  children: string;
  className?: string;
  isStreaming?: boolean;
}

export function Markdown({ children, className = "", isStreaming = false }: MarkdownProps) {
  return (
    <div className={`prose prose-sm max-w-none break-words ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p data-collider="text-block">{children}</p>,
          li: ({ children }) => <li data-collider="text-block">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote data-collider="text-block">{children}</blockquote>
          ),
          h1: ({ children }) => <h1 data-collider="text-block">{children}</h1>,
          h2: ({ children }) => <h2 data-collider="text-block">{children}</h2>,
          h3: ({ children }) => <h3 data-collider="text-block">{children}</h3>,
          h4: ({ children }) => <h4 data-collider="text-block">{children}</h4>,
          pre: ({ children }) => {
            const codeEl = children as React.ReactElement | undefined;
            const codeContent = codeEl?.props?.children;
            const wrappedChildren = !isStreaming && typeof codeContent === 'string'
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
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              data-collider="table-cell"
              className="px-3 py-1.5"
              style={{ border: "1px solid var(--color-border)" }}
            >
              {children}
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
