import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownProps {
  children: string;
  className?: string;
}

export function Markdown({ children, className = "" }: MarkdownProps) {
  return (
    <div className={`prose prose-invert prose-sm max-w-none break-words ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => (
            <pre className="bg-dscode-bg rounded-lg p-3 overflow-x-auto text-xs my-2">
              {children}
            </pre>
          ),
          code: ({ className: codeClass, children, ...props }) => {
            const isInline = !codeClass;
            if (isInline) {
              return (
                <code
                  className="bg-dscode-bg px-1.5 py-0.5 rounded text-xs text-dscode-accent"
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
              <table className="min-w-full border-collapse border border-dscode-border text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-dscode-border px-3 py-1.5 bg-dscode-surface text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-dscode-border px-3 py-1.5">
              {children}
            </td>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-dscode-accent underline hover:text-blue-400"
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt ?? "Image"}
              className="max-w-full max-h-[400px] object-contain rounded-lg border border-dscode-border my-2 cursor-pointer hover:opacity-90 transition-opacity"
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
