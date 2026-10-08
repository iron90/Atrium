import { useI18n } from "../../i18n";
import type { GitCommit } from "../../bridge";
import { formatRelative } from "../../shared/format";
import { ScrollArea } from "../../shared/ScrollArea";

export function CommitList({ commits }: { commits: GitCommit[] }) {
  const { language } = useI18n();

  return (
    <ScrollArea viewportClassName="commit-list">
      {commits.map((commit) => (
        <div className="commit-row" key={commit.sha}>
          <span className="commit-dot" />
          <span className="commit-copy">
            <strong>{commit.subject}</strong>
            <span>
              {commit.shortSha} · {commit.author}
            </span>
          </span>
          <time>{formatRelative(commit.timestamp, language)}</time>
        </div>
      ))}
    </ScrollArea>
  );
}
